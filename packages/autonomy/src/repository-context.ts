import {
    execFile
} from "node:child_process";

import {
    dirname,
    resolve
} from "node:path";

import {
    promisify
} from "node:util";

import type {
    IterationContract,
    IterationScope
} from "./contracts.js";

import {
    WorkspaceGuard,
    normalizeRepositoryPath
} from "./workspace.js";

import {
    TypeScriptRepositoryIntelligence,
    type RepositoryIntelligence
} from "./repository-intelligence.js";

const execFileAsync =
    promisify(
        execFile
    );


export interface RepositoryContextDiscoveryInput {
    repositoryRoot:
        string;

    contract:
        IterationContract;
}


export interface RepositoryContextSelection {
    /**
     * Paths that should be supplied to the coding model
     * as full file contents.
     */
    selectedPaths:
        readonly string[];

    /**
     * Safe repository inventory visible to the model.
     * Contents are NOT included here.
     */
    inventory:
        readonly string[];
}


export interface RepositoryContextDiscovery {
    discover(
        input:
            RepositoryContextDiscoveryInput
    ): Promise<RepositoryContextSelection>;
}


export interface GitRepositoryContextDiscoveryOptions {
    maxSelectedFiles?:
        number;

    maxInventoryEntries?:
        number;

    intelligence?:
        RepositoryIntelligence;
}


