import {
    describe,
    expect,
    it
} from "vitest";

import {
    DeterministicPlanningContextBuilder,
    type AutonomousRun,
    type IterationRecord
} from "../src/index.js";


const contract = {
    id:
        "iteration-001",

    objective:
        "Implement bounded behaviour",

    rationale:
        "Advance the run",

    scope: {
        allowedPaths: [
            "packages/example/**"
        ],

        forbiddenPaths:
            []
    },

    changes: [
        {
            description:
                "Update implementation"
        }
    ],

    acceptanceCriteria: [
        "Verification passes"
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
} as const;


function createCompletedIteration(
    id:
        string,

    changedFiles:
        readonly string[] = [
            `packages/example/${id}.ts`
        ]
): IterationRecord {
    return {
        contract: {
            ...contract,

            id,

            objective:
                `Objective for ${id}`
        },

        attempts: [
            {
                attempt:
                    1,

                startedAt:
                    "2026-10-01T00:00:00.000Z",

                completedAt:
                    "2026-10-01T00:00:01.000Z",

                verification: {
                    passed:
                        true,

                    checks: [
                        {
                            id:
                                "typecheck",

                            command:
                                "pnpm typecheck",

                            passed:
                                true,

                            exitCode:
                                0
                        },

                        {
                            id:
                                "optional-lint",

                            command:
                                "pnpm lint",

                            passed:
                                false,

                            exitCode:
                                1
                        }
                    ]
                }
            }
        ],

        completed:
            true,

        checkpointId:
            `checkpoint-${id}`,

        acceptance: {
            id:
                `acceptance-${id}`,

            status:
                "accepted",

            attempt:
                1,

            baseRevision:
                "base-revision",

            digest:
                `digest-${id}`,

            changedFiles,

            createdAt:
                "2026-10-01T00:00:01.000Z",

            acceptedRevision:
                `revision-${id}`,

            acceptedAt:
                "2026-10-01T00:00:02.000Z"
        }
    };
}


function createRun(
    iterations:
        IterationRecord[] = []
): AutonomousRun {
    return {
        id:
            "planning-run",

        goal:
            "Build the requested feature safely",

        status:
            "planning",

        currentIteration:
            iterations.filter(
                iteration =>
                    iteration.completed
            ).length,

        maxIterations:
            10,

        iterations,

        createdAt:
            "2026-10-01T00:00:00.000Z",

        updatedAt:
            "2026-10-01T00:00:00.000Z"
    };
}


describe(
    "DeterministicPlanningContextBuilder",
    () => {
        it(
            "builds bounded planning context from accepted run history",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder();


                const context =
                    builder.build({
                        run:
                            createRun([
                                createCompletedIteration(
                                    "iteration-001"
                                )
                            ])
                    });


                expect(
                    context
                ).toEqual({
                    run: {
                        id:
                            "planning-run",

                        goal:
                            "Build the requested feature safely"
                    },

                    progress: {
                        currentIteration:
                            1,

                        maxIterations:
                            10,

                        remainingIterations:
                            9,

                        completedIterationCount:
                            1
                    },

                    completedIterations: [
                        {
                            id:
                                "iteration-001",

                            objective:
                                "Objective for iteration-001",

                            attemptsPerformed:
                                1,

                            changedFiles: [
                                "packages/example/iteration-001.ts"
                            ],

                            latestVerification: {
                                passed:
                                    true,

                                failedCheckIds: [
                                    "optional-lint"
                                ]
                            }
                        }
                    ],

                    omitted: {
                        completedIterations:
                            0,

                        changedFiles:
                            0
                    }
                });
            }
        );


        it(
            "keeps only the most recent completed iterations",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder({
                        maxCompletedIterations:
                            2
                    });


                const context =
                    builder.build({
                        run:
                            createRun([
                                createCompletedIteration(
                                    "iteration-001"
                                ),

                                createCompletedIteration(
                                    "iteration-002"
                                ),

                                createCompletedIteration(
                                    "iteration-003"
                                )
                            ])
                    });


                expect(
                    context.completedIterations
                        .map(
                            iteration =>
                                iteration.id
                        )
                ).toEqual([
                    "iteration-002",
                    "iteration-003"
                ]);


                expect(
                    context.omitted
                        .completedIterations
                ).toBe(
                    1
                );


                expect(
                    context.progress
                        .completedIterationCount
                ).toBe(
                    3
                );
            }
        );


        it(
            "bounds changed files without widening planning history",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder({
                        maxChangedFilesPerIteration:
                            2
                    });


                const context =
                    builder.build({
                        run:
                            createRun([
                                createCompletedIteration(
                                    "iteration-001",
                                    [
                                        "a.ts",
                                        "b.ts",
                                        "c.ts",
                                        "d.ts"
                                    ]
                                )
                            ])
                    });


                expect(
                    context.completedIterations[0]
                        ?.changedFiles
                ).toEqual([
                    "a.ts",
                    "b.ts"
                ]);


                expect(
                    context.omitted
                        .changedFiles
                ).toBe(
                    2
                );
            }
        );


        it(
            "includes explicit bounded replan context",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder();


                const context =
                    builder.build({
                        run:
                            createRun(),

                        replan: {
                            previousIterationId:
                                "failed-iteration",

                            previousObjective:
                                "Implement the first design",

                            reason:
                                "The current iteration design cannot satisfy the deterministic verifier"
                        }
                    });


                expect(
                    context.replan
                ).toEqual({
                    previousIterationId:
                        "failed-iteration",

                    previousObjective:
                        "Implement the first design",

                    reason:
                        "The current iteration design cannot satisfy the deterministic verifier"
                });
            }
        );


        it(
            "does not expose orchestration internals from iteration state",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder();


                const iteration =
                    createCompletedIteration(
                        "iteration-001"
                    );


                iteration.workspace = {
                    id:
                        "workspace-secret",

                    root:
                        "D:/secret/worktree/path",

                    baseRevision:
                        "workspace-base"
                };


                const context =
                    builder.build({
                        run:
                            createRun([
                                iteration
                            ])
                    });


                const serialized =
                    JSON.stringify(
                        context
                    );


                expect(
                    serialized
                ).not.toContain(
                    "checkpoint-iteration-001"
                );

                expect(
                    serialized
                ).not.toContain(
                    "acceptance-iteration-001"
                );

                expect(
                    serialized
                ).not.toContain(
                    "workspace-secret"
                );

                expect(
                    serialized
                ).not.toContain(
                    "D:/secret/worktree/path"
                );
            }
        );


        it(
            "ignores incomplete iteration records",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder();


                const incomplete:
                    IterationRecord = {
                        contract: {
                            ...contract,

                            id:
                                "incomplete"
                        },

                        attempts:
                            [],

                        completed:
                            false
                    };


                const context =
                    builder.build({
                        run:
                            createRun([
                                createCompletedIteration(
                                    "completed"
                                ),

                                incomplete
                            ])
                    });


                expect(
                    context.completedIterations
                        .map(
                            iteration =>
                                iteration.id
                        )
                ).toEqual([
                    "completed"
                ]);


                expect(
                    context.progress
                        .completedIterationCount
                ).toBe(
                    1
                );
            }
        );


        it(
            "bounds long model-facing text",
            () => {
                const builder =
                    new DeterministicPlanningContextBuilder({
                        maxGoalChars:
                            128,

                        maxObjectiveChars:
                            128,

                        maxReplanReasonChars:
                            128
                    });


                const run =
                    createRun([
                        createCompletedIteration(
                            "iteration-001"
                        )
                    ]);


                run.goal =
                    `HEAD-${"x".repeat(
                        300
                    )}-TAIL`;

                run.iterations[0]
                    .contract.objective =
                    `OBJECTIVE-${"y".repeat(
                        300
                    )}-END`;


                const context =
                    builder.build({
                        run,

                        replan: {
                            previousIterationId:
                                "iteration-replan",

                            previousObjective:
                                `PREVIOUS-${"z".repeat(
                                    300
                                )}-END`,

                            reason:
                                `REASON-${"q".repeat(
                                    300
                                )}-END`
                        }
                    });


                expect(
                    context.run.goal.length
                ).toBeLessThanOrEqual(
                    128
                );

                expect(
                    context.run.goal
                ).toContain(
                    "...[truncated]..."
                );


                expect(
                    context.completedIterations[0]
                        ?.objective.length
                ).toBeLessThanOrEqual(
                    128
                );

                expect(
                    context.completedIterations[0]
                        ?.objective
                ).toContain(
                    "...[truncated]..."
                );


                expect(
                    context.replan
                        ?.previousObjective.length
                ).toBeLessThanOrEqual(
                    128
                );

                expect(
                    context.replan
                        ?.reason.length
                ).toBeLessThanOrEqual(
                    128
                );
            }
        );


        it(
            "rejects invalid builder budgets",
            () => {
                expect(
                    () =>
                        new DeterministicPlanningContextBuilder({
                            maxCompletedIterations:
                                0
                        })
                ).toThrow(
                    "maxCompletedIterations must be a positive integer"
                );


                expect(
                    () =>
                        new DeterministicPlanningContextBuilder({
                            maxChangedFilesPerIteration:
                                0
                        })
                ).toThrow(
                    "maxChangedFilesPerIteration must be a positive integer"
                );


                expect(
                    () =>
                        new DeterministicPlanningContextBuilder({
                            maxGoalChars:
                                127
                        })
                ).toThrow(
                    "maxGoalChars must be an integer greater than or equal to 128"
                );
            }
        );
    }
);