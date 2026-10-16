import {
    describe,
    expect,
    it
} from "vitest";

import {
    DeterministicRepairContextBuilder
} from "../src/repair-context.js";

import type {
    IterationContract
} from "../src/contracts.js";

import type {
    AutonomousRun,
    IterationAttempt,
    VerificationReport
} from "../src/state.js";


const contract:
    IterationContract = {
        id:
            "repair-context-iteration",

        objective:
            "Repair a deterministic verification failure",

        rationale:
            "The implementation must preserve existing behaviour",

        scope: {
            allowedPaths: [
                "packages/example/src/a.ts",
                "packages/example/src/b.ts"
            ],

            forbiddenPaths: [
                ".env"
            ]
        },

        changes: [
            {
                description:
                    "Repair the example implementation",

                filesHint: [
                    "packages/example/src/a.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "Typecheck passes",
            "Runtime behaviour is preserved"
        ],

        verification: [
            {
                id:
                    "typecheck",

                command:
                    "pnpm typecheck",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Keep the public API unchanged"
        ],

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


const run:
    AutonomousRun = {
        id:
            "repair-context-run",

        goal:
            "Repair the example",

        status:
            "escalating",

        currentIteration:
            0,

        maxIterations:
            3,

        iterations:
            [],

        createdAt:
            "2026-09-30T00:00:00.000Z",

        updatedAt:
            "2026-09-30T00:00:00.000Z"
    };


function failedVerification():
    VerificationReport
{
    return {
        passed:
            false,

        checks: [
            {
                id:
                    "typecheck",

                command:
                    "pnpm typecheck",

                passed:
                    false,

                exitCode:
                    2,

                stdout:
                    "compiler output",

                stderr:
                    "TS2322: string is not assignable to number"
            },

            {
                id:
                    "optional",

                command:
                    "pnpm optional",

                passed:
                    true,

                exitCode:
                    0
            }
        ]
    };
}


describe(
    "DeterministicRepairContextBuilder",
    () => {
        it(
            "builds a focused repair context from deterministic execution state",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder();


                const result =
                    builder.build({
                        run,

                        contract,

                        attempts:
                            2,

                        attemptHistory:
                            [],

                        verification:
                            failedVerification(),

                        workerResult: {
                            summary:
                                "Changed the implementation",

                            changedFiles: [
                                "packages/example/src/a.ts"
                            ]
                        }
                    });


                expect(
                    result.run
                ).toEqual({
                    id:
                        "repair-context-run",

                    goal:
                        "Repair the example"
                });


                expect(
                    result.iteration
                        .objective
                ).toBe(
                    "Repair a deterministic verification failure"
                );


                expect(
                    result.failedChecks
                ).toHaveLength(
                    1
                );


                expect(
                    result.failedChecks[0]
                        ?.id
                ).toBe(
                    "typecheck"
                );


                expect(
                    result.latestWorker
                ).toEqual({
                    summary:
                        "Changed the implementation",

                    changedFiles: [
                        "packages/example/src/a.ts"
                    ]
                });
            }
        );


        it(
            "includes only failed verifier checks",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder();


                const result =
                    builder.build({
                        run,

                        contract,

                        attempts:
                            1,

                        attemptHistory:
                            [],

                        verification:
                            failedVerification(),

                        workerResult: {
                            summary:
                                "Attempt",

                            changedFiles:
                                []
                        }
                    });


                expect(
                    result.failedChecks.map(
                        check =>
                            check.id
                    )
                ).toEqual([
                    "typecheck"
                ]);
            }
        );


        it(
            "bounds long diagnostics while preserving their beginning and end",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder({
                        maxDiagnosticChars:
                            128
                    });


                const prefix =
                    "BEGIN-DIAGNOSTIC-";

                const suffix =
                    "-END-DIAGNOSTIC";


                const verification:
                    VerificationReport = {
                        passed:
                            false,

                        checks: [
                            {
                                id:
                                    "runtime",

                                command:
                                    "node verify.mjs",

                                passed:
                                    false,

                                stderr:
                                    prefix +
                                    "x".repeat(
                                        500
                                    ) +
                                    suffix
                            }
                        ]
                    };


                const result =
                    builder.build({
                        run,

                        contract,

                        attempts:
                            1,

                        attemptHistory:
                            [],

                        verification,

                        workerResult: {
                            summary:
                                "Attempt",

                            changedFiles:
                                []
                        }
                    });


                const stderr =
                    result.failedChecks[0]
                        ?.stderr ??
                    "";


                expect(
                    stderr.length
                ).toBeLessThanOrEqual(
                    128
                );


                expect(
                    stderr
                ).toContain(
                    prefix
                );


                expect(
                    stderr
                ).toContain(
                    suffix
                );


                expect(
                    stderr
                ).toContain(
                    "[truncated"
                );
            }
        );


        it(
            "keeps only the most recent attempt history",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder({
                        maxAttemptHistory:
                            2
                    });


                const attempts:
                    IterationAttempt[] = [
                        {
                            attempt:
                                1,

                            startedAt:
                                "1",

                            error:
                                "first"
                        },

                        {
                            attempt:
                                2,

                            startedAt:
                                "2",

                            error:
                                "second"
                        },

                        {
                            attempt:
                                3,

                            startedAt:
                                "3",

                            error:
                                "third"
                        }
                    ];


                const result =
                    builder.build({
                        run,

                        contract,

                        attempts:
                            3,

                        attemptHistory:
                            attempts,

                        verification:
                            failedVerification(),

                        workerResult: {
                            summary:
                                "Attempt",

                            changedFiles:
                                []
                        }
                    });


                expect(
                    result.attemptHistory.map(
                        attempt =>
                            attempt.attempt
                    )
                ).toEqual([
                    2,
                    3
                ]);


                expect(
                    result.omitted
                        .attemptHistory
                ).toBe(
                    1
                );
            }
        );


        it(
            "bounds path collections and reports omitted entries",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder({
                        maxChangedFiles:
                            2,

                        maxScopePaths:
                            2
                    });


                const boundedContract:
                    IterationContract = {
                        ...contract,

                        scope: {
                            allowedPaths: [
                                "a",
                                "b",
                                "c"
                            ],

                            forbiddenPaths: [
                                "x",
                                "y",
                                "z"
                            ]
                        }
                    };


                const result =
                    builder.build({
                        run,

                        contract:
                            boundedContract,

                        attempts:
                            1,

                        attemptHistory:
                            [],

                        verification:
                            failedVerification(),

                        workerResult: {
                            summary:
                                "Attempt",

                            changedFiles: [
                                "one",
                                "two",
                                "three"
                            ]
                        }
                    });


                expect(
                    result.iteration
                        .allowedPaths
                ).toEqual([
                    "a",
                    "b"
                ]);


                expect(
                    result.latestWorker
                        .changedFiles
                ).toEqual([
                    "one",
                    "two"
                ]);


                expect(
                    result.omitted
                ).toMatchObject({
                    allowedPaths:
                        1,

                    forbiddenPaths:
                        1,

                    changedFiles:
                        1
                });
            }
        );


        it(
            "normalizes terminal output before exposing it to an advisor",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder();


                const verification:
                    VerificationReport = {
                        passed:
                            false,

                        checks: [
                            {
                                id:
                                    "typecheck",

                                command:
                                    "pnpm typecheck",

                                passed:
                                    false,

                                stderr:
                                    "\u001b[31mERROR\u001b[0m\r\nsecond line\r\n"
                            }
                        ]
                    };


                const result =
                    builder.build({
                        run,

                        contract,

                        attempts:
                            1,

                        attemptHistory:
                            [],

                        verification,

                        workerResult: {
                            summary:
                                "Attempt\r\n",

                            changedFiles:
                                []
                        }
                    });


                expect(
                    result.failedChecks[0]
                        ?.stderr
                ).toBe(
                    "ERROR\nsecond line"
                );


                expect(
                    result.latestWorker
                        .summary
                ).toBe(
                    "Attempt"
                );
            }
        );


        it(
            "rejects contexts that do not represent deterministic verifier failure",
            () => {
                const builder =
                    new DeterministicRepairContextBuilder();


                expect(
                    () =>
                        builder.build({
                            run,

                            contract,

                            attempts:
                                1,

                            attemptHistory:
                                [],

                            verification: {
                                passed:
                                    true,

                                checks:
                                    []
                            },

                            workerResult: {
                                summary:
                                    "Done",

                                changedFiles:
                                    []
                            }
                        })
                ).toThrow(
                    "Repair context requires a failed verification report"
                );


                expect(
                    () =>
                        new DeterministicRepairContextBuilder({
                            maxDiagnosticChars:
                                64
                        })
                ).toThrow(
                    "maxDiagnosticChars must be at least 128"
                );
            }
        );
    }
);