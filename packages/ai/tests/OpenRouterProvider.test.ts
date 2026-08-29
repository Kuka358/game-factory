import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    OpenRouterProvider
} from "../src/index.js";

afterEach(
    () => {
        vi.unstubAllGlobals();
    }
);

describe(
    "OpenRouterProvider",
    () => {
        it(
            "uses OpenRouter endpoint and headers",
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
                                        "test/model",

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
                                        200
                                }
                            );
                        }
                    )
                );

                const provider =
                    new OpenRouterProvider({
                        apiKey:
                            "secret-key",

                        siteUrl:
                            "https://game-factory.local",

                        appName:
                            "Game Factory"
                    });

                const result =
                    await provider
                        .generate<string>({
                            model:
                                "test/model",

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
                    "openrouter"
                );

                expect(
                    String(
                        capturedInput
                    )
                ).toBe(
                    "https://openrouter.ai/api/v1/chat/completions"
                );

                expect(
                    capturedInit?.headers
                ).toMatchObject({
                    authorization:
                        "Bearer secret-key",

                    "HTTP-Referer":
                        "https://game-factory.local",

                    "X-Title":
                        "Game Factory"
                });
            }
        );
    }
);