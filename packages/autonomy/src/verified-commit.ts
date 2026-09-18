import {
    execFile
} from "node:child_process";

import {
    resolve
} from "node:path";

import {
    promisify
} from "node:util";

import {
    normalizeRepositoryPath
} from "./workspace.js";


const execFileAsync =
    promisify(
        execFile
    );

interface RepositoryChanges {
    tracked:
        readonly string[];

    untracked:
        readonly string[];
}


export interface VerifiedCommitManagerOptions {
    repositoryRoot:
        string;
}


export interface VerifiedCommitInput {
    baseRevision:
        string;

    changedFiles:
        readonly string[];

    message:
        string;
}


export interface VerifiedCommitResult {
    revision:
        string;

    committed:
        boolean;
}


export class VerifiedCommitManager {
    private readonly repositoryRoot:
        string;


    constructor(
        options:
            VerifiedCommitManagerOptions
    ) {
        this.repositoryRoot =
            resolve(
                options.repositoryRoot
            );
    }


    async commit(
        input:
            VerifiedCommitInput
    ): Promise<VerifiedCommitResult> {
        await this.assertRepositoryRoot();

        const currentHead =
            await this.getHead();

        if (
            currentHead !==
            input.baseRevision
        ) {
            throw new Error(
                `Cannot commit verified changes: repository HEAD changed from ${input.baseRevision} to ${currentHead}`
            );
        }

        const changedFiles =
            deduplicatePaths(
                input.changedFiles
            );

        if (
            changedFiles.length ===
            0
        ) {
            return {
                revision:
                    currentHead,

                committed:
                    false
            };
        }

        const actualChanges =
            await this.collectChanges();

        const actualChangedFiles =
            new Set([
                ...actualChanges.tracked,
                ...actualChanges.untracked
            ]);

        for (
            const path of
            changedFiles
        ) {
            if (
                !actualChangedFiles.has(
                    path
                )
            ) {
                throw new Error(
                    `Cannot commit verified changes: expected changed path is clean: ${path}`
                );
            }
        }

        const message =
            input.message.trim();

        if (
            message.length ===
            0
        ) {
            throw new Error(
                "Verified commit message must not be empty"
            );
        }

        /*
         * --only is essential here.
         *
         * It commits the working-tree contents of the provided
         * pathspec while ignoring unrelated staged changes.
         */
        const verifiedUntracked =
            actualChanges.untracked
                .filter(
                    path =>
                        changedFiles.includes(
                            path
                        )
                );

        if (
            verifiedUntracked.length >
            0
        ) {
            /*
            * Intent-to-add makes new files known to Git without staging
            * unrelated content. `git commit --only` can then commit those
            * exact paths while unrelated staged changes stay untouched.
            */
            await this.runGit([
                "add",
                "--intent-to-add",
                "--",
                ...verifiedUntracked
            ]);
        }

        await this.runGit([
            "commit",
            "--only",
            "--no-verify",
            "-m",
            message,
            "--",
            ...changedFiles
        ]);

        const revision =
            await this.getHead();

        return {
            revision,

            committed:
                true
        };
    }


    private async collectChanges():
        Promise<RepositoryChanges>
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


    private async getHead():
        Promise<string>
    {
        return (
            await this.runGit([
                "rev-parse",
                "HEAD"
            ])
        ).trim();
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
                `VerifiedCommitManager repositoryRoot must be the repository root: expected ${actualRoot}, received ${this.repositoryRoot}`
            );
        }
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


function deduplicatePaths(
    values:
        readonly string[]
): string[] {
    return [
        ...new Set(
            values.map(
                value =>
                    normalizeRepositoryPath(
                        value
                    )
            )
        )
    ];
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