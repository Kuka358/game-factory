
import { execFile } from "node:child_process";
import {
    afterEach,
    describe,
    expect,
    it
} from "vitest";
import {
    mkdir,
    mkdtemp,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
    createAutonomousRun,
    FileRunStore,
    type IterationContract
} from "@game-factory/autonomy";

import type {
    TaskGraph
} from "../src/contracts/TaskGraph.js";

import {
    TaskGraphProgressRecovery
} from "../src/autonomy/TaskGraphProgressRecovery.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

const graph: TaskGraph = {
    schemaVersion: "1.0",
    blueprintId: "breakout",
    revision: 1,
    tasks: [{
        id: "foundation",
        title: "Create foundation",
        objective: "Create game foundation",
        dependsOn: [],
        allowedPaths: [
            "src/game/constants.ts"
        ],
        readPaths: ["package.json"],
        interfaces: [],
        acceptance: ["Constants created"],
        checks: ["tsc", "vite"],
        estimatedComplexity: "small",
        maxLocalAttempts: 2
    }]
};

async function git(
    root: string,
    ...args: string[]
): Promise<string> {
    const { stdout } = await execFileAsync(
        "git",
        args,
        {
            cwd: root,
            encoding: "utf8",
            windowsHide: true
        }
    );

    return stdout.trim();
}

async function fixture() {
    const root = await mkdtemp(
        join(tmpdir(), "freeform-progress-")
    );

    temporaryDirectories.push(root);

    await git(root, "init", "-q", "--initial-branch=main");

    await mkdir(join(root, "src", "game"), {
        recursive: true
    });

    await writeFile(
        join(root, "src", "main.ts"),
        "export const ready = true;\n"
    );

    await git(root, "add", ".");

    await git(
        root,
        "-c", "user.name=Game Factory",
        "-c", "user.email=game-factory@localhost",
        "-c", "commit.gpgsign=false",
        "commit", "-m", "bootstrap"
    );

    const base = await git(root, "rev-parse", "HEAD");

    await writeFile(
        join(root, "src", "game", "constants.ts"),
        "export const WIDTH = 800;\n"
    );

    await git(root, "add", "src/game/constants.ts");

    await git(
        root,
        "-c", "user.name=Game Factory",
        "-c", "user.email=game-factory@localhost",
        "-c", "commit.gpgsign=false",
        "commit",
        "-m", "autonomy: foundation",
        "-m", [
            "Game-Factory-Accept: acceptance-1",
            "Game-Factory-Digest: digest-1",
            `Game-Factory-Base: ${base}`
        ].join("\n")
    );

    const acceptedRevision =
        await git(root, "rev-parse", "HEAD");

    const contract: IterationContract = {
        id: "foundation",
        objective: "Create game foundation",
        rationale: "Create foundation",
        scope: {
            allowedPaths: ["src/game/constants.ts"],
            forbiddenPaths: []
        },
        changes: [{
            description: "Create constants"
        }],
        acceptanceCriteria: ["Constants created"],
        verification: [
            {
                id: "foundation-tsc",
                command: "verify:tsc",
                required: true
            },
            {
                id: "foundation-vite",
                command: "verify:vite",
                required: true
            }
        ],
        architecturalConstraints: [],
        maxLocalAttempts: 2,
        escalation: {
            onRepeatedFailure: true,
            onArchitectureConflict: true,
            maxRepairRounds: 1
        }
    };

    const run = createAutonomousRun({
        id: "foundation-run",
        goal: "Create Breakout",
        maxIterations: 1
    });

    run.status = "completed";
    run.currentIteration = 1;

    run.iterations.push({
        contract,
        completed: true,
        attempts: [{
            attempt: 1,
            startedAt: new Date().toISOString(),
            verification: {
                passed: true,
                checks: [
                    {
                        id: "foundation-tsc",
                        command: "verify:tsc",
                        passed: true
                    },
                    {
                        id: "foundation-vite",
                        command: "verify:vite",
                        passed: true
                    }
                ]
            }
        }],
        acceptance: {
            id: "acceptance-1",
            status: "accepted",
            attempt: 1,
            baseRevision: base,
            digest: "digest-1",
            changedFiles: ["src/game/constants.ts"],
            createdAt: new Date().toISOString(),
            acceptedRevision
        }
    });

    const store = new FileRunStore({
        directory: join(
            root,
            ".game-factory",
            "autonomy",
            "runs"
        )
    });

    await store.save(run);

    const recovery = new TaskGraphProgressRecovery({
        repositoryRoot: root,
        graph
    });

    return {
        root,
        base,
        acceptedRevision,
        run,
        store,
        recovery
    };
}

afterEach(async () => {
    for (const root of temporaryDirectories.splice(0)) {
        await rm(root, {
            recursive: true,
            force: true
        });
    }
});

describe("TaskGraphProgressRecovery", () => {
    it("recovers a verified accepted task", async () => {
        const f = await fixture();

        const progress = await f.recovery.recover();

        expect(progress.head).toBe(f.acceptedRevision);

        expect(progress.completedTasks).toEqual([{
            taskId: "foundation",
            runId: "foundation-run",
            acceptedRevision: f.acceptedRevision
        }]);
    });

    it("does not recover commits outside current history", async () => {
        const f = await fixture();

        await git(f.root, "reset", "--hard", f.base);

        const progress = await f.recovery.recover();

        expect(progress.completedTasks).toEqual([]);
    });

    it("rejects mismatched Verified Commit metadata", async () => {
        const f = await fixture();

        f.run.iterations[0]!.acceptance!.digest =
            "tampered-digest";

        await f.store.save(f.run);

        await expect(
            f.recovery.recover()
        ).rejects.toThrow(
            "Invalid Verified Commit metadata"
        );
    });

    it("rejects an acceptance without passing checks", async () => {
        const f = await fixture();

        f.run.iterations[0]!.attempts[0]!
            .verification!.passed = false;

        await f.store.save(f.run);

        await expect(
            f.recovery.recover()
        ).rejects.toThrow(
            "Missing successful verification"
        );
    });
});
