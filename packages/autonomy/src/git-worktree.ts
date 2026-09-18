import {
    execFile
} from "node:child_process";

import {
    createHash,
    randomUUID
} from "node:crypto";

import {
    mkdir,
    readFile,
    rm,
    writeFile
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

export interface GitWorktreeSnapshot
    extends GitWorktreeChanges
{
    digest:
        string;
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
        const snapshot =
            await this.snapshotChanges(
                worktree
            );

        return {
            changedFiles:
                snapshot.changedFiles
        };
    }


    async assertChangesAllowed(
        worktree:
            GitWorktreeRef,

        scope:
            IterationScope
    ): Promise<GitWorktreeChanges> {
        const snapshot =
            await this.snapshotAllowedChanges(
                worktree,
                scope
            );

        return {
            changedFiles:
                snapshot.changedFiles
        };
    }

    async promote(
        worktree:
            GitWorktreeRef,

        scope:
            IterationScope,

        expectedDigest:
            string
    ): Promise<GitWorktreeChanges> {
        await this.assertRepositoryRoot();

        this.assertManagedWorktree(
            worktree
        );

        const mainHead =
            (
                await this.runGit(
                    this.repositoryRoot,
                    [
                        "rev-parse",
                        "HEAD"
                    ]
                )
            ).trim();

        if (
            mainHead !==
            worktree.headSha
        ) {
            throw new Error(
                `Cannot promote isolated worktree: repository HEAD changed from ${worktree.headSha} to ${mainHead}`
            );
        }

        const snapshot =
            await this.snapshotAllowedChanges(
                worktree,
                scope
            );

        if (
            snapshot.digest !==
            expectedDigest
        ) {
            throw new Error(
                "Cannot promote isolated worktree: changeset changed after verification"
            );
        }

        const mainChanges =
            await this.collectChangesAt(
                this.repositoryRoot
            );

        const dirtyScope =
            mainChanges.changedFiles
                .filter(
                    path =>
                        this.isPathAllowed(
                            path,
                            scope
                        )
                );

        if (
            dirtyScope.length >
            0
        ) {
            throw new Error(
                `Cannot promote isolated worktree: main iteration scope is dirty: ${dirtyScope.join(", ")}`
            );
        }

        if (
            snapshot.changedFiles.length ===
            0
        ) {
            return {
                changedFiles:
                    []
            };
        }

        /*
        * This worktree has its own index, so staging here does not
        * stage anything in the user's main working tree.
        */
        await this.runGit(
            worktree.path,
            [
                "add",
                "-A",
                "--"
            ]
        );

        const patch =
            await this.runGit(
                worktree.path,
                [
                    "diff",
                    "--cached",
                    "--binary",
                    "--full-index",
                    "HEAD",
                    "--"
                ]
            );

        const patchPath =
            join(
                this.worktreesDirectory,
                `.promotion-${randomUUID()}.patch`
            );

        await writeFile(
            patchPath,
            patch,
            "utf8"
        );

        try {
            await this.runGit(
                this.repositoryRoot,
                [
                    "apply",
                    "--check",
                    "--binary",
                    patchPath
                ]
            );

            await this.runGit(
                this.repositoryRoot,
                [
                    "apply",
                    "--binary",
                    patchPath
                ]
            );
        } finally {
            await rm(
                patchPath,
                {
                    force:
                        true
                }
            );
        }

        return {
            changedFiles:
                snapshot.changedFiles
        };
    }


    async remove(
        worktree:
            GitWorktreeRef
    ): Promise<void> {
        this.assertManagedWorktree(
            worktree
        );

        const registered =
            await this.isRegisteredWorktree(
                worktree.path
            );

        if (!registered) {
            await rm(
                worktree.path,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

            return;
        }

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

    async snapshotAllowedChanges(
        worktree:
            GitWorktreeRef,

        scope:
            IterationScope
    ): Promise<GitWorktreeSnapshot> {
        const snapshot =
            await this.snapshotChanges(
                worktree
            );

        for (
            const path of
            snapshot.changedFiles
        ) {
            await this.workspaceGuard
                .assertPathAllowed(
                    path,
                    scope
                );
        }

        return snapshot;
    }

    async snapshotChanges(
        worktree:
            GitWorktreeRef
    ): Promise<GitWorktreeSnapshot> {
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

        const tracked =
            parseNullSeparatedPaths(
                trackedRaw
            );

        const untracked =
            parseNullSeparatedPaths(
                untrackedRaw
            );

        const changedFiles =
            deduplicatePaths([
                ...tracked,
                ...untracked
            ]);

        const trackedPatch =
            await this.runGit(
                worktree.path,
                [
                    "diff",
                    "--binary",
                    "--full-index",
                    "HEAD",
                    "--"
                ]
            );

        const hash =
            createHash(
                "sha256"
            );

        hash.update(
            "tracked\0"
        );

        hash.update(
            trackedPatch
        );

        for (
            const path of
            [...untracked].sort()
        ) {
            const absolute =
                resolve(
                    worktree.path,
                    path
                );

            assertInsideDirectory(
                worktree.path,
                absolute
            );

            hash.update(
                "\0untracked\0"
            );

            hash.update(
                path
            );

            hash.update(
                "\0"
            );

            hash.update(
                await readFile(
                    absolute
                )
            );
        }

        return {
            changedFiles,

            digest:
                hash.digest(
                    "hex"
                )
        };
    }

    private async collectChangesAt(
        cwd:
            string
    ): Promise<GitWorktreeChanges> {
        const trackedRaw =
            await this.runGit(
                cwd,
                [
                    "diff",
                    "--name-only",
                    "-z",
                    "HEAD",
                    "--"
                ]
            );

        const untrackedRaw =
            await this.runGit(
                cwd,
                [
                    "ls-files",
                    "--others",
                    "--exclude-standard",
                    "-z",
                    "--"
                ]
            );

        return {
            changedFiles:
                deduplicatePaths([
                    ...parseNullSeparatedPaths(
                        trackedRaw
                    ),

                    ...parseNullSeparatedPaths(
                        untrackedRaw
                    )
                ])
        };
    }


    private isPathAllowed(
        path:
            string,

        scope:
            IterationScope
    ): boolean {
        try {
            this.workspaceGuard
                .assertPathAllowed(
                    path,
                    scope
                );

            return true;
        } catch {
            return false;
        }
    }

    private async isRegisteredWorktree(
        path:
            string
    ): Promise<boolean> {
        const raw =
            await this.runGit(
                this.repositoryRoot,
                [
                    "worktree",
                    "list",
                    "--porcelain"
                ]
            );

        const expected =
            resolve(
                path
            );

        return raw
            .split(
                /\r?\n/
            )
            .filter(
                line =>
                    line.startsWith(
                        "worktree "
                    )
            )
            .some(
                line =>
                    samePath(
                        line.slice(
                            "worktree ".length
                        ),
                        expected
                    )
            );
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