import {
    mkdtemp
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    FileGeneratedAssetCache,

    type GeneratedAsset
} from "../src/index.js";

describe(
    "FileGeneratedAssetCache",
    () => {
        it(
            "persists and restores generated asset",
            async () => {
                const root =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "gf-assets-"
                        )
                    );

                const cache =
                    new FileGeneratedAssetCache(
                        root
                    );

                const asset:
                    GeneratedAsset = {
                    image: {
                        bytes:
                            new Uint8Array([
                                1,
                                2,
                                3
                            ]),

                        mimeType:
                            "image/png",

                        width:
                            64,

                        height:
                            64,

                        seed:
                            123
                    },

                    metadata: {
                        origin:
                            "generated",

                        role:
                            "player",
                        
                        profile:
                            "character",

                        tags: [
                            "knight"
                        ],

                        style:
                            "pixel-art",

                        generator: {
                            provider:
                                "test",

                            model:
                                "test-model",

                            prompt:
                                "knight",

                            negativePrompt:
                                "",

                            promptHash:
                                "abc",

                            seed:
                                123
                        },

                        image: {
                            width:
                                64,

                            height:
                                64,

                            mimeType:
                                "image/png",

                            transparent:
                                true
                        },

                        processing: {
                            processorVersion:
                                "1",

                            source: {
                                width:
                                    64,

                                height:
                                    64,

                                format:
                                    "png"
                            },

                            output: {
                                width:
                                    64,

                                height:
                                    64,

                                format:
                                    "png"
                            },

                            backgroundRemoved:
                                false,

                            trimmed:
                                false
                        }
                    }
                };

                await cache.put(
                    "abcdef123456",
                    asset
                );

                const restored =
                    await cache.get(
                        "abcdef123456"
                    );

                expect(
                    restored
                ).not.toBeNull();

                expect(
                    restored
                        ?.metadata
                        .generator
                        .seed
                ).toBe(
                    123
                );

                expect(
                    restored
                        ?.image
                        .bytes
                ).toEqual(
                    new Uint8Array([
                        1,
                        2,
                        3
                    ])
                );
            }
        );
    }
);