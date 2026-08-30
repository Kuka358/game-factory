import {
    describe,
    expect,
    test
} from "vitest";

import sharp from "sharp";

import {
    calculateHorizontalSeamScore
} from "../src/TilesetGenerator.js";


describe(
    "calculateHorizontalSeamScore",
    () => {
        test(
            "returns 100 for identical left and right edges",
            async () => {
                const bytes =
                    await sharp({
                        create: {
                            width:
                                64,

                            height:
                                64,

                            channels:
                                4,

                            background: {
                                r:
                                    80,

                                g:
                                    120,

                                b:
                                    60,

                                alpha:
                                    1
                            }
                        }
                    })
                        .png()
                        .toBuffer();


                const score =
                    await calculateHorizontalSeamScore(
                        bytes
                    );


                expect(
                    score
                ).toBe(
                    100
                );
            }
        );


        test(
            "penalizes strongly different opposite edges",
            async () => {
                const base =
                    await sharp({
                        create: {
                            width:
                                64,

                            height:
                                64,

                            channels:
                                4,

                            background: {
                                r:
                                    0,

                                g:
                                    0,

                                b:
                                    0,

                                alpha:
                                    1
                            }
                        }
                    })
                        .composite([
                            {
                                input: {
                                    create: {
                                        width:
                                            4,

                                        height:
                                            64,

                                        channels:
                                            4,

                                        background: {
                                            r:
                                                255,

                                            g:
                                                255,

                                            b:
                                                255,

                                            alpha:
                                                1
                                        }
                                    }
                                },

                                left:
                                    60,

                                top:
                                    0
                            }
                        ])
                        .png()
                        .toBuffer();


                const score =
                    await calculateHorizontalSeamScore(
                        base
                    );


                expect(
                    score
                ).toBeLessThan(
                    50
                );
            }
        );
    }
);