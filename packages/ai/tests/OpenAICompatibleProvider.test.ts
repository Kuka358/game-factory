import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    AIError,
    OpenAICompatibleProvider
} from "../src/index.js";

interface TestOutput {
    title:
        string;

    genre:
        string;
}

afterEach(
    () => {
        vi.unstubAllGlobals();
    }
);

describe(
    "OpenAICompatibleProvider",
    () => {
        it(
            "sends structured output request and parses JSON response",
            async () => {
                let capturedInput:
                    Parameters<
                        typeof fetch
                    >[0] |
                    undefined;

                let capturedInit:
                    Parameters<
                        typeof fetch
                    >[1] |
                    undefined;

                const fetchMock =
                    vi.fn(
                        async (
                            input:
                                Parameters<
                                    typeof fetch
                                >[0],

                            init?:
                                Parameters<
                                    typeof fetch
                                >[1]
                        ): Promise<Response> => {
                            capturedInput =
                                input;

                            capturedInit =
                                init;

                            return new Response(
                                JSON.stringify({
                                    model:
                                        "test-model",

                                    choices: [
                                        {
                                            message: {
                                                content:
                                                    JSON.stringify({
                                                        title:
                                                            "Dragon Escape",

                                                        genre:
                                                            "endless_runner"
                                                    })
                                            }
                                        }
                                    ],

                                    usage: {
                                        prompt_tokens:
                                            100,

                                        completion_tokens:
                                            50,

                                        total_tokens:
                                            150
                                    }
                                }),

                                {
                                    status:
                                        200,

                                    headers: {
                                        "content-type":
                                            "application/json"
                                    }
                                }
                            );
                        }
                    );

                vi.stubGlobal(
                    "fetch",
                    fetchMock
                );

                const provider =
                    new OpenAICompatibleProvider({
                        id:
                            "test",

                        baseUrl:
                            "http://localhost:1234/v1/",

                        apiKey:
                            "secret"
                    });

                const response =
                    await provider
                        .generate<TestOutput>({
                            model:
                                "test-model",

                            temperature:
                                0.2,

                            maxTokens:
                                1000,

                            messages: [
                                {
                                    role:
                                        "system",

                                    content:
                                        "Return a game specification."
                                },

                                {
                                    role:
                                        "user",

                                    content:
                                        "Knight runner"
                                }
                            ],

                            structuredOutput: {
                                name:
                                    "game_spec",

                                schema: {
                                    type:
                                        "object",

                                    properties: {
                                        title: {
                                            type:
                                                "string"
                                        },

                                        genre: {
                                            type:
                                                "string"
                                        }
                                    },

                                    required: [
                                        "title",
                                        "genre"
                                    ],

                                    additionalProperties:
                                        false
                                }
                            }
                        });

                expect(
                    response.data
                ).toEqual({
                    title:
                        "Dragon Escape",

                    genre:
                        "endless_runner"
                });

                expect(
                    response.provider
                ).toBe(
                    "test"
                );

                expect(
                    response.usage
                        ?.totalTokens
                ).toBe(
                    150
                );

                expect(
                    String(
                        capturedInput
                    )
                ).toBe(
                    "http://localhost:1234/v1/chat/completions"
                );

                expect(
                    capturedInit
                        ?.headers
                ).toMatchObject({
                    authorization:
                        "Bearer secret"
                });

                const body =
                    JSON.parse(
                        String(
                            capturedInit
                                ?.body
                        )
                    );

                expect(
                    body.model
                ).toBe(
                    "test-model"
                );

                expect(
                    body.response_format
                ).toEqual({
                    type:
                        "json_schema",

                    json_schema: {
                        name:
                            "game_spec",

                        strict:
                            true,

                        schema: {
                            type:
                                "object",

                            properties: {
                                title: {
                                    type:
                                        "string"
                                },

                                genre: {
                                    type:
                                        "string"
                                }
                            },

                            required: [
                                "title",
                                "genre"
                            ],

                            additionalProperties:
                                false
                        }
                    }
                });
            }
        );

        it(
            "rejects invalid structured JSON",
            async () => {
                vi.stubGlobal(
                    "fetch",

                    vi.fn(
                        async () =>
                            new Response(
                                JSON.stringify({
                                    choices: [
                                        {
                                            message: {
                                                content:
                                                    "{invalid json"
                                            }
                                        }
                                    ]
                                }),

                                {
                                    status:
                                        200
                                }
                            )
                    )
                );

                const provider =
                    new OpenAICompatibleProvider({
                        baseUrl:
                            "http://localhost:1234/v1/"
                    });

                await expect(
                    provider.generate({
                        model:
                            "test",

                        messages: [
                            {
                                role:
                                    "user",

                                content:
                                    "test"
                            }
                        ],

                        structuredOutput: {
                            name:
                                "result",

                            schema: {
                                type:
                                    "object"
                            }
                        }
                    })
                ).rejects.toMatchObject({
                    name:
                        "AIError",

                    code:
                        "structured_output_failed"
                });
            }
        );

        it(
            "reports HTTP errors",
            async () => {
                vi.stubGlobal(
                    "fetch",

                    vi.fn(
                        async () =>
                            new Response(
                                JSON.stringify({
                                    error: {
                                        message:
                                            "Invalid API key"
                                    }
                                }),

                                {
                                    status:
                                        401
                                }
                            )
                    )
                );

                const provider =
                    new OpenAICompatibleProvider({
                        baseUrl:
                            "http://localhost:1234/v1/"
                    });

                const promise =
                    provider.generate({
                        model:
                            "test",

                        messages: [
                            {
                                role:
                                    "user",

                                content:
                                    "test"
                            }
                        ]
                    });

                await expect(
                    promise
                ).rejects.toMatchObject({
                    name:
                        "AIError",

                    code:
                        "request_failed",

                    provider:
                        "openai-compatible"
                });
            }
        );
    }
);