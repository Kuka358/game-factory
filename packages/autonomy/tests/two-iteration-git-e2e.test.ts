import {
    execFile
} from "node:child_process";

import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    promisify
} from "node:util";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    AutonomyEngine,
    GitCheckpointManager,
    IsolatedHarnessCodingWorker,
    MemoryRunStore,
    createAutonomousRun,
    type CodingHarness,
    type FailureAdvisor,
    type IterationContract,
    type Planner,
    type Verifier
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


const firstContract:
    IterationContract = {
        id:
            "iteration-1",

        objective:
            "Create first source file",

        rationale:
            "Establish state used by the next iteration",

        scope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    "Create src/first.ts"
            }
        ],

        acceptanceCriteria: [
            "src/first.ts exists"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

        maxLocalAttempts:
            1,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                1
        }
    };


const secondContract:
    IterationContract = {
        id:
            "iteration-2",

        objective:
            "Create second source file using first iteration state",

        rationale:
            "Prove that the next worktree starts from the accepted commit",

        scope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    "Create src/second.ts"
            }
        ],

        acceptanceCriteria: [
            "src/first.ts from iteration 1 is visible",
            "src/second.ts exists"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

        maxLocalAttempts:
            1,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                1
        }
    };


describe(
    "two iteration Git autonomy flow",
    () => {
        it(
            "starts the second isolated iteration from the accepted commit of the first",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const initialRevision =
                        await getHead(
                            repository
                        );

                    const store =
                        new MemoryRunStore();

                    /*
                     * Real Git checkpoint manager.
                     *
                     * This is intentionally NOT MemoryCheckpointManager.
                     */
                    const checkpoints =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const planner:
                        Planner = {
                            async plan(
                                input
                            ) {
                                if (
                                    input.run
                                        .currentIteration ===
                                    0
                                ) {
                                    return {
                                        type:
                                            "iteration",

                                        contract:
                                            firstContract
                                    };
                                }

                                if (
                                    input.run
                                        .currentIteration ===
                                    1
                                ) {
                                    return {
                                        type:
                                            "iteration",

                                        contract:
                                            secondContract
                                    };
                                }

                                return {
                                    type:
                                        "complete",

                                    reason:
                                        "Both iterations completed"
                                };
                            }
                        };

                    const harnessRoots:
                        string[] = [];

                    let secondIterationSawFirst =
                        false;

                    const harness:
                        CodingHarness = {
                            async executeIteration(
                                input
                            ) {
                                harnessRoots.push(
                                    input.repositoryRoot
                                );

                                if (
                                    input.contract.id ===
                                    firstContract.id
                                ) {
                                    await writeFile(
                                        join(
                                            input.repositoryRoot,
                                            "src",
                                            "first.ts"
                                        ),
                                        "export const first = 1;\n",
                                        "utf8"
                                    );

                                    return {
                                        summary:
                                            "Created first iteration file",

                                        /*
                                         * Deliberately untrusted.
                                         * IsolatedHarnessCodingWorker must use Git.
                                         */
                                        changedFiles:
                                            []
                                    };
                                }

                                if (
                                    input.contract.id ===
                                    secondContract.id
                                ) {
                                    const firstContents =
                                        await readFile(
                                            join(
                                                input.repositoryRoot,
                                                "src",
                                                "first.ts"
                                            ),
                                            "utf8"
                                        );

                                    expect(
                                        firstContents
                                    ).toBe(
                                        "export const first = 1;\n"
                                    );

                                    secondIterationSawFirst =
                                        true;

                                    await writeFile(
                                        join(
                                            input.repositoryRoot,
                                            "src",
                                            "second.ts"
                                        ),
                                        [
                                            "import { first } from \"./first.js\";",
                                            "",
                                            "export const second = first + 1;",
                                            ""
                                        ].join(
                                            "\n"
                                        ),
                                        "utf8"
                                    );

                                    return {
                                        summary:
                                            "Created second iteration file",

                                        changedFiles: [
                                            "totally-wrong-file.txt"
                                        ]
                                    };
                                }

                                throw new Error(
                                    `Unexpected iteration: ${input.contract.id}`
                                );
                            }
                        };

                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness
                        });

                    const verifiedIterations:
                        string[] = [];

                    const verifier:
                        Verifier = {
                            async verify(
                                input
                            ) {
                                const root =
                                    input.workspace
                                        ?.root;

                                if (!root) {
                                    throw new Error(
                                        "Verifier requires isolated workspace"
                                    );
                                }

                                if (
                                    input.contract.id ===
                                    firstContract.id
                                ) {
                                    expect(
                                        await readFile(
                                            join(
                                                root,
                                                "src",
                                                "first.ts"
                                            ),
                                            "utf8"
                                        )
                                    ).toBe(
                                        "export const first = 1;\n"
                                    );
                                } else if (
                                    input.contract.id ===
                                    secondContract.id
                                ) {
                                    expect(
                                        await readFile(
                                            join(
                                                root,
                                                "src",
                                                "first.ts"
                                            ),
                                            "utf8"
                                        )
                                    ).toBe(
                                        "export const first = 1;\n"
                                    );

                                    expect(
                                        await readFile(
                                            join(
                                                root,
                                                "src",
                                                "second.ts"
                                            ),
                                            "utf8"
                                        )
                                    ).toContain(
                                        "export const second = first + 1;"
                                    );
                                } else {
                                    throw new Error(
                                        `Unexpected verification iteration: ${input.contract.id}`
                                    );
                                }

                                verifiedIterations.push(
                                    input.contract.id
                                );

                                return {
                                    passed:
                                        true,

                                    checks:
                                        []
                                };
                            }
                        };

                    const failureAdvisor:
                        FailureAdvisor = {
                            async advise() {
                                throw new Error(
                                    "Failure advisor should not execute"
                                );
                            }
                        };

                    const engine =
                        new AutonomyEngine({
                            planner,
                            worker,
                            verifier,
                            failureAdvisor,

                            runStore:
                                store,

                            checkpointManager:
                                checkpoints
                        });

                    /*
                     * maxIterations = 3 intentionally.
                     *
                     * We need:
                     * planner call 1 -> iteration 1
                     * planner call 2 -> iteration 2
                     * planner call 3 -> complete
                     *
                     * With the current engine loop maxIterations = 2
                     * would stop before that final "complete" decision.
                     */
                    const run =
                        createAutonomousRun({
                            id:
                                "two-iteration-e2e",

                            goal:
                                "Complete two dependent Git iterations",

                            maxIterations:
                                2
                        });

                    const result =
                        await engine.run(
                            run
                        );

                    expect(
                        result.status
                    ).toBe(
                        "completed"
                    );

                    expect(
                        result.currentIteration
                    ).toBe(
                        2
                    );

                    expect(
                        result.iterations
                    ).toHaveLength(
                        2
                    );

                    expect(
                        secondIterationSawFirst
                    ).toBe(
                        true
                    );

                    expect(
                        verifiedIterations
                    ).toEqual([
                        "iteration-1",
                        "iteration-2"
                    ]);

                    /*
                     * Both harness calls must happen in isolated worktrees,
                     * never directly in the main repository.
                     */
                    expect(
                        harnessRoots
                    ).toHaveLength(
                        2
                    );

                    expect(
                        harnessRoots[0]
                    ).not.toBe(
                        repository
                    );

                    expect(
                        harnessRoots[1]
                    ).not.toBe(
                        repository
                    );

                    expect(
                        harnessRoots[0]
                    ).not.toBe(
                        harnessRoots[1]
                    );

                    const firstRecord =
                        result.iterations[0];

                    const secondRecord =
                        result.iterations[1];

                    expect(
                        firstRecord
                            ?.completed
                    ).toBe(
                        true
                    );

                    expect(
                        secondRecord
                            ?.completed
                    ).toBe(
                        true
                    );

                    expect(
                        firstRecord
                            ?.acceptance
                            ?.status
                    ).toBe(
                        "accepted"
                    );

                    expect(
                        secondRecord
                            ?.acceptance
                            ?.status
                    ).toBe(
                        "accepted"
                    );

                    const firstRevision =
                        firstRecord
                            ?.acceptance
                            ?.acceptedRevision;

                    const secondRevision =
                        secondRecord
                            ?.acceptance
                            ?.acceptedRevision;

                    expect(
                        firstRevision
                    ).toBeDefined();

                    expect(
                        secondRevision
                    ).toBeDefined();

                    expect(
                        firstRevision
                    ).not.toBe(
                        initialRevision
                    );

                    expect(
                        secondRevision
                    ).not.toBe(
                        firstRevision
                    );

                    const finalHead =
                        await getHead(
                            repository
                        );

                    expect(
                        finalHead
                    ).toBe(
                        secondRevision
                    );

                    /*
                     * Commit graph must literally be:
                     *
                     * initial -> iteration 1 -> iteration 2
                     */
                    const finalParent =
                        (
                            await runGitOutput(
                                repository,
                                [
                                    "rev-parse",
                                    "HEAD^"
                                ]
                            )
                        ).trim();

                    expect(
                        finalParent
                    ).toBe(
                        firstRevision
                    );

                    const firstParent =
                        (
                            await runGitOutput(
                                repository,
                                [
                                    "rev-parse",
                                    `${firstRevision}^`
                                ]
                            )
                        ).trim();

                    expect(
                        firstParent
                    ).toBe(
                        initialRevision
                    );

                    /*
                     * Both accepted files must now exist in committed HEAD.
                     */
                    expect(
                        await showFile(
                            repository,
                            "HEAD:src/first.ts"
                        )
                    ).toBe(
                        "export const first = 1;\n"
                    );

                    expect(
                        await showFile(
                            repository,
                            "HEAD:src/second.ts"
                        )
                    ).toContain(
                        "export const second = first + 1;"
                    );

                    /*
                     * Main working tree must be clean inside autonomous scope.
                     */
                    const scopedStatus =
                        await runGitOutput(
                            repository,
                            [
                                "status",
                                "--porcelain",
                                "--untracked-files=all",
                                "--",
                                "src"
                            ]
                        );

                    expect(
                        scopedStatus
                    ).toBe(
                        ""
                    );

                    /*
                     * Both temporary worktrees must have been removed.
                     * `git worktree list` should contain only the main repo.
                     */
                    const worktreeList =
                        await runGitOutput(
                            repository,
                            [
                                "worktree",
                                "list",
                                "--porcelain"
                            ]
                        );

                    const registeredWorktrees =
                        worktreeList
                            .split(
                                /\r?\n/
                            )
                            .filter(
                                line =>
                                    line.startsWith(
                                        "worktree "
                                    )
                            );

                    expect(
                        registeredWorktrees
                    ).toHaveLength(
                        1
                    );

                    /*
                     * Persisted run must match the completed result too.
                     */
                    const persisted =
                        await store.load(
                            run.id
                        );

                    expect(
                        persisted
                    ).toEqual(
                        result
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            },
            30_000
        );
    }
);


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-two-iteration-e2e-"
            )
        );

    await runGit(
        repository,
        [
            "init"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.autocrlf",
            "false"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.eol",
            "lf"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.email",
            "test@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Test"
        ]
    );

    await mkdir(
        join(
            repository,
            "src"
        ),
        {
            recursive:
                true
        }
    );

    await writeFile(
        join(
            repository,
            ".gitignore"
        ),
        ".game-factory/\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "index.ts"
        ),
        "export {};\n",
        "utf8"
    );

    await runGit(
        repository,
        [
            "add",
            "."
        ]
    );

    await runGit(
        repository,
        [
            "commit",
            "-m",
            "initial"
        ]
    );

    return repository;
}


async function getHead(
    repository:
        string
): Promise<string> {
    return (
        await runGitOutput(
            repository,
            [
                "rev-parse",
                "HEAD"
            ]
        )
    ).trim();
}


async function showFile(
    repository:
        string,

    revisionPath:
        string
): Promise<string> {
    return runGitOutput(
        repository,
        [
            "show",
            revisionPath
        ]
    );
}


async function runGit(
    repository:
        string,

    args:
        readonly string[]
): Promise<void> {
    await execFileAsync(
        "git",
        [
            ...args
        ],
        {
            cwd:
                repository,

            encoding:
                "utf8",

            windowsHide:
                true
        }
    );
}


async function runGitOutput(
    repository:
        string,

    args:
        readonly string[]
): Promise<string> {
    const result =
        await execFileAsync(
            "git",
            [
                ...args
            ],
            {
                cwd:
                    repository,

                encoding:
                    "utf8",

                windowsHide:
                    true
            }
        );

    return String(
        result.stdout
    );
}