
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import type {
    AutonomousRun,
    IterationRecord
} from "@game-factory/autonomy";

import type {
    ImplementationTask,
    TaskGraph
} from "../contracts/TaskGraph.js";

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/;

export interface TaskGraphProgressRecoveryOptions {
    repositoryRoot: string;
    graph: TaskGraph;
    runsDirectory?: string;
}

export interface RecoveredTask {
    taskId: string;
    runId: string;
    acceptedRevision: string;
}

export interface RecoveredTaskGraphProgress {
    head: string;
    completedTasks: RecoveredTask[];
}

export class TaskGraphProgressRecovery {
    private readonly root: string;
    private readonly runsDirectory: string;
    private readonly tasks: Map<string, ImplementationTask>;

    constructor(options: TaskGraphProgressRecoveryOptions) {
        if (!isAbsolute(options.repositoryRoot)) {
            throw new Error("repositoryRoot must be absolute");
        }

        this.root = options.repositoryRoot;

        this.runsDirectory = options.runsDirectory ??
            join(
                this.root,
                ".game-factory",
                "autonomy",
                "runs"
            );

        this.tasks = new Map(
            options.graph.tasks.map(task => [task.id, task])
        );

        if (this.tasks.size !== options.graph.tasks.length) {
            throw new Error("Duplicate TaskGraph task IDs");
        }
    }

    async recover(): Promise<RecoveredTaskGraphProgress> {
        const head = (
            await this.git(["rev-parse", "HEAD"])
        ).trim();

        let filenames: string[];

        try {
            const entries = await readdir(
                this.runsDirectory,
                { withFileTypes: true }
            );

            filenames = entries
                .filter(entry =>
                    entry.isFile() &&
                    entry.name.endsWith(".json")
                )
                .map(entry => entry.name)
                .sort();
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code ===
                "ENOENT"
            ) {
                return { head, completedTasks: [] };
            }

            throw error;
        }

        const accepted = new Map<string, RecoveredTask>();

        for (const filename of filenames) {
            const raw = await readFile(
                join(this.runsDirectory, filename),
                "utf8"
            );

            const run = parseRun(raw, filename);

            for (const iteration of run.iterations) {
                if (
                    !iteration.completed ||
                    iteration.acceptance?.status !== "accepted"
                ) {
                    continue;
                }

                const task = this.tasks.get(
                    iteration.contract.id
                );

                if (!task) {
                    continue;
                }

                const acceptance = iteration.acceptance;
                const revision = acceptance.acceptedRevision;

                if (!revision || !SHA.test(revision)) {
                    throw new Error(
                        `Invalid accepted revision for ${task.id}`
                    );
                }

                // A commit from another branch must not mark a task
                // as completed in the current game history.
                if (
                    !await this.isAncestor(revision, head)
                ) {
                    continue;
                }

                if (
                    iteration.contract.objective !== task.objective ||
                    !sameStrings(
                        iteration.contract.scope.allowedPaths,
                        task.allowedPaths
                    )
                ) {
                    throw new Error(
                        `Accepted contract differs from TaskGraph: ${task.id}`
                    );
                }

                const expectedChecks = task.checks.map(
                    check => `verify:${check}`
                );

                const contractChecks =
                    iteration.contract.verification;

                if (
                    !sameStrings(
                        contractChecks.map(check => check.command),
                        expectedChecks
                    ) ||
                    contractChecks.some(check => !check.required)
                ) {
                    throw new Error(
                        `Accepted verification contract mismatch: ${task.id}`
                    );
                }

                const attempt = iteration.attempts.find(
                    item => item.attempt === acceptance.attempt
                );

                if (
                    !attempt?.verification?.passed ||
                    !expectedChecks.every(command =>
                        attempt.verification!.checks.some(
                            check =>
                                check.command === command &&
                                check.passed
                        )
                    )
                ) {
                    throw new Error(
                        `Missing successful verification: ${task.id}`
                    );
                }

                await this.verifyAcceptedCommit(
                    iteration,
                    revision
                );

                const previous = accepted.get(task.id);

                if (
                    previous &&
                    previous.acceptedRevision !== revision
                ) {
                    throw new Error(
                        `Conflicting accepted revisions for ${task.id}`
                    );
                }

                accepted.set(task.id, {
                    taskId: task.id,
                    runId: run.id,
                    acceptedRevision: revision
                });
            }
        }

        return {
            head,
            completedTasks: [
                ...accepted.values()
            ]
        };
    }

    private async verifyAcceptedCommit(
        iteration: IterationRecord,
        revision: string
    ): Promise<void> {
        const acceptance = iteration.acceptance!;

        const parent = (
            await this.git([
                "rev-parse",
                `${revision}^`
            ])
        ).trim();

        if (parent !== acceptance.baseRevision) {
            throw new Error(
                `Accepted commit parent mismatch: ${revision}`
            );
        }

        const message = await this.git([
            "show",
            "-s",
            "--format=%B",
            revision
        ]);

        const lines = message
            .split(/\r?\n/)
            .map(line => line.trim());

        const trailers = [
            `Game-Factory-Accept: ${acceptance.id}`,
            `Game-Factory-Digest: ${acceptance.digest}`,
            `Game-Factory-Base: ${acceptance.baseRevision}`
        ];

        if (!trailers.every(line => lines.includes(line))) {
            throw new Error(
                `Invalid Verified Commit metadata: ${revision}`
            );
        }

        const actualFiles = (
            await this.git([
                "diff",
                "--name-only",
                "-z",
                acceptance.baseRevision,
                revision,
                "--"
            ])
        ).split("\0").filter(Boolean);

        if (
            !sameStrings(
                actualFiles,
                acceptance.changedFiles
            )
        ) {
            throw new Error(
                `Accepted file list mismatch: ${revision}`
            );
        }
    }

    private async isAncestor(
        revision: string,
        head: string
    ): Promise<boolean> {
        try {
            await this.git([
                "merge-base",
                "--is-ancestor",
                revision,
                head
            ]);

            return true;
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === 1
            ) {
                return false;
            }

            // Any other Git failure must propagate.
            throw error;
        }
    }


    private async git(args: string[]): Promise<string> {
        const { stdout } = await execFileAsync(
            "git",
            [
                ...(process.platform === "win32"
                    ? ["-c", "core.longpaths=true"]
                    : []),
                ...args
            ],
            {
                cwd: this.root,
                encoding: "utf8",
                windowsHide: true,
                timeout: 30_000
            }
        );

        return stdout;
    }
}

function parseRun(
    raw: string,
    filename: string
): AutonomousRun {
    const value: unknown = JSON.parse(raw);

    if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        typeof value.id !== "string" ||
        !("iterations" in value) ||
        !Array.isArray(value.iterations)
    ) {
        throw new Error(`Invalid run snapshot: ${filename}`);
    }

    return value as unknown as AutonomousRun;
}

function sameStrings(
    left: readonly string[],
    right: readonly string[]
): boolean {
    return (
        JSON.stringify([...left].sort()) ===
        JSON.stringify([...right].sort())
    );
}
