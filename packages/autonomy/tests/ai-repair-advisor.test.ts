import {
    describe,
    expect,
    it
} from "vitest";

import type {
    AIProvider,
    AIRequest
} from "@game-factory/ai";

import {
    AIRepairAdvisor
} from "../src/ai-repair-advisor.js";

import type {
    RepairContext
} from "../src/repair-context.js";


const context:
    RepairContext = {
        run: {
            id:
                "repair-run",

            goal:
                "Repair the implementation"
        },

        iteration: {
            id:
                "repair-iteration",

            objective:
                "Preserve runtime behaviour",

            rationale:
                "Deterministic verification failed",

            allowedPaths: [
                "src/a.ts"
            ],

            forbiddenPaths: [
                ".env"
            ],

            changes: [
                {
                    description:
                        "Repair implementation",

                    filesHint: [
                        "src/a.ts"
                    ]
                }
            ],

            acceptanceCriteria: [
                "Runtime passes"
            ],

            architecturalConstraints: [
                "Keep the public API unchanged"
            ]
        },

        attemptsPerformed:
            2,

        latestWorker: {
            summary:
                "Changed implementation",

            changedFiles: [
                "src/a.ts"
            ]
        },

        failedChecks: [
            {
                id:
                    "runtime",

                command:
                    "node verify.mjs",

                exitCode:
                    1,

                stderr:
                    "Expected 84, received 55"
            }
        ],

        attemptHistory:
            [],

        omitted: {
            failedChecks:
                0,

            changedFiles:
                0,

            attemptHistory:
                0,

            allowedPaths:
                0,

            forbiddenPaths:
                0
        }
    };


