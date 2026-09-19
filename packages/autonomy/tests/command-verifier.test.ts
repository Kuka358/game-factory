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