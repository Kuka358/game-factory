import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    LMStudioProvider
} from "../src/index.js";


afterEach(
    () => {
        vi.unstubAllGlobals();
    }
);


describe(
    "LMStudioProvider",
    () => {
        it(
            "uses the default LM Studio OpenAI-compatible endpoint",
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

                vi.stubGlobal(
                    "fetch",

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
                                        "qwen-local",

                                    choices: [
                                        {
                                            message: {
                                                content:
                                                    "hello"
                                            }
                                        }
                                    ]
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
                    )
                );

                const provider =
                    new LMStudioProvider();

                const result =
                    await provider
                        .generate<string>({
                            model:
                                "qwen-local",

                            messages: [
                                {
                                    role:
                                        "user",

                                    content:
                                        "Hello"
                                }
                            ]
                        });

                expect(
                    result.data
                ).toBe(
                    "hello"
                );

                expect(
                    result.provider
                ).toBe(
                    "lm-studio"
                );

                expect(
                    String(
                        capturedInput
                    )
                ).toBe(
                    "http://127.0.0.1:1234/v1/chat/completions"
                );

                expect(
                    capturedInit
                        ?.headers
                ).not.toHaveProperty(
                    "authorization"
                );
            }
        );


        it(
            "supports structured output through LM Studio",
            async () => {
                let capturedInit:
                    Parameters<
                        typeof fetch
                    >[1] |
                    undefined;

                vi.stubGlobal(
                    "fetch",

                    vi.fn(
                        async (
                            _input:
                                Parameters<
                                    typeof fetch
                                >[0],

                            init?:
                                Parameters<
                                    typeof fetch
                                >[1]
                        ): Promise<Response> => {
                            capturedInit =
                                init;

                            return new Response(
                                JSON.stringify({
                                    model:
                                        "qwen-local",

                                    choices: [
                                        {
                                            message: {
                                                content:
                                                    JSON.stringify({
                                                        action:
                                                            "edit"
                                                    })
                                            }
                                        }
                                    ]
                                }),

                                {
                                    status:
                                        200
                                }
                            );
                        }
                    )
                );

                const provider =
                    new LMStudioProvider();

                const result =
                    await provider.generate<{
                        action:
                            string;
                    }>({
                        model:
                            "qwen-local",

                        messages: [
                            {
                                role:
                                    "user",

                                content:
                                    "Choose an action."
                            }
                        ],

                        structuredOutput: {
                            name:
                                "coding_action",

                            schema: {
                                type:
                                    "object",

                                properties: {
                                    action: {
                                        type:
                                            "string"
                                    }
                                },

                                required: [
                                    "action"
                                ],

                                additionalProperties:
                                    false
                            }
                        }
                    });

                expect(
                    result.data
                ).toEqual({
                    action:
                        "edit"
                });

                const body =
                    JSON.parse(
                        String(
                            capturedInit
                                ?.body
                        )
                    );

                expect(
                    body.response_format
                ).toMatchObject({
                    type:
                        "json_schema",

                    json_schema: {
                        name:
                            "coding_action",

                        strict:
                            true
                    }
                });
            }
        );


        it(
            "supports custom server settings",
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

                vi.stubGlobal(
                    "fetch",

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
                                    choices: [
                                        {
                                            message: {
                                                content:
                                                    "ok"
                                            }
                                        }
                                    ]
                                }),

                                {
                                    status:
                                        200
                                }
                            );
                        }
                    )
                );

                const provider =
                    new LMStudioProvider({
                        baseUrl:
                            "http://192.168.1.100:5000/v1/",

                        apiKey:
                            "local-secret",

                        bodyExtras: {
                            seed:
                                42
                        }
                    });

                await provider
                    .generate<string>({
                        model:
                            "qwen",

                        messages: [
                            {
                                role:
                                    "user",

                                content:
                                    "test"
                            }
                        ]
                    });

                expect(
                    String(
                        capturedInput
                    )
                ).toBe(
                    "http://192.168.1.100:5000/v1/chat/completions"
                );

                expect(
                    capturedInit
                        ?.headers
                ).toMatchObject({
                    authorization:
                        "Bearer local-secret"
                });

                const body =
                    JSON.parse(
                        String(
                            capturedInit
                                ?.body
                        )
                    );

                expect(
                    body.seed
                ).toBe(
                    42
                );
            }
        );
    }
);