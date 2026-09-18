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

export interface VerifiedAcceptanceLookup {
    baseRevision:
        string;

    acceptanceId:
        string;

    digest:
        string;
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

    acceptanceId?:
        string;

    digest?:
        string;
}


export interface VerifiedCommitResult {
    revision:
        string;

    committed:
        boolean;

    alreadyCommitted?:
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

        const hasAcceptanceId =
            input.acceptanceId !==
            undefined;

        const hasDigest =
            input.digest !==
            undefined;

        if (
            hasAcceptanceId !==
            hasDigest
        ) {
            throw new Error(
                "Verified commit acceptanceId and digest must be provided together"
            );
        }

        if (
            input.acceptanceId
        ) {
            assertSingleLine(
                input.acceptanceId,
                "Verified commit acceptanceId"
            );
        }

        if (
            input.digest
        ) {
            assertSingleLine(
                input.digest,
                "Verified commit digest"
            );
        }

        if (
            currentHead !==
            input.baseRevision
        ) {
            if (
                input.acceptanceId &&
                input.digest &&
                await this.matchesAcceptedCommit(
                    currentHead,
                    {
                        baseRevision:
                            input.baseRevision,

                        acceptanceId:
                            input.acceptanceId,

                        digest:
                            input.digest
                    }
                )
            ) {
                return {
                    revision:
                        currentHead,

                    committed:
                        true,

                    alreadyCommitted:
                        true
                };
            }

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

        const commitArgs:
            string[] = [
                "commit",
                "--only",
                "--no-verify",
                "-m",
                message
            ];

        if (
            input.acceptanceId &&
            input.digest
        ) {
            commitArgs.push(
                "-m",
                [
                    `Game-Factory-Accept: ${input.acceptanceId}`,
                    `Game-Factory-Digest: ${input.digest}`,
                    `Game-Factory-Base: ${input.baseRevision}`
                ].join(
                    "\n"
                )
            );
        }

        commitArgs.push(
            "--",
            ...changedFiles
        );

        await this.runGit(
            commitArgs
        );

        const revision =
            await this.getHead();

        return {
            revision,

            committed:
                true
        };
    }

    async findAcceptedRevision(
        input:
            VerifiedAcceptanceLookup
    ): Promise<string | null> {
        await this.assertRepositoryRoot();

        assertSingleLine(
            input.acceptanceId,
            "Verified commit acceptanceId"
        );

        assertSingleLine(
            input.digest,
            "Verified commit digest"
        );

        const currentHead =
            await this.getHead();

        if (
            currentHead ===
            input.baseRevision
        ) {
            return null;
        }

        const matches =
            await this.matchesAcceptedCommit(
                currentHead,
                input
            );

        return matches
            ? currentHead
            : null;
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

    private async matchesAcceptedCommit(
        revision:
            string,

        input:
            VerifiedAcceptanceLookup
    ): Promise<boolean> {
        if (
            !input.acceptanceId ||
            !input.digest
        ) {
            return false;
        }

        let parent:
            string;

        try {
            parent =
                (
                    await this.runGit([
                        "rev-parse",
                        `${revision}^`
                    ])
                ).trim();
        } catch {
            return false;
        }

        if (
            parent !==
            input.baseRevision
        ) {
            return false;
        }

        const message =
            await this.runGit([
                "show",
                "-s",
                "--format=%B",
                revision
            ]);

        const lines =
            message
                .split(
                    /\r?\n/
                )
                .map(
                    line =>
                        line.trim()
                );

        return (
            lines.includes(
                `Game-Factory-Accept: ${input.acceptanceId}`
            ) &&
            lines.includes(
                `Game-Factory-Digest: ${input.digest}`
            ) &&
            lines.includes(
                `Game-Factory-Base: ${input.baseRevision}`
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

function assertSingleLine(
    value:
        string,

    label:
        string
): void {
    if (
        value.length ===
            0 ||
        value.includes(
            "\n"
        ) ||
        value.includes(
            "\r"
        )
    ) {
        throw new Error(
            `${label} must be a non-empty single-line value`
        );
    }
}