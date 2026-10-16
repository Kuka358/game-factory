import {
    execFile
} from "node:child_process";

import {
    randomUUID
} from "node:crypto";

import {
    mkdir,
    readFile,
    rename,
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

import type {
    CheckpointManager,
    CheckpointRef
} from "./providers.js";

import {
    encodeStorageKey
} from "./storage.js";

import {
    WorkspaceGuard,
    normalizeRepositoryPath
} from "./workspace.js";


const execFileAsync =
    promisify(
        execFile
    );


interface GitCheckpointMetadata {
    version:
        1;

    id:
        string;

    runId:
        string;

    iterationId:
        string;

    repositoryRoot:
        string;

    headSha:
        string;

    scope:
        IterationScope;

    createdAt:
        string;
}


interface GitChanges {
    tracked:
        readonly string[];

    untracked:
        readonly string[];
}


export interface GitCheckpointManagerOptions {
    repositoryRoot:
        string;

    metadataDirectory?:
        string;

    now?:
        () => string;
}


export class GitCheckpointManager
    implements CheckpointManager
{
    private readonly repositoryRoot:
        string;

    private readonly metadataDirectory:
        string;

    private readonly now:
        () => string;

    private readonly workspaceGuard =
        new WorkspaceGuard();


    constructor(
        options:
            GitCheckpointManagerOptions
    ) {
        this.repositoryRoot =
            resolve(
                options.repositoryRoot
            );

        this.metadataDirectory =
            resolve(
                options.metadataDirectory ??
                join(
                    this.repositoryRoot,
                    ".game-factory",
                    "autonomy",
                    "checkpoints"
                )
            );

        this.now =
            options.now ??
            (() =>
                new Date()
                    .toISOString());
    }


    async create(
        runId:
            string,

        iterationId:
            string,

        scope:
            IterationScope
    ): Promise<CheckpointRef> {
        await this.assertRepositoryRoot();

        if (
            scope.allowedPaths.length ===
            0
        ) {
            throw new Error(
                "Cannot create git checkpoint without allowed paths"
            );
        }

        const changes =
            await this.collectChanges();

        const dirtyScopePaths =
            [
                ...changes.tracked,
                ...changes.untracked
            ].filter(
                path =>
                    this.isPathInScope(
                        path,
                        scope
                    )
            );

        if (
            dirtyScopePaths.length >
            0
        ) {
            throw new Error(
                `Cannot create git checkpoint: iteration scope is not clean: ${dirtyScopePaths.join(", ")}`
            );
        }

        const headSha =
            (
                await this.runGit([
                    "rev-parse",
                    "HEAD"
                ])
            ).trim();

        const id =
            `git:${randomUUID()}`;

        const metadata:
            GitCheckpointMetadata = {
                version:
                    1,

                id,

                runId,

                iterationId,

                repositoryRoot:
                    this.repositoryRoot,

                headSha,

                scope: {
                    allowedPaths: [
                        ...scope.allowedPaths
                    ],

                    forbiddenPaths: [
                        ...scope.forbiddenPaths
                    ]
                },

                createdAt:
                    this.now()
            };

        await this.writeMetadata(
            metadata
        );

        return {
            id
        };
    }


    async restore(
        checkpoint:
            CheckpointRef
    ): Promise<void> {
        const metadata =
            await this.readMetadata(
                checkpoint.id
            );

        await this.assertRepositoryRoot();

        if (
            !samePath(
                metadata.repositoryRoot,
                this.repositoryRoot
            )
        ) {
            throw new Error(
                `Cannot restore git checkpoint ${checkpoint.id}: repository root does not match`
            );
        }

        const currentHead =
            (
                await this.runGit([
                    "rev-parse",
                    "HEAD"
                ])
            ).trim();

        if (
            currentHead !==
            metadata.headSha
        ) {
            throw new Error(
                `Cannot restore git checkpoint ${checkpoint.id}: HEAD changed from ${metadata.headSha} to ${currentHead}`
            );
        }

        const changes =
            await this.collectChanges();

        const tracked =
            changes.tracked.filter(
                path =>
                    this.isPathInScope(
                        path,
                        metadata.scope
                    )
            );

        const untracked =
            changes.untracked.filter(
                path =>
                    this.isPathInScope(
                        path,
                        metadata.scope
                    )
            );

        if (
            tracked.length >
            0
        ) {
            await this.restoreTrackedPaths(
                metadata.headSha,
                tracked
            );
        }

        for (
            const path of untracked
        ) {
            await this.removeUntrackedPath(
                path
            );
        }

        const remaining =
            await this.collectChanges();

        const remainingScoped =
            [
                ...remaining.tracked,
                ...remaining.untracked
            ].filter(
                path =>
                    this.isPathInScope(
                        path,
                        metadata.scope
                    )
            );

        if (
            remainingScoped.length >
            0
        ) {
            throw new Error(
                `Git checkpoint restore did not clean iteration scope: ${remainingScoped.join(", ")}`
            );
        }
    }


    async release(
        checkpoint:
            CheckpointRef
    ): Promise<void> {
        await rm(
            this.getMetadataPath(
                checkpoint.id
            ),
            {
                force:
                    true
            }
        );
    }


    private async assertRepositoryRoot():
        Promise<void>
    {
        const actualRoot =
            (
                await this.runGit([
                    "rev-parse",
                    "--show-toplevel"
                ])
            ).trim();

        if (
            !samePath(
                actualRoot,
                this.repositoryRoot
            )
        ) {
            throw new Error(
                `GitCheckpointManager repositoryRoot must be the repository root: expected ${actualRoot}, received ${this.repositoryRoot}`
            );
        }
    }


    private async collectChanges():
        Promise<GitChanges>
    {
        const trackedRaw =
            await this.runGit([
                "diff",
                "--name-only",
                "-z",
                "HEAD",
                "--"
            ]);

        const untrackedRaw =
            await this.runGit([
                "ls-files",
                "--others",
                "--exclude-standard",
                "-z",
                "--"
            ]);

        return {
            tracked:
                parseNullSeparatedPaths(
                    trackedRaw
                ),

            untracked:
                parseNullSeparatedPaths(
                    untrackedRaw
                )
        };
    }


    private isPathInScope(
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


    private async restoreTrackedPaths(
        headSha:
            string,

        paths:
            readonly string[]
    ): Promise<void> {
        for (
            const pathGroup of chunk(
                paths,
                100
            )
        ) {
            await this.runGit([
                "restore",
                `--source=${headSha}`,
                "--staged",
                "--worktree",
                "--",
                ...pathGroup
            ]);
        }
    }


    private async removeUntrackedPath(
        path:
            string
    ): Promise<void> {
        const normalized =
            normalizeRepositoryPath(
                path
            );

        const absolute =
            resolve(
                this.repositoryRoot,
                normalized
            );

        assertInsideRepository(
            this.repositoryRoot,
            absolute
        );

        await rm(
            absolute,
            {
                recursive:
                    true,

                force:
                    true
            }
        );
    }


    private async writeMetadata(
        metadata:
            GitCheckpointMetadata
    ): Promise<void> {
        await mkdir(
            this.metadataDirectory,
            {
                recursive:
                    true
            }
        );

        const target =
            this.getMetadataPath(
                metadata.id
            );

        const temporary =
            `${target}.${process.pid}.${Date.now()}.tmp`;

        await writeFile(
            temporary,
            `${JSON.stringify(
                metadata,
                null,
                2
            )}\n`,
            "utf8"
        );

        await rename(
            temporary,
            target
        );
    }


    private async readMetadata(
        checkpointId:
            string
    ): Promise<GitCheckpointMetadata> {
        let raw:
            string;

        try {
            raw =
                await readFile(
                    this.getMetadataPath(
                        checkpointId
                    ),
                    "utf8"
                );
        } catch (error) {
            if (
                isNodeError(
                    error
                ) &&
                error.code ===
                    "ENOENT"
            ) {
                throw new Error(
                    `Git checkpoint metadata not found: ${checkpointId}`
                );
            }

            throw error;
        }

        let value:
            unknown;

        try {
            value =
                JSON.parse(
                    raw
                );
        } catch {
            throw new Error(
                `Invalid git checkpoint metadata JSON: ${checkpointId}`
            );
        }

        if (
            !isGitCheckpointMetadata(
                value
            )
        ) {
            throw new Error(
                `Invalid git checkpoint metadata: ${checkpointId}`
            );
        }

        return value;
    }


    private getMetadataPath(
        checkpointId:
            string
    ): string {
        return join(
            this.metadataDirectory,
            `${encodeStorageKey(
                checkpointId
            )}.json`
        );
    }


    private async runGit(
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
                        cwd:
                            this.repositoryRoot,

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


function chunk<T>(
    values:
        readonly T[],

    size:
        number
): T[][] {
    const result:
        T[][] = [];

    for (
        let index = 0;
        index <
            values.length;
        index += size
    ) {
        result.push(
            values.slice(
                index,
                index + size
            )
        );
    }

    return result;
}


function assertInsideRepository(
    repositoryRoot:
        string,

    path:
        string
): void {
    const relativePath =
        relative(
            repositoryRoot,
            path
        );

    if (
        relativePath.startsWith(
            ".."
        ) ||
        isAbsolute(
            relativePath
        )
    ) {
        throw new Error(
            `Path escapes repository root: ${path}`
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


function isGitCheckpointMetadata(
    value:
        unknown
): value is GitCheckpointMetadata {
    if (
        !isRecord(
            value
        )
    ) {
        return false;
    }

    return (
        value.version ===
            1 &&
        typeof value.id ===
            "string" &&
        typeof value.runId ===
            "string" &&
        typeof value.iterationId ===
            "string" &&
        typeof value.repositoryRoot ===
            "string" &&
        typeof value.headSha ===
            "string" &&
        typeof value.createdAt ===
            "string" &&
        isIterationScope(
            value.scope
        )
    );
}


function isIterationScope(
    value:
        unknown
): value is IterationScope {
    if (
        !isRecord(
            value
        )
    ) {
        return false;
    }

    return (
        Array.isArray(
            value.allowedPaths
        ) &&
        value.allowedPaths.every(
            path =>
                typeof path ===
                    "string"
        ) &&
        Array.isArray(
            value.forbiddenPaths
        ) &&
        value.forbiddenPaths.every(
            path =>
                typeof path ===
                    "string"
        )
    );
}


function isRecord(
    value:
        unknown
): value is Record<string, unknown> {
    return (
        typeof value ===
            "object" &&
        value !==
            null &&
        !Array.isArray(
            value
        )
    );
}


function isNodeError(
    value:
        unknown
): value is NodeJS.ErrnoException {
    return value instanceof
        Error;
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