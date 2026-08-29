import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    afterEach,
    describe,
    expect,
    it
} from "vitest";

import type {
    AssetCandidate,
    AssetProvider
} from "../src/index.js";

import {
    ProviderAssetManager
} from "../src/index.js";

class TestProvider
    implements AssetProvider
{
    readonly source =
        "spritevault" as const;

    async search(): Promise<
        AssetCandidate[]
    > {
        return [
            {
                id: "low",

                score: 0.4,

                tags: [],

                sourceUrl:
                    "/files/low.png",

                license: {
                    type: "CC0"
                }
            },

            {
                id: "best",

                score: 0.92,

                tags: [
                    "knight"
                ],

                sourceUrl:
                    "/files/best.png",

                license: {
                    type: "CC0"
                }
            }
        ];
    }

    async download(
        candidate:
            AssetCandidate
    ): Promise<Uint8Array> {
        return new TextEncoder()
            .encode(
                `asset:${candidate.id}`
            );
    }
}

describe(
    "ProviderAssetManager",
    () => {
        let temporaryDirectory:
            string | undefined;

        afterEach(
            async () => {
                if (
                    temporaryDirectory
                ) {
                    await fs.rm(
                        temporaryDirectory,
                        {
                            recursive: true,
                            force: true
                        }
                    );
                }
            }
        );

        it(
            "selects and writes best candidate",
            async () => {
                temporaryDirectory =
                    await fs.mkdtemp(
                        path.join(
                            os.tmpdir(),
                            "game-factory-assets-"
                        )
                    );

                const manager =
                    new ProviderAssetManager({
                        provider:
                            new TestProvider(),

                        minimumScore:
                            0.5
                    });

                const result =
                    await manager.resolve({
                        assetsDir:
                            temporaryDirectory,

                        requirements: [
                            {
                                type:
                                    "sprite",

                                role:
                                    "player",

                                tags: [
                                    "knight"
                                ],

                                requirements: {
                                    transparent:
                                        true
                                }
                            }
                        ]
                    });

                expect(
                    result.manifest.assets
                ).toEqual([
                    {
                        role:
                            "player",

                        gamePath:
                            "assets/player.png",

                        source:
                            "spritevault",

                        sourceAssetId:
                            "best",

                        license: {
                            type:
                                "CC0"
                        }
                    }
                ]);

                const file =
                    await fs.readFile(
                        path.join(
                            temporaryDirectory,
                            "player.png"
                        ),
                        "utf8"
                    );

                expect(
                    file
                ).toBe(
                    "asset:best"
                );
            }
        ),

        it(
            "fails when no candidate reaches minimum score",
            async () => {
                const provider:
                    AssetProvider = {

                    source:
                        "spritevault",

                    async search() {
                        return [
                            {
                                id: "bad",

                                score: 0.2,

                                tags: [],

                                sourceUrl:
                                    "/bad.png",

                                license: {
                                    type:
                                        "CC0"
                                }
                            }
                        ];
                    },

                    async download() {
                        throw new Error(
                            "must not download"
                        );
                    }
                };

                const manager =
                    new ProviderAssetManager({
                        provider,

                        minimumScore:
                            0.8
                    });

                await expect(
                    manager.resolve({
                        assetsDir:
                            path.join(
                                os.tmpdir(),
                                "unused-assets"
                            ),

                        requirements: [
                            {
                                type:
                                    "sprite",

                                role:
                                    "player",

                                tags: [],

                                requirements: {}
                            }
                        ]
                    })
                ).rejects.toThrow(
                    'No suitable asset found for role "player"'
                );
            }
        );
    }
);