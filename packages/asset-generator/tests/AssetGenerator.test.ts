import {
    describe,
    expect,
    it
} from "vitest";

import {
    AssetGenerator,

    type ImageGeneratorProvider
} from "../src/index.js";

import sharp from "sharp";

describe(
    "AssetGenerator",
    () => {
        it(
            "generates asset with semantic metadata",
            async () => {
                const provider:
                    ImageGeneratorProvider = {
                    id:
                        "test-provider",

                    model:
                        "test-model",

                    async generate(
                        request
                    ) {
                        const pixels =
                            Buffer.alloc(
                                request.width *
                                request.height *
                                4
                            );

                        const left =
                            Math.floor(
                                request.width *
                                0.3
                            );

                        const right =
                            Math.floor(
                                request.width *
                                0.7
                            );

                        const top =
                            Math.floor(
                                request.height *
                                0.2
                            );

                        const bottom =
                            Math.floor(
                                request.height *
                                0.8
                            );

                        for (
                            let y = top;
                            y < bottom;
                            y += 1
                        ) {
                            for (
                                let x = left;
                                x < right;
                                x += 1
                            ) {
                                const offset =
                                    (
                                        y *
                                        request.width +
                                        x
                                    ) *
                                        4;

                                pixels[
                                    offset
                                ] =
                                    220;

                                pixels[
                                    offset + 1
                                ] =
                                    40;

                                pixels[
                                    offset + 2
                                ] =
                                    40;

                                pixels[
                                    offset + 3
                                ] =
                                    255;
                            }
                        }

                        const bytes =
                            await sharp(
                                pixels,
                                {
                                    raw: {
                                        width:
                                            request.width,

                                        height:
                                            request.height,

                                        channels:
                                            4
                                    }
                                }
                            )
                                .png()
                                .toBuffer();

                        return {
                            bytes:
                                new Uint8Array(
                                    bytes
                                ),

                            mimeType:
                                "image/png",

                            width:
                                request.width,

                            height:
                                request.height,

                            seed:
                                request.seed
                        };
                    }
                };

                const generator =
                    new AssetGenerator(
                        provider
                    );

                const result =
                    await generator.generate({
                        role:
                            "player",

                        profile:
                            "character",

                        kind:
                            "sprite",

                        tags: [
                            "knight",
                            "medieval"
                        ],

                        style:
                            "pixel-art",

                        width:
                            512,

                        height:
                            512,

                        transparent:
                            true,

                        seed:
                            123
                    });

                expect(
                    result.metadata.origin
                ).toBe(
                    "generated"
                );

                expect(
                    result.metadata.generator
                        .provider
                ).toBe(
                    "test-provider"
                );

                expect(
                    result.metadata.generator
                        .model
                ).toBe(
                    "test-model"
                );

                expect(
                    result.metadata.generator
                        .promptHash
                ).toMatch(
                    /^[a-f0-9]{64}$/
                );

                expect(
                    result.metadata.tags
                ).toEqual([
                    "knight",
                    "medieval"
                ]);

                expect(
                    result.metadata.generator
                        .prompt
                ).toContain(
                    "knight"
                );

                expect(
                    result.metadata.generator
                        .prompt
                ).toContain(
                    "pixel-art"
                );
            }
        );

        it(
            "rejects invalid dimensions",
            async () => {
                const provider:
                    ImageGeneratorProvider = {
                    id:
                        "test",

                    model:
                        "test",

                    async generate() {
                        throw new Error(
                            "should not run"
                        );
                    }
                };

                const generator =
                    new AssetGenerator(
                        provider
                    );

                await expect(
                    generator.generate({
                        role:
                            "player",

                        profile:
                            "character",

                        kind:
                            "sprite",

                        tags: [
                            "knight"
                        ],

                        style:
                            "pixel-art",

                        width:
                            0,

                        height:
                            512,

                        transparent:
                            true
                    })
                ).rejects.toThrow(
                    /dimensions/
                );
            }
        );
    }
);