import {
    describe,
    expect,
    test
} from "vitest";

import sharp from "sharp";

import {
    calculateHorizontalSeamScore,
    calculateInterTileSeamScore,
    findBestCyclicTileOrder
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

        test(
            "scores matching neighboring tile edges highly",
            async () => {
                const left =
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
                                    40,

                                g:
                                    80,

                                b:
                                    120,

                                alpha:
                                    1
                            }
                        }
                    })
                        .png()
                        .toBuffer();


                const right =
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
                                    40,

                                g:
                                    80,

                                b:
                                    120,

                                alpha:
                                    1
                            }
                        }
                    })
                        .png()
                        .toBuffer();


                expect(
                    await calculateInterTileSeamScore(
                        left,
                        right
                    )
                ).toBe(
                    100
                );
            }
        );
        
        test(
            "orders tiles to maximize the weakest cyclic transition",
            () => {
                const scores =
                    new Map<string, number>([
                        [
                            "0:1",
                            95
                        ],
                        [
                            "1:2",
                            94
                        ],
                        [
                            "2:3",
                            93
                        ],
                        [
                            "3:0",
                            92
                        ]
                    ]);


                const result =
                    findBestCyclicTileOrder(
                        4,

                        (
                            from,
                            to
                        ) =>
                            scores.get(
                                `${from}:${to}`
                            ) ??
                            10
                    );


                expect(
                    result.order
                ).toEqual([
                    0,
                    1,
                    2,
                    3
                ]);


                expect(
                    result.minimumScore
                ).toBe(
                    92
                );
            }
        );
    }
);