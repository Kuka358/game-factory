import {
    access,
    mkdtemp,
    rm
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join,
    resolve
} from "node:path";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    DeterministicCommandVerifier,
    LocalProcessExecutionSandbox,
    createAutonomousRun,
    type IterationContract,
    type VerificationInput,
    type VerificationStep
} from "../src/index.js";


describe(
    "DeterministicCommandVerifier",
    () => {
        it(
            "executes an allowlisted command inside the isolated workspace",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:cwd",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        "process.stdout.write(process.cwd())"
                                    ]
                                }
                            ]
                        });

                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "cwd",

                                        command:
                                            "verify:cwd",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );

                    expect(
                        report.passed
                    ).toBe(
                        true
                    );

                    expect(
                        report.checks
                    ).toHaveLength(
                        1
                    );

                    expect(
                        report.checks[0]
                            ?.passed
                    ).toBe(
                        true
                    );

                    expect(
                        report.checks[0]
                            ?.exitCode
                    ).toBe(
                        0
                    );

                    expect(
                        resolve(
                            report.checks[0]
                                ?.stdout ??
                                ""
                        )
                    ).toBe(
                        resolve(
                            repository
                        )
                    );

                    expect(
                        report.checks[0]
                            ?.durationMs
                    ).toBeGreaterThanOrEqual(
                        0
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
            }
        );


        it(
            "reports a required command failure with diagnostics",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:failure",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        [
                                            'process.stderr.write("verification failed\\n");',
                                            "process.exit(7);"
                                        ].join(
                                            ""
                                        )
                                    ]
                                }
                            ]
                        });

                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "failure",

                                        command:
                                            "verify:failure",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );

                    expect(
                        report.passed
                    ).toBe(
                        false
                    );

                    expect(
                        report.checks[0]
                            ?.passed
                    ).toBe(
                        false
                    );

                    expect(
                        report.checks[0]
                            ?.exitCode
                    ).toBe(
                        7
                    );

                    expect(
                        report.checks[0]
                            ?.stderr
                    ).toContain(
                        "verification failed"
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
            }
        );


        it(
            "does not fail the report when only an optional command fails",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:optional-failure",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        "process.exit(4)"
                                    ]
                                },

                                {
                                    command:
                                        "verify:required-success",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        'process.stdout.write("ok")'
                                    ]
                                }
                            ]
                        });

                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "optional",

                                        command:
                                            "verify:optional-failure",

                                        required:
                                            false
                                    },

                                    {
                                        id:
                                            "required",

                                        command:
                                            "verify:required-success",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );

                    expect(
                        report.passed
                    ).toBe(
                        true
                    );

                    expect(
                        report.checks
                            .map(
                                check =>
                                    check.passed
                            )
                    ).toEqual([
                        false,
                        true
                    ]);
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
            "validates the complete command batch before executing anything",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const markerPath =
                        join(
                            repository,
                            "marker.txt"
                        );

                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:create-marker",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        [
                                            'require("node:fs")',
                                            '.writeFileSync("marker.txt", "executed\\n");'
                                        ].join(
                                            ""
                                        )
                                    ]
                                }
                            ]
                        });

                    await expect(
                        verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "marker",

                                        command:
                                            "verify:create-marker",

                                        required:
                                            true
                                    },

                                    {
                                        id:
                                            "unsafe",

                                        command:
                                            "git reset --hard",

                                        required:
                                            true
                                    }
                                ]
                            )
                        )
                    ).rejects.toThrow(
                        "not allowed"
                    );

                    /*
                     * The first command must not have executed before
                     * the second command was rejected.
                     */
                    await expect(
                        access(
                            markerPath
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
            "does not inherit arbitrary parent environment variables",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const sandbox =
                        new LocalProcessExecutionSandbox({
                            parentEnvironment: {
                                GAME_FACTORY_SECRET:
                                    "must-not-leak"
                            }
                        });


                    const verifier =
                        new DeterministicCommandVerifier({
                            sandbox,

                            commands: [
                                {
                                    command:
                                        "verify:environment",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        [
                                            "process.stdout.write(",
                                            "process.env.GAME_FACTORY_SECRET ?? '<missing>'",
                                            ");"
                                        ].join(
                                            ""
                                        )
                                    ]
                                }
                            ]
                        });


                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "environment",

                                        command:
                                            "verify:environment",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );


                    expect(
                        report.passed
                    ).toBe(
                        true
                    );


                    expect(
                        report.checks[0]
                            ?.stdout
                    ).toBe(
                        "<missing>"
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
            }
        );


        it(
            "inherits only explicitly allowed environment variables",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const sandbox =
                        new LocalProcessExecutionSandbox({
                            parentEnvironment: {
                                GAME_FACTORY_ALLOWED:
                                    "visible",

                                GAME_FACTORY_SECRET:
                                    "hidden"
                            }
                        });


                    const verifier =
                        new DeterministicCommandVerifier({
                            sandbox,

                            commands: [
                                {
                                    command:
                                        "verify:allowed-environment",

                                    executable:
                                        process.execPath,

                                    environment: {
                                        inherit: [
                                            "GAME_FACTORY_ALLOWED"
                                        ]
                                    },

                                    args: [
                                        "-e",
                                        [
                                            "process.stdout.write(",
                                            "`${process.env.GAME_FACTORY_ALLOWED ?? '<missing>'}|",
                                            "${process.env.GAME_FACTORY_SECRET ?? '<missing>'}`",
                                            ");"
                                        ].join(
                                            ""
                                        )
                                    ]
                                }
                            ]
                        });


                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "environment",

                                        command:
                                            "verify:allowed-environment",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );


                    expect(
                        report.checks[0]
                            ?.stdout
                    ).toBe(
                        "visible|<missing>"
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
            }
        );


        it(
            "terminates commands that exceed their timeout",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:timeout",

                                    executable:
                                        process.execPath,

                                    timeoutMs:
                                        100,

                                    args: [
                                        "-e",
                                        "setTimeout(() => {}, 10_000);"
                                    ]
                                }
                            ]
                        });


                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "timeout",

                                        command:
                                            "verify:timeout",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );


                    expect(
                        report.passed
                    ).toBe(
                        false
                    );


                    expect(
                        report.checks[0]
                            ?.stderr
                    ).toContain(
                        "timed out"
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
            }
        );


        it(
            "terminates commands that exceed the output budget",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const verifier =
                        new DeterministicCommandVerifier({
                            maxOutputBytes:
                                128,

                            commands: [
                                {
                                    command:
                                        "verify:output-limit",

                                    executable:
                                        process.execPath,

                                    args: [
                                        "-e",
                                        'process.stdout.write("x".repeat(10_000));'
                                    ]
                                }
                            ]
                        });


                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "output",

                                        command:
                                            "verify:output-limit",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );


                    expect(
                        report.passed
                    ).toBe(
                        false
                    );


                    expect(
                        report.checks[0]
                            ?.stderr
                    ).toContain(
                        "output exceeded"
                    );


                    expect(
                        Buffer.byteLength(
                            report.checks[0]
                                ?.stdout ??
                                "",
                            "utf8"
                        )
                    ).toBeLessThanOrEqual(
                        128
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
            }
        );


        it(
            "rejects relative verifier executable paths",
            () => {
                expect(
                    () =>
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:relative",

                                    executable:
                                        "node"
                                }
                            ]
                        })
                ).toThrow(
                    "must be absolute"
                );
            }
        );

        it(
            "terminates the entire verifier process tree on timeout",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const childStartedMarker =
                        join(
                            repository,
                            "child-started.txt"
                        );


                    const childSurvivedMarker =
                        join(
                            repository,
                            "child-survived.txt"
                        );


                    /*
                     * The child proves that it actually started, then
                     * waits long enough to write a second marker.
                     *
                     * If timeout termination kills only the direct
                     * verifier process, this child survives and writes
                     * child-survived.txt later.
                     */
                    const childScript =
                        [
                            'const { writeFileSync } = require("node:fs");',

                            `writeFileSync(${JSON.stringify(
                                childStartedMarker
                            )}, "started\\n");`,

                            `setTimeout(() => { writeFileSync(${JSON.stringify(
                                childSurvivedMarker
                            )}, "survived\\n"); }, 2500);`,

                            "setTimeout(() => {}, 10000);"
                        ].join(
                            ""
                        );


                    /*
                     * The verifier command creates a real descendant
                     * process and then remains alive until the sandbox
                     * timeout fires.
                     *
                     * Do NOT use detached:true here. The child should
                     * belong to the verifier's process tree.
                     */
                    const parentScript =
                        [
                            'const { spawn } = require("node:child_process");',

                            `spawn(process.execPath, ["-e", ${JSON.stringify(
                                childScript
                            )}], { stdio: "ignore" });`,

                            "setTimeout(() => {}, 10000);"
                        ].join(
                            ""
                        );


                    const verifier =
                        new DeterministicCommandVerifier({
                            commands: [
                                {
                                    command:
                                        "verify:process-tree-timeout",

                                    executable:
                                        process.execPath,

                                    timeoutMs:
                                        1000,

                                    args: [
                                        "-e",
                                        parentScript
                                    ]
                                }
                            ]
                        });


                    const report =
                        await verifier.verify(
                            createInput(
                                repository,
                                [
                                    {
                                        id:
                                            "process-tree",

                                        command:
                                            "verify:process-tree-timeout",

                                        required:
                                            true
                                    }
                                ]
                            )
                        );


                    expect(
                        report.passed
                    ).toBe(
                        false
                    );


                    expect(
                        report.checks[0]
                            ?.stderr
                    ).toContain(
                        "timed out"
                    );


                    /*
                     * Make sure this is a meaningful process-tree test:
                     * the descendant must actually have started before
                     * termination occurred.
                     */
                    await expect(
                        access(
                            childStartedMarker
                        )
                    ).resolves.toBeUndefined();


                    /*
                     * Wait beyond the descendant's delayed marker.
                     *
                     * If process-tree termination is broken, the
                     * descendant will still be alive and create it.
                     */
                    await new Promise(
                        resolveDelay => {
                            setTimeout(
                                resolveDelay,
                                2000
                            );
                        }
                    );


                    await expect(
                        access(
                            childSurvivedMarker
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
            "refuses verification without an isolated workspace",
            async () => {
                const verifier =
                    new DeterministicCommandVerifier({
                        commands: [
                            {
                                command:
                                    "verify:ok",

                                executable:
                                    process.execPath,

                                args: [
                                    "-e",
                                    ""
                                ]
                            }
                        ]
                    });

                const contract =
                    createContract([
                        {
                            id:
                                "ok",

                            command:
                                "verify:ok",

                            required:
                                true
                        }
                    ]);

                const input:
                    VerificationInput = {
                        run:
                            createAutonomousRun({
                                id:
                                    "no-workspace",

                                goal:
                                    "Test verifier",

                                maxIterations:
                                    1
                            }),

                        contract,

                        attempt:
                            1,

                        workerResult: {
                            summary:
                                "Implemented",

                            changedFiles:
                                []
                        }
                    };

                await expect(
                    verifier.verify(
                        input
                    )
                ).rejects.toThrow(
                    "requires an isolated workspace"
                );
            }
        );
    }
);


function createInput(
    repository:
        string,

    verification:
        readonly VerificationStep[]
): VerificationInput {
    const contract =
        createContract(
            verification
        );

    return {
        run:
            createAutonomousRun({
                id:
                    "command-verifier-run",

                goal:
                    "Test deterministic verification",

                maxIterations:
                    1
            }),

        contract,

        attempt:
            1,

        workerResult: {
            summary:
                "Implemented",

            changedFiles: [
                "src/main.ts"
            ]
        },

        workspace: {
            id:
                "test-workspace",

            root:
                repository,

            baseRevision:
                "test-base"
        }
    };
}


function createContract(
    verification:
        readonly VerificationStep[]
): IterationContract {
    return {
        id:
            "command-verification",

        objective:
            "Verify generated code",

        rationale:
            "Command verifier test",

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
                    "Change source code"
            }
        ],

        acceptanceCriteria: [
            "Verification passes"
        ],

        verification,

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
                0
        }
    };
}


async function createRepository():
    Promise<string>
{
    return mkdtemp(
        join(
            tmpdir(),
            "game-factory-command-verifier-"
        )
    );
}