import {
    describe,
    expect,
    it
} from "vitest";

import {
    AdaptiveTokenEstimateCalibration,
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
            "only increases token estimates when real provider usage proves underestimation",
            () => {
                const calibration =
                    new AdaptiveTokenEstimateCalibration({
                        headroomFactor:
                            1.10,

                        maxMultiplier:
                            2
                    });


                expect(
                    calibration.currentMultiplier
                ).toBe(
                    1
                );


                const first =
                    calibration.observe(
                        100,
                        130
                    );


                expect(
                    first.actualToRawEstimateRatio
                ).toBeCloseTo(
                    1.3
                );


                expect(
                    first.previousMultiplier
                ).toBe(
                    1
                );


                expect(
                    first.nextMultiplier
                ).toBeCloseTo(
                    1.43
                );


                expect(
                    calibration.apply(
                        100
                    )
                ).toBe(
                    143
                );


                /*
                 * A later lower ratio must never reduce protection.
                 */
                const second =
                    calibration.observe(
                        100,
                        90
                    );


                expect(
                    second.nextMultiplier
                ).toBeCloseTo(
                    1.43
                );


                /*
                 * Extreme observations are bounded.
                 */
                const third =
                    calibration.observe(
                        100,
                        1_000
                    );


                expect(
                    third.nextMultiplier
                ).toBe(
                    2
                );


                expect(
                    calibration.apply(
                        100
                    )
                ).toBe(
                    200
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