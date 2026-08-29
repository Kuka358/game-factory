import sharp from "sharp";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    SingleSubjectAssetValidator
} from "../src/index.js";

describe(
    "SingleSubjectAssetValidator",
    () => {
        it(
            "accepts one isolated subject",
            async () => {
                const image =
                    await createSubjectsImage(
                        256,
                        256,
                        [
                            {
                                x:
                                    70,

                                y:
                                    30,

                                width:
                                    116,

                                height:
                                    190
                            }
                        ]
                    );

                const validator =
                    new SingleSubjectAssetValidator();

                const result =
                    await validator.validate(
                        image,
                        createRequest()
                    );

                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );


        it(
            "rejects horizontal sprite sheet",
            async () => {
                const image =
                    await createSubjectsImage(
                        512,
                        128,
                        [
                            {
                                x:
                                    10,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            },

                            {
                                x:
                                    135,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            },

                            {
                                x:
                                    260,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            },

                            {
                                x:
                                    385,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            }
                        ]
                    );

                const validator =
                    new SingleSubjectAssetValidator();

                const result =
                    await validator.validate(
                        image,
                        {
                            ...createRequest(),

                            width:
                                512,

                            height:
                                128
                        }
                    );

                expect(
                    result.valid
                ).toBe(
                    false
                );

                expect(
                    result.issues.some(
                        issue =>
                            issue.code ===
                            "probable_spritesheet"
                    )
                ).toBe(
                    true
                );
            }
        );


        it(
            "allows sheet when explicitly requested",
            async () => {
                const image =
                    await createSubjectsImage(
                        512,
                        128,
                        [
                            {
                                x:
                                    10,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            },

                            {
                                x:
                                    135,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            },

                            {
                                x:
                                    260,

                                y:
                                    20,

                                width:
                                    90,

                                height:
                                    90
                            }
                        ]
                    );

                const validator =
                    new SingleSubjectAssetValidator();

                const result =
                    await validator.validate(
                        image,
                        {
                            ...createRequest(),

                            width:
                                512,

                            height:
                                128,

                            allowSpritesheet:
                                true
                        }
                    );

                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );

        it(
            "rejects two significant subjects",
            async () => {
                const image =
                    await createSubjectsImage(
                        256,
                        256,
                        [
                            {
                                x:
                                    25,

                                y:
                                    50,

                                width:
                                    80,

                                height:
                                    160
                            },

                            {
                                x:
                                    150,

                                y:
                                    50,

                                width:
                                    80,

                                height:
                                    160
                            }
                        ]
                    );

                const validator =
                    new SingleSubjectAssetValidator();

                const result =
                    await validator.validate(
                        image,
                        createRequest()
                    );

                expect(
                    result.valid
                ).toBe(
                    false
                );

                expect(
                    result.issues.some(
                        (issue) =>
                            issue.code ===
                                "probable_spritesheet" ||
                            issue.code ===
                                "multiple_subjects"
                    )
                ).toBe(
                    true
                );
            }
        );

        it(
            "ignores tiny detached noise next to one subject",
            async () => {
                const image =
                    await createSubjectsImage(
                        256,
                        256,
                        [
                            {
                                x:
                                    70,

                                y:
                                    30,

                                width:
                                    116,

                                height:
                                    190
                            },

                            {
                                x:
                                    220,

                                y:
                                    20,

                                width:
                                    3,

                                height:
                                    3
                            }
                        ]
                    );

                const validator =
                    new SingleSubjectAssetValidator();

                const result =
                    await validator.validate(
                        image,
                        createRequest()
                    );

                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );
    }
);


function createRequest() {
    return {
        role:
            "player",

        profile:
            "character" as const,

        kind:
            "sprite" as const,

        tags: [
            "knight"
        ],

        style:
            "pixel-art",

        width:
            256,

        height:
            256,

        transparent:
            true,

        singleSubject:
            true,

        allowSpritesheet:
            false,

        seed:
            123,

        format:
            "png" as const
    };
}


async function createSubjectsImage(
    width:
        number,

    height:
        number,

    subjects:
        readonly {
            x:
                number;

            y:
                number;

            width:
                number;

            height:
                number;
        }[]
) {
    const data =
        Buffer.alloc(
            width *
            height *
            4
        );

    for (
        const subject of
        subjects
    ) {
        for (
            let y =
                subject.y;
            y <
            subject.y +
                subject.height;
            y +=
                1
        ) {
            for (
                let x =
                    subject.x;
                x <
                subject.x +
                    subject.width;
                x +=
                    1
            ) {
                const offset =
                    (
                        y *
                        width +
                        x
                    ) *
                    4;

                data[
                    offset
                ] =
                    220;

                data[
                    offset + 1
                ] =
                    50;

                data[
                    offset + 2
                ] =
                    50;

                data[
                    offset + 3
                ] =
                    255;
            }
        }
    }

    const bytes =
        await sharp(
            data,
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

    return {
        bytes:
            new Uint8Array(
                bytes
            ),

        mimeType:
            "image/png",

        width,

        height,

        seed:
            123
    };
}