export class GitRepositoryContextDiscovery
    implements RepositoryContextDiscovery
{
    private readonly maxSelectedFiles:
        number;

    private readonly maxInventoryEntries:
        number;

    private readonly guard =
        new WorkspaceGuard();

    private readonly intelligence:
        RepositoryIntelligence;

    constructor(
        options:
            GitRepositoryContextDiscoveryOptions = {}
    ) {
        this.maxSelectedFiles =
            positiveInteger(
                options.maxSelectedFiles ??
                12,
                "maxSelectedFiles"
            );

        this.maxInventoryEntries =
            positiveInteger(
                options.maxInventoryEntries ??
                200,
                "maxInventoryEntries"
            );

        this.intelligence =
            options.intelligence ??
            new TypeScriptRepositoryIntelligence();
    }


    async discover(
        input:
            RepositoryContextDiscoveryInput
    ): Promise<RepositoryContextSelection> {
        const repositoryRoot =
            resolve(
                input.repositoryRoot
            );

        await this.assertRepositoryRoot(
            repositoryRoot
        );

        /*
         * Deliberately use Git's tracked-file index.
         *
         * This means ignored/untracked local files such as .env,
         * credentials, build output, caches, etc. do not silently
         * become model context.
         */
        const tracked =
            await this.listTrackedFiles(
                repositoryRoot
            );

        const contextScope =
            input.contract.contextScope ??
            input.contract.scope;

        const eligible =
            tracked.filter(
                path =>
                    !isSensitiveContextPath(
                        path
                    ) &&
                    this.isPathAllowed(
                        path,
                        contextScope
                    )
            );

        const inventory =
            eligible
                .slice()
                .sort(
                    comparePaths
                )
                .slice(
                    0,
                    this.maxInventoryEntries
                );

        const hints =
            collectHints(
                input.contract
            );

        const related =
            await this.intelligence
                .analyze({
                    repositoryRoot,

                    eligiblePaths:
                        eligible,

                    seedPaths:
                        hints
                });


        const relationshipScores =
            new Map(
                related.map(
                    item => [
                        item.path,
                        item.score
                    ] as const
                )
            );

        const ranked =
            eligible
                .map(
                    path => ({
                        path,

                        score:
                            scorePath(
                                path,
                                hints,
                                input.contract,
                                relationshipScores.get(
                                    path
                                ) ??
                                0
                            )
                    })
                )
                .sort(
                    (
                        first,
                        second
                    ) => {
                        if (
                            first.score !==
                            second.score
                        ) {
                            return (
                                second.score -
                                first.score
                            );
                        }

                        return comparePaths(
                            first.path,
                            second.path
                        );
                    }
                );

        const selectedPaths:
            string[] = [];

        const selected =
            new Set<string>();

        /*
         * Existing hinted files always have highest priority.
         */
        for (
            const hint of
            hints
        ) {
            if (
                !eligible.includes(
                    hint
                ) ||
                selected.has(
                    hint
                )
            ) {
                continue;
            }

            selected.add(
                hint
            );

            selectedPaths.push(
                hint
            );

            if (
                selectedPaths.length >=
                this.maxSelectedFiles
            ) {
                break;
            }
        }

        /*
         * Fill the remaining context budget with deterministic
         * related files.
         */
        for (
            const candidate of
            ranked
        ) {
            if (
                selectedPaths.length >=
                this.maxSelectedFiles
            ) {
                break;
            }

            if (
                selected.has(
                    candidate.path
                )
            ) {
                continue;
            }

            /*
             * When explicit hints exist, avoid filling the model
             * context with completely unrelated files.
             */
            if (
                hints.length >
                    0 &&
                candidate.score <=
                    0
            ) {
                continue;
            }

            selected.add(
                candidate.path
            );

            selectedPaths.push(
                candidate.path
            );
        }

        /*
         * If the contract has no hints, provide a bounded initial
         * context rather than returning nothing.
         */
        if (
            hints.length ===
            0
        ) {
            for (
                const path of
                inventory
            ) {
                if (
                    selectedPaths.length >=
                    this.maxSelectedFiles
                ) {
                    break;
                }

                if (
                    selected.has(
                        path
                    )
                ) {
                    continue;
                }

                selected.add(
                    path
                );

                selectedPaths.push(
                    path
                );
            }
        }

        return {
            selectedPaths,
            inventory
        };
    }


    private async assertRepositoryRoot(
        repositoryRoot:
            string
    ): Promise<void> {
        const actual =
            (
                await runGit(
                    repositoryRoot,
                    [
                        "rev-parse",
                        "--show-toplevel"
                    ]
                )
            ).trim();

        if (
            !samePath(
                actual,
                repositoryRoot
            )
        ) {
            throw new Error(
                [
                    "GitRepositoryContextDiscovery repositoryRoot",
                    "must be the Git repository root:",
                    `expected ${actual},`,
                    `received ${repositoryRoot}`
                ].join(
                    " "
                )
            );
        }
    }


    private async listTrackedFiles(
        repositoryRoot:
            string
    ): Promise<string[]> {
        const output =
            await runGit(
                repositoryRoot,
                [
                    "ls-files",
                    "-z",
                    "--cached"
                ]
            );

        return output
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


    private isPathAllowed(
        path:
            string,

        scope:
            IterationScope
    ): boolean {
        try {
            this.guard
                .assertPathAllowed(
                    path,
                    scope
                );

            return true;
        } catch {
            return false;
        }
    }
}


function collectHints(
    contract:
        IterationContract
): string[] {
    const result:
        string[] = [];

    const seen =
        new Set<string>();

    for (
        const change of
        contract.changes
    ) {
        for (
            const rawPath of
            change.filesHint ??
            []
        ) {
            const path =
                normalizeRepositoryPath(
                    rawPath
                );

            if (
                seen.has(
                    path
                )
            ) {
                continue;
            }

            seen.add(
                path
            );

            result.push(
                path
            );
        }
    }

    return result;
}


function scorePath(
    path:
        string,

    hints:
        readonly string[],

    contract:
        IterationContract,

    relationshipScore:
        number
): number {
    let score =
        relationshipScore;

    const lowerPath =
        path.toLowerCase();

    const pathDirectory =
        dirname(
            path
        ).replaceAll(
            "\\",
            "/"
        );

    for (
        const hint of
        hints
    ) {
        if (
            path ===
            hint
        ) {
            score +=
                10_000;

            continue;
        }

        const hintDirectory =
            dirname(
                hint
            ).replaceAll(
                "\\",
                "/"
            );

        if (
            pathDirectory ===
            hintDirectory
        ) {
            score +=
                1_000;
        }

        const hintNameTokens =
            tokenize(
                hint
            );

        for (
            const token of
            hintNameTokens
        ) {
            if (
                lowerPath.includes(
                    token
                )
            ) {
                score +=
                    100;
            }
        }
    }

    const taskText =
        [
            contract.objective,
            contract.rationale,

            ...contract.changes.map(
                change =>
                    change.description
            ),

            ...contract.acceptanceCriteria
        ].join(
            " "
        );

    for (
        const token of
        tokenize(
            taskText
        )
    ) {
        if (
            lowerPath.includes(
                token
            )
        ) {
            score +=
                10;
        }
    }

    if (
        isLikelyTestFile(
            path
        )
    ) {
        score +=
            5;
    }

    return score;
}


function tokenize(
    value:
        string
): string[] {
    const tokens =
        value
            .toLowerCase()
            .split(
                /[^a-z0-9_-]+/
            )
            .map(
                token =>
                    token.trim()
            )
            .filter(
                token =>
                    token.length >=
                    3
            );

    return [
        ...new Set(
            tokens
        )
    ];
}


function isLikelyTestFile(
    path:
        string
): boolean {
    const normalized =
        path.toLowerCase();

    return (
        normalized.includes(
            "/test/"
        ) ||
        normalized.includes(
            "/tests/"
        ) ||
        normalized.endsWith(
            ".test.ts"
        ) ||
        normalized.endsWith(
            ".spec.ts"
        ) ||
        normalized.endsWith(
            ".test.tsx"
        ) ||
        normalized.endsWith(
            ".spec.tsx"
        )
    );
}


function comparePaths(
    first:
        string,

    second:
        string
): number {
    return first.localeCompare(
        second,
        "en"
    );
}


function positiveInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive integer`
        );
    }

    return value;
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

    return (
        normalizedFirst ===
        normalizedSecond
    );
}


async function runGit(
    repositoryRoot:
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
                    cwd:
                        repositoryRoot,

                    encoding:
                        "utf8",

                    windowsHide:
                        true
                }
            );

        return String(
            result.stdout
        );
    } catch (
        error
    ) {
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
            `Repository context Git command failed: git ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`,
            {
                cause:
                    error
            }
        );
    }
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

export function isSensitiveContextPath(
    path:
        string
): boolean {
    const normalized =
        normalizeRepositoryPath(
            path
        ).toLowerCase();

    const segments =
        normalized.split(
            "/"
        );

    const basename =
        segments[
            segments.length - 1
        ] ?? "";

    if (
        basename ===
            ".env" ||
        basename.startsWith(
            ".env."
        ) ||
        basename ===
            ".npmrc" ||
        basename ===
            ".netrc" ||
        basename ===
            ".pypirc"
    ) {
        return true;
    }

    return (
        normalized ===
            ".game-factory" ||
        normalized.startsWith(
            ".game-factory/"
        )
    );
}