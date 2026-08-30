import {
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    ComfyUIProvider,

    type ComfyUIWorkflow
} from "../src/index.js";

const workflow:
    ComfyUIWorkflow = {
    "1": {
        class_type:
            "CLIPTextEncode",

        inputs: {
            text:
                "__GF_PROMPT__, exactly one character, full body"
        }
    },

    "2": {
        class_type:
            "CLIPTextEncode",

        inputs: {
            text:
                "__GF_NEGATIVE_PROMPT__, sprite sheet, multiple poses"
        }
    },

    "3": {
        class_type:
            "EmptyLatentImage",

        inputs: {
            width:
                "__GF_WIDTH__",

            height:
                "__GF_HEIGHT__"
        }
    },

    "4": {
        class_type:
            "KSampler",

        inputs: {
            seed:
                "__GF_SEED__"
        }
    }
};

describe(
    "ComfyUIProvider",
    () => {
        it(
            "queues workflow, waits for output and downloads image",
            async () => {
                const fetchMock =
                    vi.fn<
                        typeof fetch
                    >();

                fetchMock
                    .mockResolvedValueOnce(
                        jsonResponse({
                            prompt_id:
                                "prompt-123",

                            node_errors:
                                {}
                        })
                    )
                    .mockResolvedValueOnce(
                        jsonResponse({})
                    )
                    .mockResolvedValueOnce(
                        jsonResponse({
                            "prompt-123": {
                                outputs: {
                                    "9": {
                                        images: [
                                            {
                                                filename:
                                                    "asset.png",

                                                subfolder:
                                                    "",

                                                type:
                                                    "output"
                                            }
                                        ]
                                    }
                                }
                            }
                        })
                    )
                    .mockResolvedValueOnce(
                        new Response(
                            new Uint8Array([
                                137,
                                80,
                                78,
                                71
                            ]),

                            {
                                status:
                                    200,

                                headers: {
                                    "Content-Type":
                                        "image/png"
                                }
                            }
                        )
                    );

                const provider =
                    new ComfyUIProvider({
                        model:
                            "test-model",

                        workflow,

                        pollIntervalMs:
                            1,

                        timeoutMs:
                            1000,

                        fetchImpl:
                            fetchMock
                    });

                const result =
                    await provider.generate({
                        profile:
                            "character",

                        prompt:
                            "pixel art knight",

                        negativePrompt:
                            "text, watermark",

                        width:
                            512,

                        height:
                            512,

                        format:
                            "png",

                        seed:
                            123
                    });

                expect(
                    result.bytes
                ).toEqual(
                    new Uint8Array([
                        137,
                        80,
                        78,
                        71
                    ])
                );

                expect(
                    result.mimeType
                ).toBe(
                    "image/png"
                );

                expect(
                    result.seed
                ).toBe(
                    123
                );

                const request =
                    fetchMock.mock
                        .calls[0];

                const options =
                    request?.[1];

                expect(
                    options
                        ?.method
                ).toBe(
                    "POST"
                );

                const body =
                    JSON.parse(
                        String(
                            options
                                ?.body
                        )
                    );

                expect(
                    body.prompt[
                        "1"
                    ].inputs.text
                ).toBe(
                    "pixel art knight, exactly one character, full body"
                );

                expect(
                    body.prompt[
                        "2"
                    ].inputs.text
                ).toBe(
                    "text, watermark, sprite sheet, multiple poses"
                );

                expect(
                    body.prompt[
                        "3"
                    ].inputs.width
                ).toBe(
                    512
                );

                expect(
                    body.prompt[
                        "3"
                    ].inputs.height
                ).toBe(
                    512
                );

                expect(
                    body.prompt[
                        "4"
                    ].inputs.seed
                ).toBe(
                    123
                );
            }
        );
    }
);

function jsonResponse(
    value:
        unknown
): Response {
    return new Response(
        JSON.stringify(
            value
        ),

        {
            status:
                200,

            headers: {
                "Content-Type":
                    "application/json"
            }
        }
    );
}