describe(
    "AIRepairAdvisor",
    () => {
        it(
            "requests a structured repair plan from the provider",
            async () => {
                let captured:
                    AIRequest |
                    undefined;


                const provider =
                    createProvider(
                        {
                            strategy:
                                "repair",

                            diagnosis:
                                "Runtime behaviour changed",

                            failedChecks: [
                                "runtime"
                            ],

                            instructions: [
                                "Restore the original safety calculation"
                            ],

                            filesHint: [
                                "src/a.ts"
                            ],

                            preserve: [
                                "Keep the public API unchanged"
                            ],

                            reason:
                                "",

                            question:
                                ""
                        },

                        request => {
                            captured =
                                request;
                        }
                    );


                const advisor =
                    new AIRepairAdvisor({
                        provider,

                        model:
                            "repair-model"
                    });


                const result =
                    await advisor.advise(
                        context
                    );


                expect(
                    result
                ).toEqual({
                    strategy:
                        "repair",

                    diagnosis:
                        "Runtime behaviour changed",

                    failedChecks: [
                        "runtime"
                    ],

                    instructions: [
                        "Restore the original safety calculation"
                    ],

                    filesHint: [
                        "src/a.ts"
                    ],

                    preserve: [
                        "Keep the public API unchanged"
                    ]
                });


                expect(
                    captured?.model
                ).toBe(
                    "repair-model"
                );


                expect(
                    captured?.structuredOutput
                        ?.name
                ).toBe(
                    "repair_plan"
                );


                expect(
                    captured?.maxTokens
                ).toBe(
                    2_048
                );


                const userMessage =
                    captured?.messages
                        .find(
                            message =>
                                message.role ===
                                "user"
                        );


                expect(
                    typeof userMessage
                        ?.content
                ).toBe(
                    "string"
                );


                expect(
                    JSON.parse(
                        userMessage
                            ?.content as string
                    )
                ).toEqual(
                    context
                );
            }
        );


        it(
            "returns a structured replan decision",
            async () => {
                const advisor =
                    new AIRepairAdvisor({
                        provider:
                            createProvider({
                                strategy:
                                    "replan",

                                diagnosis:
                                    "The current iteration scope is insufficient",

                                failedChecks: [
                                    "runtime"
                                ],

                                instructions:
                                    [],

                                filesHint:
                                    [],

                                preserve:
                                    [],

                                reason:
                                    "Create a different iteration",

                                question:
                                    ""
                            }),

                        model:
                            "repair-model"
                    });


                await expect(
                    advisor.advise(
                        context
                    )
                ).resolves.toEqual({
                    strategy:
                        "replan",

                    diagnosis:
                        "The current iteration scope is insufficient",

                    failedChecks: [
                        "runtime"
                    ],

                    reason:
                        "Create a different iteration"
                });
            }
        );


        it(
            "returns an architecture escalation",
            async () => {
                const advisor =
                    new AIRepairAdvisor({
                        provider:
                            createProvider({
                                strategy:
                                    "architecture_required",

                                diagnosis:
                                    "Package ownership is unresolved",

                                failedChecks: [
                                    "runtime"
                                ],

                                instructions:
                                    [],

                                filesHint:
                                    [],

                                preserve:
                                    [],

                                reason:
                                    "",

                                question:
                                    "Which package should own this abstraction?"
                            }),

                        model:
                            "repair-model"
                    });


                await expect(
                    advisor.advise(
                        context
                    )
                ).resolves.toEqual({
                    strategy:
                        "architecture_required",

                    diagnosis:
                        "Package ownership is unresolved",

                    failedChecks: [
                        "runtime"
                    ],

                    question:
                        "Which package should own this abstraction?"
                });
            }
        );


        it(
            "returns an abort decision",
            async () => {
                const advisor =
                    new AIRepairAdvisor({
                        provider:
                            createProvider({
                                strategy:
                                    "abort",

                                diagnosis:
                                    "Continuing would violate required behaviour",

                                failedChecks: [
                                    "runtime"
                                ],

                                instructions:
                                    [],

                                filesHint:
                                    [],

                                preserve:
                                    [],

                                reason:
                                    "Stop the iteration",

                                question:
                                    ""
                            }),

                        model:
                            "repair-model"
                    });


                await expect(
                    advisor.advise(
                        context
                    )
                ).resolves.toEqual({
                    strategy:
                        "abort",

                    diagnosis:
                        "Continuing would violate required behaviour",

                    failedChecks: [
                        "runtime"
                    ],

                    reason:
                        "Stop the iteration"
                });
            }
        );


        it(
            "rejects conflicting fixed-shape fields",
            async () => {
                const advisor =
                    new AIRepairAdvisor({
                        provider:
                            createProvider({
                                strategy:
                                    "repair",

                                diagnosis:
                                    "Repair required",

                                failedChecks: [
                                    "runtime"
                                ],

                                instructions: [
                                    "Fix it"
                                ],

                                filesHint:
                                    [],

                                preserve:
                                    [],

                                reason:
                                    "This must not be populated",

                                question:
                                    ""
                            }),

                        model:
                            "repair-model"
                    });


                await expect(
                    advisor.advise(
                        context
                    )
                ).rejects.toThrow(
                    "reason must be empty for repair"
                );
            }
        );


        it(
            "rejects structurally invalid provider output",
            async () => {
                const advisor =
                    new AIRepairAdvisor({
                        provider:
                            createProvider({
                                strategy:
                                    "repair",

                                diagnosis:
                                    "Repair required",

                                failedChecks:
                                    [],

                                instructions:
                                    [],

                                filesHint:
                                    [],

                                preserve:
                                    [],

                                reason:
                                    "",

                                question:
                                    ""
                            }),

                        model:
                            "repair-model"
                    });


                await expect(
                    advisor.advise(
                        context
                    )
                ).rejects.toThrow(
                    "Repair plan failedChecks must not be empty"
                );
            }
        );
    }
);


function createProvider(
    response:
        {
            strategy:
                string;

            diagnosis:
                string;

            failedChecks:
                readonly string[];

            instructions:
                readonly string[];

            filesHint:
                readonly string[];

            preserve:
                readonly string[];

            reason:
                string;

            question:
                string;
        },

    capture?:
        (
            request:
                AIRequest
        ) => void
): AIProvider {
    return {
        id:
            "fake-repair-ai",

        async generate<T>(
            request:
                AIRequest
        ) {
            capture?.(
                request
            );


            return {
                data:
                    response as T,

                provider:
                    "fake-repair-ai",

                model:
                    request.model
            };
        }
    };
}