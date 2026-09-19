import {
    describe,
    expect,
    it
} from "vitest";

import {
    ConservativeUtf8TokenEstimator,
    createModelContextBudget,
    estimateModelInputTokens
} from "../src/index.js";


describe(
    "model context budget",
    () => {
        it(
            "conservatively estimates UTF-8 text",
            () => {
                const estimator =
                    new ConservativeUtf8TokenEstimator();


                expect(
                    estimator.estimateTokens(
                        ""
                    )
                ).toBe(
                    0
                );


                expect(
                    estimator.estimateTokens(
                        "abcdefg"
                    )
                ).toBe(
                    3
                );


                /*
                 * 😀 is four UTF-8 bytes.
                 */
                expect(
                    estimator.estimateTokens(
                        "😀"
                    )
                ).toBe(
                    2
                );
            }
        );


        it(
            "reserves output and safety margin from the context window",
            () => {
                const budget =
                    createModelContextBudget(
                        {
                            contextWindowTokens:
                                32_768,

                            safetyMarginTokens:
                                2_048,

                            requestOverheadTokens:
                                512
                        },

                        8_192
                    );


                expect(
                    budget
                ).toEqual({
                    contextWindowTokens:
                        32_768,

                    reservedOutputTokens:
                        8_192,

                    safetyMarginTokens:
                        2_048,

                    requestOverheadTokens:
                        512,

                    maxInputTokens:
                        22_528
                });
            }
        );


        it(
            "includes protocol overhead system user and schema estimates",
            () => {
                const estimator = {
                    estimateTokens(
                        text:
                            string
                    ) {
                        return text.length;
                    }
                };


                const budget =
                    createModelContextBudget(
                        {
                            contextWindowTokens:
                                1_000,

                            safetyMarginTokens:
                                0,

                            requestOverheadTokens:
                                7
                        },

                        100
                    );


                const schema = {
                    type:
                        "object"
                };


                const estimate =
                    estimateModelInputTokens({
                        budget,

                        estimator,

                        systemPrompt:
                            "abcd",

                        userPrompt:
                            "xy",

                        responseSchema:
                            schema
                    });


                expect(
                    estimate
                ).toBe(
                    7 +
                    4 +
                    2 +
                    JSON.stringify(
                        schema
                    ).length
                );
            }
        );


        it(
            "rejects impossible context budgets",
            () => {
                expect(
                    () =>
                        createModelContextBudget(
                            {
                                contextWindowTokens:
                                    4_096,

                                safetyMarginTokens:
                                    1_024,

                                requestOverheadTokens:
                                    512
                            },

                            3_000
                        )
                ).toThrow(
                    "leaves no room for input"
                );
            }
        );
    }
);