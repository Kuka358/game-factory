import {
    execFile
} from "node:child_process";

import {
    randomUUID
} from "node:crypto";

import {
    mkdir
} from "node:fs/promises";

import {
    isAbsolute,
    join,
    relative,
    resolve
} from "node:path";

import {
    promisify
} from "node:util";

import type {
    IterationScope
} from "./contracts.js";

import {
    WorkspaceGuard,
    normalizeRepositoryPath
} from "./workspace.js";


const execFileAsync =
    promisify(
        execFile
    );


export interface GitWorktreeRef {
    id:
        string;

    path:
        string;

    headSha:
        string;
}


export interface GitWorktreeChanges {
    changedFiles:
        readonly string[];
}


export interface GitWorktreeManagerOptions {
    repositoryRoot:
        string;

    worktreesDirectory?:
        string;
}


export class GitWorktreeManager {
    private readonly repositoryRoot:
        string;

    private readonly worktreesDirectory:
        string;

    private readonly workspaceGuard =
        new WorkspaceGuard();


    constructor(
        options:
            GitWorktreeManagerOptions
    ) {
        this.repositoryRoot =
            resolve(
                options.repositoryRoot
            );

        this.worktreesDirectory =
            resolve(
                options.worktreesDirectory ??
                join(
                    this.repositoryRoot,
                    ".game-factory",
                    "autonomy",
                    "worktrees"
                )
            );

        assertInsideDirectory(
            this.repositoryRoot,
            this.worktreesDirectory
        );
    }


    async create(
        runId:
            string,

        iterationId:
            string,

        attempt:
            number
    ): Promise<GitWorktreeRef> {
        await this.assertRepositoryRoot();

        if (
            !Number.isInteger(
                attempt
            ) ||
            attempt <= 0
        ) {
            throw new Error(
                "Worktree attempt must be a positive integer"
            );
        }

        const headSha =
            (
                await this.runGit(
                    this.repositoryRoot,
                    [
                        "rev-parse",
                        "HEAD"
                    ]
                )
            ).trim();

        const id =
            [
                sanitizeSegment(
                    runId
                ),
                sanitizeSegment(
                    iterationId
                ),
                `attempt-${attempt}`,
                randomUUID()
            ].join(
                "-"
            );

        const path =
            resolve(
                this.worktreesDirectory,
                id
            );

        assertInsideDirectory(
            this.worktreesDirectory,
            path
        );

        await mkdir(
            this.worktreesDirectory,
            {
                recursive:
                    true
            }
        );

        await this.runGit(
            this.repositoryRoot,
            [
                "worktree",
                "add",
                "--detach",
                path,
                headSha
            ]
        );

        return {
            id,
            path,
            headSha
        };
    }


    async collectChanges(
        worktree:
            GitWorktreeRef
    ): Promise<GitWorktreeChanges> {
        this.assertManagedWorktree(
            worktree
        );

        const currentHead =
            (
                await this.runGit(
                    worktree.path,
                    [
                        "rev-parse",
                        "HEAD"
                    ]
                )
            ).trim();

        if (
            currentHead !==
            worktree.headSha
        ) {
            throw new Error(
                `Isolated worktree HEAD changed from ${worktree.headSha} to ${currentHead}`
            );
        }

        const trackedRaw =
            await this.runGit(
                worktree.path,
                [
                    "diff",
                    "--name-only",
                    "-z",
                    "--no-renames",
                    "HEAD",
                    "--"
                ]
            );

        const untrackedRaw =
            await this.runGit(
                worktree.path,
                [
                    "ls-files",
                    "--others",
                    "--exclude-standard",
                    "-z",
                    "--"
                ]
            );

        const changedFiles =
            deduplicatePaths([
                ...parseNullSeparatedPaths(
                    trackedRaw
                ),

                ...parseNullSeparatedPaths(
                    untrackedRaw
                )
            ]);

        return {
            changedFiles
        };
    }


