import {
    describe,
    expect,
    it
} from "vitest";

import {
    HarnessCodingWorker,
    WorkspaceGuard,
    createAutonomousRun,
    type CodingHarness,
    type CodingHarnessInput,
    type IterationContract
} from "../src/index.js";


const contract:
    IterationContract = {
        id:
            "iteration-001",

        objective:
            "Change autonomy package",

        rationale:
            "Worker integration test",

        scope: {
            allowedPaths: [
                "packages/autonomy/**"
            ],

            forbiddenPaths: [
                "packages/autonomy/secrets/**"
            ]
        },

        changes: [
            {
                description:
                    "Implement change"
            }
        ],

        acceptanceCriteria: [
            "Change is valid"
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
    "HarnessCodingWorker",
    () => {
        it(
            "passes iteration context to the coding harness",
            async () => {
                let captured:
                    CodingHarnessInput |
                    undefined;

                const harness:
                    CodingHarness = {
                        async executeIteration(
                            input
                        ) {
                            captured =
                                input;

                            return {
                                summary:
                                    "Implemented change",

                                changedFiles: [
                                    "packages/autonomy/src/example.ts"
                                ]
                            };
                        }
                    };

                const worker =
                    new HarnessCodingWorker({
                        repositoryRoot:
                            ".",

                        harness,

                        workspace:
                            new WorkspaceGuard()
                    });

                const run =
                    createAutonomousRun({
                        id:
                            "run-001",

                        goal:
                            "Implement feature",

                        maxIterations:
                            3
                    });

                const result =
                    await worker.execute({
                        run,

                        contract,

                        attempt:
                            2,

                        previousVerification: {
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
                                        1
                                }
                            ]
                        },

                        repairInstructions: [
                            "Fix the type error"
                        ]
                    });

                expect(
                    captured?.runId
                ).toBe(
                    "run-001"
                );

                expect(
                    captured?.goal
                ).toBe(
                    "Implement feature"
                );

                expect(
                    captured?.contract
                ).toBe(
                    contract
                );

                expect(
                    captured?.attempt
                ).toBe(
                    2
                );

                expect(
                    captured
                        ?.previousVerification
                        ?.passed
                ).toBe(
                    false
                );

                expect(
                    captured
                        ?.repairInstructions
                ).toEqual([
                    "Fix the type error"
                ]);

                expect(
                    result
                ).toEqual({
                    summary:
                        "Implemented change",

                    changedFiles: [
                        "packages/autonomy/src/example.ts"
                    ]
                });
            }
        );


        it(
            "normalizes and deduplicates changed files",
            async () => {
                const harness:
                    CodingHarness = {
                        async executeIteration() {
                            return {
                                summary:
                                    "Changed files",

                                changedFiles: [
                                    "packages\\autonomy\\src\\worker.ts",
                                    "./packages/autonomy/src/worker.ts",
                                    "packages/autonomy/src/other.ts"
                                ]
                            };
                        }
                    };

                const worker =
                    new HarnessCodingWorker({
                        repositoryRoot:
                            ".",

                        harness,

                        workspace:
                            new WorkspaceGuard()
                    });

                const result =
                    await worker.execute({
                        run:
                            createAutonomousRun({
                                id:
                                    "run-normalize",

                                goal:
                                    "Normalize paths",

                                maxIterations:
                                    1
                            }),

                        contract,

                        attempt:
                            1
                    });

                expect(
                    result.changedFiles
                ).toEqual([
                    "packages/autonomy/src/worker.ts",
                    "packages/autonomy/src/other.ts"
                ]);
            }
        );


        it(
            "rejects changed files outside iteration scope",
            async () => {
                const harness:
                    CodingHarness = {
                        async executeIteration() {
                            return {
                                summary:
                                    "Changed forbidden file",

                                changedFiles: [
                                    "packages/ai/src/index.ts"
                                ]
                            };
                        }
                    };

                const worker =
                    new HarnessCodingWorker({
                        repositoryRoot:
                            ".",

                        harness,

                        workspace:
                            new WorkspaceGuard()
                    });

                await expect(
                    worker.execute({
                        run:
                            createAutonomousRun({
                                id:
                                    "run-outside",

                                goal:
                                    "Stay scoped",

                                maxIterations:
                                    1
                            }),

                        contract,

                        attempt:
                            1
                    })
                ).rejects.toThrow(
                    "outside iteration scope"
                );
            }
        );


        it(
            "rejects an empty harness summary",
            async () => {
                const harness:
                    CodingHarness = {
                        async executeIteration() {
                            return {
                                summary:
                                    "   ",

                                changedFiles:
                                    []
                            };
                        }
                    };

                const worker =
                    new HarnessCodingWorker({
                        repositoryRoot:
                            ".",

                        harness,

                        workspace:
                            new WorkspaceGuard()
                    });

                await expect(
                    worker.execute({
                        run:
                            createAutonomousRun({
                                id:
                                    "run-empty-summary",

                                goal:
                                    "Validate harness",

                                maxIterations:
                                    1
                            }),

                        contract,

                        attempt:
                            1
                    })
                ).rejects.toThrow(
                    "empty summary"
                );
            }
        );
    }
);