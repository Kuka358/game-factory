import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    HttpSpriteVaultClient
} from "../src/index.js";

describe(
    "HttpSpriteVaultClient",
    () => {
        afterEach(
            () => {
                vi.unstubAllGlobals();
            }
        );

        it(
            "maps SpriteVault search result",
            async () => {
                let capturedInput:
                    Parameters<typeof fetch>[0] |
                    undefined;

                let capturedInit:
                    Parameters<typeof fetch>[1] |
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
                                    assets: [
                                        {
                                            id:
                                                "asset_13921",

                                            score:
                                                0.92,

                                            tags: [
                                                "knight",
                                                "medieval",
                                                "pixel-art"
                                            ],

                                            license: {
                                                type:
                                                    "CC0"
                                            },

                                            files: {
                                                source:
                                                    "/files/asset_13921.png"
                                            }
                                        }
                                    ]
                                }),

                                {
                                    status: 200,

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

                const client =
                    new HttpSpriteVaultClient({
                        baseUrl:
                            "http://localhost:3001",

                        searchPath:
                            "/assets/search"
                    });

                const result =
                    await client.search({
                        type:
                            "sprite",

                        role:
                            "player",

                        tags: [
                            "knight",
                            "medieval",
                            "pixel-art"
                        ],

                        requirements: {
                            transparent:
                                true
                        }
                    });

                expect(
                    result
                ).toHaveLength(1);

                expect(
                    result[0]
                ).toEqual({
                    id:
                        "asset_13921",

                    score:
                        0.92,

                    tags: [
                        "knight",
                        "medieval",
                        "pixel-art"
                    ],

                    sourceUrl:
                        "/files/asset_13921.png",

                    license: {
                        type:
                            "CC0",

                        author:
                            undefined,

                        sourceUrl:
                            undefined
                    }
                });

                expect(
                    fetchMock
                ).toHaveBeenCalledTimes(1);

                expect(
                    String(
                        capturedInput
                    )
                ).toBe(
                    "http://localhost:3001/assets/search"
                );

                expect(
                    JSON.parse(
                        String(
                            capturedInit?.body
                        )
                    )
                ).toEqual({
                    type:
                        "sprite",

                    role:
                        "player",

                    tags: [
                        "knight",
                        "medieval",
                        "pixel-art"
                    ],

                    requirements: {
                        transparent:
                            true
                    }
                });
            }
        );

        it(
            "rejects malformed SpriteVault response",
            async () => {
                vi.stubGlobal(
                    "fetch",
                    vi.fn(
                        async () =>
                            new Response(
                                JSON.stringify({
                                    assets: [
                                        {
                                            broken:
                                                true
                                        }
                                    ]
                                }),
                                {
                                    status: 200
                                }
                            )
                    )
                );

                const client =
                    new HttpSpriteVaultClient({
                        baseUrl:
                            "http://localhost:3001",

                        searchPath:
                            "/search"
                    });

                await expect(
                    client.search({
                        type:
                            "sprite",

                        role:
                            "player",

                        tags: [],

                        requirements: {}
                    })
                ).rejects.toThrow(
                    /SpriteVault asset\.id/
                );
            }
        );
    }
);