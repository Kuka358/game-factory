import {
    describe,
    expect,
    it
} from "vitest";

import type {
    AIProvider,
    AIRequest,
    AIResponse
} from "../src/index.js";

interface TestOutput {
    title:
        string;

    valid:
        boolean;
}

class FakeAIProvider
    implements AIProvider
{
    readonly id =
        "fake";

    async generate<T>(
        request:
            AIRequest
    ): Promise<AIResponse<T>> {
        expect(
            request.model
        ).toBe(
            "test-model"
        );

        expect(
            request.messages
        ).toHaveLength(
            2
        );

        return {
            data: {
                title:
                    "Dragon Escape",

                valid:
                    true
            } as T,

            provider:
                this.id,

            model:
                request.model,

            usage: {
                inputTokens:
                    10,

                outputTokens:
                    20,

                totalTokens:
                    30
            }
        };
    }
}

describe(
    "AIProvider",
    () => {
        it(
            "supports typed structured generation",
            async () => {
                const provider:
                    AIProvider =
                    new FakeAIProvider();

                const response =
                    await provider
                        .generate<TestOutput>({
                            model:
                                "test-model",

                            messages: [
                                {
                                    role:
                                        "system",

                                    content:
                                        "Return JSON."
                                },

                                {
                                    role:
                                        "user",

                                    content:
                                        "Create a game."
                                }
                            ],

                            structuredOutput: {
                                name:
                                    "test-output",

                                schema: {
                                    type:
                                        "object",

                                    properties: {
                                        title: {
                                            type:
                                                "string"
                                        },

                                        valid: {
                                            type:
                                                "boolean"
                                        }
                                    },

                                    required: [
                                        "title",
                                        "valid"
                                    ]
                                }
                            }
                        });

                expect(
                    response.data
                ).toEqual({
                    title:
                        "Dragon Escape",

                    valid:
                        true
                });

                expect(
                    response.provider
                ).toBe(
                    "fake"
                );

                expect(
                    response.usage
                        ?.totalTokens
                ).toBe(
                    30
                );
            }
        );
    }
);