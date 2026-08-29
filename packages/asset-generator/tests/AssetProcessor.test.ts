import sharp from "sharp";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    AssetProcessor
} from "../src/index.js";

describe(
    "AssetProcessor",
    () => {
        it(
            "removes simple sprite background and creates exact canvas",
            async () => {
                const width =
                    64;

                const height =
                    64;

                const pixels =
                    Buffer.alloc(
                        width *
                        height *
                        4
                    );

                for (
                    let y = 0;
                    y < height;
                    y += 1
                ) {
                    for (
                        let x = 0;
                        x < width;
                        x += 1
                    ) {
                        const offset =
                            (
                                y *
                                width +
                                x
                            ) *
                                4;

                        const insideSubject =
                            x >= 20 &&
                            x <= 43 &&
                            y >= 12 &&
                            y <= 55;

                        if (
                            insideSubject
                        ) {
                            pixels[
                                offset
                            ] =
                                220;

                            pixels[
                                offset + 1
                            ] =
                                30;

                            pixels[
                                offset + 2
                            ] =
                                30;
                        } else {
                            pixels[
                                offset
                            ] =
                                255;

                            pixels[
                                offset + 1
                            ] =
                                255;

                            pixels[
                                offset + 2
                            ] =
                                255;
                        }

                        pixels[
                            offset + 3
                        ] =
                            255;
                    }
                }

                const source =
                    await sharp(
                        pixels,
                        {
                            raw: {
                                width,
                                height,
                                channels:
                                    4
                            }
                        }
                    )
                        .png()
                        .toBuffer();

                const processor =
                    new AssetProcessor();

                const result =
                    await processor.process(
                        {
                            bytes:
                                new Uint8Array(
                                    source
                                ),

                            mimeType:
                                "image/png",

                            width,

                            height,

                            seed:
                                123
                        },

                        {
                            role:
                                "player",

                            profile:
                                "character",

                            kind:
                                "sprite",

                            tags: [
                                "test"
                            ],

                            style:
                                "pixel-art",

                            width:
                                128,

                            height:
                                128,

                            transparent:
                                true,

                            seed:
                                123,

                            format:
                                "png"
                        }
                    );

                const metadata =
                    await sharp(
                        result.image
                            .bytes
                    ).metadata();

                expect(
                    metadata.width
                ).toBe(
                    128
                );

                expect(
                    metadata.height
                ).toBe(
                    128
                );

                expect(
                    metadata.hasAlpha
                ).toBe(
                    true
                );

                expect(
                    result.metadata
                        .backgroundRemoved
                ).toBe(
                    true
                );

                expect(
                    result.metadata
                        .trimmed
                ).toBe(
                    true
                );
            }
        );

        it(
            "resizes background to exact dimensions",
            async () => {
                const source =
                    await sharp({
                        create: {
                            width:
                                256,

                            height:
                                128,

                            channels:
                                3,

                            background: {
                                r:
                                    20,

                                g:
                                    40,

                                b:
                                    60
                            }
                        }
                    })
                        .png()
                        .toBuffer();

                const processor =
                    new AssetProcessor();

                const result =
                    await processor.process(
                        {
                            bytes:
                                new Uint8Array(
                                    source
                                ),

                            mimeType:
                                "image/png",

                            width:
                                256,

                            height:
                                128
                        },

                        {
                            role:
                                "background",

                            profile:
                                "background",

                            kind:
                                "background",

                            tags: [
                                "castle"
                            ],

                            style:
                                "pixel-art",

                            width:
                                1280,

                            height:
                                720,

                            transparent:
                                false,

                            seed:
                                1,

                            format:
                                "webp"
                        }
                    );

                expect(
                    result.image.width
                ).toBe(
                    1280
                );

                expect(
                    result.image.height
                ).toBe(
                    720
                );

                expect(
                    result.image.mimeType
                ).toBe(
                    "image/webp"
                );
            }
        );
    }
);