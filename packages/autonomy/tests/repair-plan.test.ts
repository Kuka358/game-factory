import {
    describe,
    expect,
    it
} from "vitest";

import {
    validateRepairPlan
} from "../src/repair-plan.js";


describe(
    "validateRepairPlan",
    () => {
        it(
            "validates a structured repair plan",
            () => {
                const plan =
                    validateRepairPlan({
                        strategy:
                            "repair",

                        diagnosis:
                            "Typecheck failed after the shared API changed",

                        failedChecks: [
                            "typecheck"
                        ],

                        instructions: [
                            "Update the consumer to use the new API"
                        ],

                        filesHint: [
                            "packages/example/src/consumer.ts"
                        ],

                        preserve: [
                            "Keep the public runtime API unchanged"
                        ]
                    });


                expect(
                    plan
                ).toEqual({
                    strategy:
                        "repair",

                    diagnosis:
                        "Typecheck failed after the shared API changed",

                    failedChecks: [
                        "typecheck"
                    ],

                    instructions: [
                        "Update the consumer to use the new API"
                    ],

                    filesHint: [
                        "packages/example/src/consumer.ts"
                    ],

                    preserve: [
                        "Keep the public runtime API unchanged"
                    ]
                });
            }
        );


        it(
            "validates a replan decision",
            () => {
                expect(
                    validateRepairPlan({
                        strategy:
                            "replan",

                        diagnosis:
                            "The iteration scope cannot satisfy the required architecture",

                        failedChecks: [
                            "architecture"
                        ],

                        reason:
                            "The planner must widen the iteration design"
                    })
                ).toEqual({
                    strategy:
                        "replan",

                    diagnosis:
                        "The iteration scope cannot satisfy the required architecture",

                    failedChecks: [
                        "architecture"
                    ],

                    reason:
                        "The planner must widen the iteration design"
                });
            }
        );


        it(
            "validates an architecture escalation",
            () => {
                expect(
                    validateRepairPlan({
                        strategy:
                            "architecture_required",

                        diagnosis:
                            "Two package boundaries conflict",

                        failedChecks: [
                            "structure"
                        ],

                        question:
                            "Which package should own the shared abstraction?"
                    })
                ).toEqual({
                    strategy:
                        "architecture_required",

                    diagnosis:
                        "Two package boundaries conflict",

                    failedChecks: [
                        "structure"
                    ],

                    question:
                        "Which package should own the shared abstraction?"
                });
            }
        );


        it(
            "validates an abort decision",
            () => {
                expect(
                    validateRepairPlan({
                        strategy:
                            "abort",

                        diagnosis:
                            "The verifier proves the requested invariant cannot be preserved",

                        failedChecks: [
                            "runtime"
                        ],

                        reason:
                            "Stop before introducing a behavioural regression"
                    })
                ).toEqual({
                    strategy:
                        "abort",

                    diagnosis:
                        "The verifier proves the requested invariant cannot be preserved",

                    failedChecks: [
                        "runtime"
                    ],

                    reason:
                        "Stop before introducing a behavioural regression"
                });
            }
        );


        it(
            "rejects a repair plan without instructions",
            () => {
                expect(
                    () =>
                        validateRepairPlan({
                            strategy:
                                "repair",

                            diagnosis:
                                "Broken",

                            failedChecks: [
                                "typecheck"
                            ],

                            instructions:
                                [],

                            filesHint:
                                [],

                            preserve:
                                []
                        })
                ).toThrow(
                    "Repair plan instructions must not be empty"
                );
            }
        );


        it(
            "rejects a plan without failed verifier checks",
            () => {
                expect(
                    () =>
                        validateRepairPlan({
                            strategy:
                                "abort",

                            diagnosis:
                                "Broken",

                            failedChecks:
                                [],

                            reason:
                                "Stop"
                        })
                ).toThrow(
                    "Repair plan failedChecks must not be empty"
                );
            }
        );


        it(
            "rejects whitespace-only structured values",
            () => {
                expect(
                    () =>
                        validateRepairPlan({
                            strategy:
                                "replan",

                            diagnosis:
                                " ",

                            failedChecks: [
                                "typecheck"
                            ],

                            reason:
                                "Replan"
                        })
                ).toThrow(
                    "Repair plan diagnosis must be a non-empty string"
                );
            }
        );


        it(
            "rejects unexpected strategy-specific fields",
            () => {
                expect(
                    () =>
                        validateRepairPlan({
                            strategy:
                                "repair",

                            diagnosis:
                                "Broken",

                            failedChecks: [
                                "typecheck"
                            ],

                            instructions: [
                                "Fix it"
                            ],

                            filesHint:
                                [],

                            preserve:
                                [],

                            shellCommand:
                                "something unsafe"
                        })
                ).toThrow(
                    "Repair plan contains unexpected fields for repair"
                );
            }
        );
    }
);