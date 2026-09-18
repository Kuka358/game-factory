import {
    execFile
} from "node:child_process";

import {
    access,
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
    IsolatedHarnessCodingWorker,
    createAutonomousRun,
    type CodingHarness,
    type IterationContract,
    type WorkerWorkspaceRef
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


const contract:
    IterationContract = {
        id:
            "isolated-iteration",

        objective:
            "Change source safely",

        rationale:
            "Test isolated coding worker",

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
                    "Change source"
            }
        ],

        acceptanceCriteria: [
            "Source changed"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

        maxLocalAttempts:
            2,

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
    "IsolatedHarnessCodingWorker",
    () => {
        it(
            "prepares an isolated worktree from repository HEAD",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness:
                                noOpHarness()
                        });

                    const run =
                        createRun(
                            "prepare-run"
                        );

                    const workspace =
                        await worker.prepare({
                            run,
                            contract
                        });

                    expect(
                        workspace.root
                    ).not.toBe(
                        repository
                    );

                    expect(
                        await readFile(
                            join(
                                workspace.root,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await worker.settle({
                        run,
                        contract,
                        workspace,

                        outcome:
                            "discard"
                    });
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
            }
        );


        it(
            "reuses the same workspace across repair attempts and trusts Git instead of harness changedFiles",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const roots:
                        string[] = [];

                    const harness:
                        CodingHarness = {
                            async executeIteration(
                                input
                            ) {
                                roots.push(
                                    input.repositoryRoot
                                );

                                const path =
                                    join(
                                        input.repositoryRoot,
                                        "src",
                                        "main.txt"
                                    );

                                if (
                                    input.attempt ===
                                    1
                                ) {
                                    await writeFile(
                                        path,
                                        "first attempt\n",
                                        "utf8"
                                    );
                                } else {
                                    expect(
                                        await readFile(
                                            path,
                                            "utf8"
                                        )
                                    ).toBe(
                                        "first attempt\n"
                                    );

                                    await writeFile(
                                        path,
                                        "second attempt\n",
                                        "utf8"
                                    );
                                }

                                return {
                                    summary:
                                        `Attempt ${input.attempt}`,

                                    /*
                                     * Deliberately false.
                                     * Git must remain the source of truth.
                                     */
                                    changedFiles: [
                                        "outside.txt"
                                    ]
                                };
                            }
                        };

                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness
                        });

                    const run =
                        createRun(
                            "retry-run"
                        );

                    const workspace =
                        await worker.prepare({
                            run,
                            contract
                        });

                    const first =
                        await worker.execute({
                            run,
                            contract,

                            attempt:
                                1,

                            workspace
                        });

                    const second =
                        await worker.execute({
                            run,
                            contract,

                            attempt:
                                2,

                            workspace
                        });

                    expect(
                        roots
                    ).toEqual([
                        workspace.root,
                        workspace.root
                    ]);

                    expect(
                        first.changedFiles
                    ).toEqual([
                        "src/main.txt"
                    ]);

                    expect(
                        second.changedFiles
                    ).toEqual([
                        "src/main.txt"
                    ]);

                    expect(
                        first.changeSet
                            ?.digest
                    ).not.toBe(
                        second.changeSet
                            ?.digest
                    );

                    await worker.settle({
                        run,
                        contract,
                        workspace,

                        outcome:
                            "discard",

                        workerResult:
                            second
                    });
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
            }
        );


        it(
            "rejects real changes outside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const harness:
                        CodingHarness = {
                            async executeIteration(
                                input
                            ) {
                                await writeFile(
                                    join(
                                        input.repositoryRoot,
                                        "outside.txt"
                                    ),
                                    "unauthorized\n",
                                    "utf8"
                                );

                                return {
                                    summary:
                                        "Claimed safe change",

                                    changedFiles:
                                        []
                                };
                            }
                        };

                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness
                        });

                    const run =
                        createRun(
                            "scope-run"
                        );

                    const workspace =
                        await worker.prepare({
                            run,
                            contract
                        });

                    await expect(
                        worker.execute({
                            run,
                            contract,

                            attempt:
                                1,

                            workspace
                        })
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "outside.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "outside original\n"
                    );

                    await worker.settle({
                        run,
                        contract,
                        workspace,

                        outcome:
                            "discard"
                    });
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
            }
        );


        it(
            "promotes only the verified changeset on accept",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const harness:
                        CodingHarness = {
                            async executeIteration(
                                input
                            ) {
                                await writeFile(
                                    join(
                                        input.repositoryRoot,
                                        "src",
                                        "main.txt"
                                    ),
                                    "accepted\n",
                                    "utf8"
                                );

                                return {
                                    summary:
                                        "Implemented change",

                                    changedFiles:
                                        []
                                };
                            }
                        };

                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness
                        });

                    const run =
                        createRun(
                            "accept-run"
                        );

                    const workspace =
                        await worker.prepare({
                            run,
                            contract
                        });

                    const result =
                        await worker.execute({
                            run,
                            contract,

                            attempt:
                                1,

                            workspace
                        });

                    expect(
                        result.changeSet
                            ?.digest
                    ).toBeDefined();

                    await worker.settle({
                        run,
                        contract,
                        workspace,

                        outcome:
                            "accept",

                        workerResult:
                            result
                    });

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "accepted\n"
                    );

                    await expect(
                        access(
                            workspace.root
                        )
                    ).rejects.toMatchObject({
                        code:
                            "ENOENT"
                    });
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
            }
        );


        it(
            "discards the isolated workspace without changing the main repository",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const harness:
                        CodingHarness = {
                            async executeIteration(
                                input
                            ) {
                                await writeFile(
                                    join(
                                        input.repositoryRoot,
                                        "src",
                                        "main.txt"
                                    ),
                                    "discarded\n",
                                    "utf8"
                                );

                                return {
                                    summary:
                                        "Temporary change",

                                    changedFiles: [
                                        "src/main.txt"
                                    ]
                                };
                            }
                        };

                    const worker =
                        new IsolatedHarnessCodingWorker({
                            repositoryRoot:
                                repository,

                            harness
                        });

                    const run =
                        createRun(
                            "discard-run"
                        );

                    const workspace =
                        await worker.prepare({
                            run,
                            contract
                        });

                    const result =
                        await worker.execute({
                            run,
                            contract,

                            attempt:
                                1,

                            workspace
                        });

                    await worker.settle({
                        run,
                        contract,
                        workspace,

                        outcome:
                            "discard",

                        workerResult:
                            result
                    });

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await expect(
                        access(
                            workspace.root
                        )
                    ).rejects.toMatchObject({
                        code:
                            "ENOENT"
                    });
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
            }
        );
    }
);


function createRun(
    id:
        string
) {
    return createAutonomousRun({
        id,

        goal:
            "Test isolated worker",

        maxIterations:
            2
    });
}


function noOpHarness():
    CodingHarness
{
    return {
        async executeIteration() {
            return {
                summary:
                    "No-op",

                changedFiles:
                    []
            };
        }
    };
}


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-isolated-worker-"
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
            "main.txt"
        ),
        "original\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "outside.txt"
        ),
        "outside original\n",
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