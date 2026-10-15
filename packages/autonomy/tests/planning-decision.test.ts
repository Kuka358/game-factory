import {
    describe,
    expect,
    it
} from "vitest";

import {
    validatePlanningDecision
} from "../src/planning-decision.js";


function createIterationDecision():
    Record<string, unknown>
{
    return {
        type:
            "iteration",

        contract: {
            id:
                "iteration-001",

            objective:
                "Implement the requested behaviour",

            rationale:
                "Advance the autonomous run with one bounded change",

            scope: {
                allowedPaths: [
                    "packages/example/**"
                ],

                forbiddenPaths: [
                    "packages/example/secrets/**"
                ]
            },

            contextScope: {
                allowedPaths: [
                    "packages/example/**",
                    "packages/shared/**"
                ],

                forbiddenPaths: [
                    "packages/example/secrets/**"
                ]
            },

            changes: [
                {
                    description:
                        "Update the example implementation",

                    filesHint: [
                        "packages/example/src/index.ts"
                    ]
                }
            ],

            acceptanceCriteria: [
                "The requested behaviour is implemented",
                "Existing public behaviour is preserved"
            ],

            verification: [
                {
                    id:
                        "typecheck",

                    command:
                        "pnpm typecheck",

                    required:
                        true
                },

                {
                    id:
                        "lint",

                    command:
                        "pnpm lint",

                    required:
                        false
                }
            ],

            architecturalConstraints: [
                "Do not introduce a new package dependency"
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
        }
    };
}


describe(
    "validatePlanningDecision",
    () => {
        it(
            "validates a bounded iteration decision",
            () => {
                expect(
                    validatePlanningDecision(
                        createIterationDecision()
                    )
                ).toEqual(
                    createIterationDecision()
                );
            }
        );


        it(
            "validates a complete decision",
            () => {
                expect(
                    validatePlanningDecision({
                        type:
                            "complete",

                        reason:
                            "The requested goal is already satisfied"
                    })
                ).toEqual({
                    type:
                        "complete",

                    reason:
                        "The requested goal is already satisfied"
                });
            }
        );


        it(
            "validates a blocked decision",
            () => {
                expect(
                    validatePlanningDecision({
                        type:
                            "blocked",

                        reason:
                            "The goal requires a decision outside autonomous scope"
                    })
                ).toEqual({
                    type:
                        "blocked",

                    reason:
                        "The goal requires a decision outside autonomous scope"
                });
            }
        );


        it(
            "rejects unexpected planning-decision fields",
            () => {
                expect(
                    () =>
                        validatePlanningDecision({
                            type:
                                "complete",

                            reason:
                                "Done",

                            shellCommand:
                                "rm -rf something"
                        })
                ).toThrow(
                    "complete planning decision contains unexpected fields"
                );
            }
        );


        it(
            "rejects an iteration without writable scope",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.scope = {
                    allowedPaths:
                        [],

                    forbiddenPaths:
                        []
                };


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract scope allowedPaths must not be empty"
                );
            }
        );


        it(
            "rejects an iteration without concrete changes",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.changes =
                    [];


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract changes must not be empty"
                );
            }
        );


        it(
            "rejects an iteration without deterministic verification",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.verification =
                    [];


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract verification must not be empty"
                );
            }
        );


        it(
            "requires at least one required verification check",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.verification = [
                    {
                        id:
                            "lint",

                        command:
                            "pnpm lint",

                        required:
                            false
                    }
                ];


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "must contain at least one required check"
                );
            }
        );


        it(
            "rejects duplicate verification ids",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.verification = [
                    {
                        id:
                            "typecheck",

                        command:
                            "pnpm typecheck",

                        required:
                            true
                    },

                    {
                        id:
                            "typecheck",

                        command:
                            "pnpm test",

                        required:
                            true
                    }
                ];


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract verification ids must not contain duplicates"
                );
            }
        );


        it(
            "rejects an invalid local-attempt budget",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.maxLocalAttempts =
                    0;


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract maxLocalAttempts must be a positive integer"
                );
            }
        );


        it(
            "rejects a negative escalation repair budget",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.escalation = {
                    onRepeatedFailure:
                        true,

                    onArchitectureConflict:
                        true,

                    maxRepairRounds:
                        -1
                };


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "Iteration contract escalation maxRepairRounds must be a non-negative integer"
                );
            }
        );


        it(
            "rejects unexpected fields inside the iteration contract",
            () => {
                const decision =
                    createIterationDecision();

                const contract =
                    decision.contract as
                        Record<string, unknown>;

                contract.shellCommand =
                    "something unsafe";


                expect(
                    () =>
                        validatePlanningDecision(
                            decision
                        )
                ).toThrow(
                    "iteration contract contains unexpected fields"
                );
            }
        );
    }
);