    async assertChangesAllowed(
        worktree:
            GitWorktreeRef,

        scope:
            IterationScope
    ): Promise<GitWorktreeChanges> {
        const changes =
            await this.collectChanges(
                worktree
            );

        for (
            const path of
            changes.changedFiles
        ) {
            await this.workspaceGuard
                .assertPathAllowed(
                    path,
                    scope
                );
        }

        return changes;
    }


    async remove(
        worktree:
            GitWorktreeRef
    ): Promise<void> {
        this.assertManagedWorktree(
            worktree
        );

        await this.runGit(
            this.repositoryRoot,
            [
                "worktree",
                "remove",
                "--force",
                worktree.path
            ]
        );
    }


    private assertManagedWorktree(
        worktree:
            GitWorktreeRef
    ): void {
        const path =
            resolve(
                worktree.path
            );

        assertInsideDirectory(
            this.worktreesDirectory,
            path
        );
    }


    private async assertRepositoryRoot():
        Promise<void>
    {
        const actualRoot =
            (
                await this.runGit(
                    this.repositoryRoot,
                    [
                        "rev-parse",
                        "--show-toplevel"
                    ]
                )
            ).trim();

        if (
            !samePath(
                actualRoot,
                this.repositoryRoot
            )
        ) {
            throw new Error(
                `GitWorktreeManager repositoryRoot must be the repository root: expected ${actualRoot}, received ${this.repositoryRoot}`
            );
        }
    }


    private async runGit(
        cwd:
            string,

        args:
            readonly string[]
    ): Promise<string> {
        try {
            const result =
                await execFileAsync(
                    "git",
                    [
                        ...args
                    ],
                    {
                        cwd,

                        encoding:
                            "utf8",

                        windowsHide:
                            true
                    }
                );

            return String(
                result.stdout
            );
        } catch (error) {
            const stderr =
                isExecFileError(
                    error
                )
                    ? String(
                        error.stderr ??
                        ""
                    ).trim()
                    : "";

            throw new Error(
                `Git command failed: git ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`,
                {
                    cause:
                        error
                }
            );
        }
    }
}


function parseNullSeparatedPaths(
    value:
        string
): string[] {
    return value
        .split(
            "\0"
        )
        .filter(
            path =>
                path.length >
                0
        )
        .map(
            path =>
                normalizeRepositoryPath(
                    path
                )
        );
}


function deduplicatePaths(
    paths:
        readonly string[]
): string[] {
    return [
        ...new Set(
            paths
        )
    ];
}


function sanitizeSegment(
    value:
        string
): string {
    const sanitized =
        value
            .trim()
            .replace(
                /[^A-Za-z0-9._-]+/g,
                "-"
            )
            .replace(
                /^[-.]+|[-.]+$/g,
                ""
            );

    return sanitized.length >
        0
        ? sanitized
        : "unknown";
}


function assertInsideDirectory(
    directory:
        string,

    path:
        string
): void {
    const parent =
        resolve(
            directory
        );

    const target =
        resolve(
            path
        );

    const relativePath =
        relative(
            parent,
            target
        );

    if (
        relativePath ===
            "" ||
        relativePath.startsWith(
            ".."
        ) ||
        isAbsolute(
            relativePath
        )
    ) {
        throw new Error(
            `Path must be inside managed directory: ${target}`
        );
    }
}


function samePath(
    first:
        string,

    second:
        string
): boolean {
    const normalizedFirst =
        resolve(
            first
        );

    const normalizedSecond =
        resolve(
            second
        );

    if (
        process.platform ===
        "win32"
    ) {
        return (
            normalizedFirst
                .toLowerCase() ===
            normalizedSecond
                .toLowerCase()
        );
    }

    return normalizedFirst ===
        normalizedSecond;
}


function isExecFileError(
    value:
        unknown
): value is Error & {
    stderr?:
        string;
} {
    return value instanceof
        Error;
}