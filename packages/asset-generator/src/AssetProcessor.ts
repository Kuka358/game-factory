import sharp from "sharp";

type SharpPipeline =
    ReturnType<typeof sharp>;

import type {
    GeneratedAssetFormat,
    GeneratedAssetProcessingMetadata,
    GeneratedImage,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

const PROCESSOR_VERSION =
    "1";

export interface AssetProcessorOptions {
    paddingRatio?:
        number;

    backgroundColorDistance?:
        number;

    transparentAlphaThreshold?:
        number;
}

export interface AssetProcessingResult {
    image:
        GeneratedImage;

    metadata:
        GeneratedAssetProcessingMetadata;
}

export interface GeneratedAssetProcessor {
    readonly cacheSignature:
        string;

    process(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ):
        Promise<AssetProcessingResult>;
}

interface ResolvedProcessorOptions {
    paddingRatio:
        number;

    backgroundColorDistance:
        number;

    transparentAlphaThreshold:
        number;
}

interface RgbaImage {
    data:
        Buffer;

    width:
        number;

    height:
        number;
}

interface Bounds {
    left:
        number;

    top:
        number;

    width:
        number;

    height:
        number;
}

export class AssetProcessor
    implements GeneratedAssetProcessor
{
    private readonly options:
        ResolvedProcessorOptions;

    readonly cacheSignature:
        string;

    constructor(
        options:
            AssetProcessorOptions = {}
    ) {
        this.options = {
            paddingRatio:
                options.paddingRatio ??
                0.08,

            backgroundColorDistance:
                options.backgroundColorDistance ??
                42,

            transparentAlphaThreshold:
                options.transparentAlphaThreshold ??
                16
        };

        validateOptions(
            this.options
        );

        this.cacheSignature =
            [
                "asset-processor",
                PROCESSOR_VERSION,
                JSON.stringify(
                    this.options
                )
            ].join(
                ":"
            );
    }

    async process(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetProcessingResult> {
        const input =
            Buffer.from(
                image.bytes
            );

        const metadata =
            await sharp(
                input
            ).metadata();

        if (
            !metadata.width ||
            !metadata.height
        ) {
            throw new Error(
                "Generated image does not contain valid dimensions"
            );
        }

        if (
            request.kind ===
            "background"
        ) {
            return this.processBackground(
                input,
                metadata.width,
                metadata.height,
                metadata.format ??
                    null,
                request
            );
        }

        return this.processSprite(
            input,
            metadata.width,
            metadata.height,
            metadata.format ??
                null,
            request
        );
    }

    private async processBackground(
        input:
            Buffer,

        sourceWidth:
            number,

        sourceHeight:
            number,

        sourceFormat:
            string | null,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetProcessingResult> {
        const pipeline =
            sharp(
                input
            ).resize({
                width:
                    request.width,

                height:
                    request.height,

                fit:
                    "cover",

                position:
                    "centre",

                kernel:
                    getResizeKernel(
                        request.style
                    )
            });

        const bytes =
            await encodeImage(
                pipeline,
                request.format
            );

        await validateProcessedImage(
            bytes,
            request
        );

        return {
            image: {
                bytes:
                    new Uint8Array(
                        bytes
                    ),

                mimeType:
                    getMimeType(
                        request.format
                    ),

                width:
                    request.width,

                height:
                    request.height,

                seed:
                    request.seed
            },

            metadata: {
                processorVersion:
                    PROCESSOR_VERSION,

                source: {
                    width:
                        sourceWidth,

                    height:
                        sourceHeight,

                    format:
                        sourceFormat
                },

                output: {
                    width:
                        request.width,

                    height:
                        request.height,

                    format:
                        request.format
                },

                backgroundRemoved:
                    false,

                trimmed:
                    false
            }
        };
    }

    private async processSprite(
        input:
            Buffer,

        sourceWidth:
            number,

        sourceHeight:
            number,

        sourceFormat:
            string | null,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetProcessingResult> {
        const decoded =
            await decodeRgba(
                input
            );

        let backgroundRemoved =
            false;

        if (
            request.transparent &&
            !hasTransparentBorder(
                decoded,
                this.options
                    .transparentAlphaThreshold
            )
        ) {
            const removed =
                removeBorderBackground(
                    decoded,
                    this.options
                        .backgroundColorDistance
                );

            backgroundRemoved =
                removed > 0;
        }

        if (
            request.transparent &&
            !hasTransparentBorder(
                decoded,
                this.options
                    .transparentAlphaThreshold
            )
        ) {
            throw new Error(
                [
                    "Generated sprite does not have a transparent background.",
                    "Background removal could not isolate the subject."
                ].join(
                    " "
                )
            );
        }

        const bounds =
            findVisibleBounds(
                decoded,
                this.options
                    .transparentAlphaThreshold
            );

        if (
            !bounds
        ) {
            throw new Error(
                "Generated sprite is fully transparent after processing"
            );
        }

        const trimmed =
            bounds.left !== 0 ||
            bounds.top !== 0 ||
            bounds.width !==
                decoded.width ||
            bounds.height !==
                decoded.height;

        const availableWidth =
            Math.max(
                1,
                Math.floor(
                    request.width *
                    (
                        1 -
                        this.options
                            .paddingRatio *
                        2
                    )
                )
            );

        const availableHeight =
            Math.max(
                1,
                Math.floor(
                    request.height *
                    (
                        1 -
                        this.options
                            .paddingRatio *
                        2
                    )
                )
            );

        const resized =
            await sharp(
                decoded.data,
                {
                    raw: {
                        width:
                            decoded.width,

                        height:
                            decoded.height,

                        channels:
                            4
                    }
                }
            )
                .extract(
                    bounds
                )
                .resize({
                    width:
                        availableWidth,

                    height:
                        availableHeight,

                    fit:
                        "inside",

                    kernel:
                        getResizeKernel(
                            request.style
                        )
                })
                .raw()
                .toBuffer({
                    resolveWithObject:
                        true
                });

        if (
            resized.info.channels !==
            4
        ) {
            throw new Error(
                "Asset processor expected RGBA image after resize"
            );
        }

        const horizontalSpace =
            request.width -
            resized.info.width;

        const verticalSpace =
            request.height -
            resized.info.height;

        const left =
            Math.floor(
                horizontalSpace /
                2
            );

        const right =
            horizontalSpace -
            left;

        const top =
            Math.floor(
                verticalSpace /
                2
            );

        const bottom =
            verticalSpace -
            top;

        const pipeline =
            sharp(
                resized.data,
                {
                    raw: {
                        width:
                            resized.info.width,

                        height:
                            resized.info.height,

                        channels:
                            4
                    }
                }
            ).extend({
                top,
                bottom,
                left,
                right,

                background: {
                    r:
                        0,

                    g:
                        0,

                    b:
                        0,

                    alpha:
                        0
                }
            });

        const bytes =
            await encodeImage(
                pipeline,
                request.format
            );

        await validateProcessedImage(
            bytes,
            request
        );

        return {
            image: {
                bytes:
                    new Uint8Array(
                        bytes
                    ),

                mimeType:
                    getMimeType(
                        request.format
                    ),

                width:
                    request.width,

                height:
                    request.height,

                seed:
                    request.seed
            },

            metadata: {
                processorVersion:
                    PROCESSOR_VERSION,

                source: {
                    width:
                        sourceWidth,

                    height:
                        sourceHeight,

                    format:
                        sourceFormat
                },

                output: {
                    width:
                        request.width,

                    height:
                        request.height,

                    format:
                        request.format
                },

                backgroundRemoved,

                trimmed
            }
        };
    }
}

async function decodeRgba(
    input:
        Buffer
): Promise<RgbaImage> {
    const result =
        await sharp(
            input
        )
            .ensureAlpha()
            .raw()
            .toBuffer({
                resolveWithObject:
                    true
            });

    if (
        result.info.channels !==
        4
    ) {
        throw new Error(
            `Expected four image channels, received ${result.info.channels}`
        );
    }

    return {
        data:
            result.data,

        width:
            result.info.width,

        height:
            result.info.height
    };
}

function hasTransparentBorder(
    image:
        RgbaImage,

    alphaThreshold:
        number
): boolean {
    let transparent =
        0;

    let samples =
        0;

    const inspect =
        (
            x:
                number,

            y:
                number
        ) => {
            samples +=
                1;

            const index =
                (
                    y *
                    image.width +
                    x
                ) *
                4;

            if (
                image.data[
                    index + 3
                ] <=
                alphaThreshold
            ) {
                transparent +=
                    1;
            }
        };

    for (
        let x = 0;
        x < image.width;
        x += 1
    ) {
        inspect(
            x,
            0
        );

        if (
            image.height >
            1
        ) {
            inspect(
                x,
                image.height -
                    1
            );
        }
    }

    for (
        let y = 1;
        y <
        image.height - 1;
        y += 1
    ) {
        inspect(
            0,
            y
        );

        if (
            image.width >
            1
        ) {
            inspect(
                image.width -
                    1,
                y
            );
        }
    }

    if (
        samples === 0
    ) {
        return false;
    }

    return (
        transparent /
        samples
    ) >=
        0.01;
}

function removeBorderBackground(
    image:
        RgbaImage,

    threshold:
        number
): number {
    const background =
        estimateBackgroundColor(
            image
        );

    const pixelCount =
        image.width *
        image.height;

    const visited =
        new Uint8Array(
            pixelCount
        );

    const queue =
        new Int32Array(
            pixelCount
        );

    let readIndex =
        0;

    let writeIndex =
        0;

    const thresholdSquared =
        threshold *
        threshold *
        3;

    const canRemove =
        (
            pixelIndex:
                number
        ) => {
            const offset =
                pixelIndex *
                4;

            const r =
                image.data[
                    offset
                ];

            const g =
                image.data[
                    offset + 1
                ];

            const b =
                image.data[
                    offset + 2
                ];

            const dr =
                r -
                background.r;

            const dg =
                g -
                background.g;

            const db =
                b -
                background.b;

            return (
                dr * dr +
                dg * dg +
                db * db
            ) <=
                thresholdSquared;
        };

    const enqueue =
        (
            pixelIndex:
                number
        ) => {
            if (
                visited[
                    pixelIndex
                ] ||
                !canRemove(
                    pixelIndex
                )
            ) {
                return;
            }

            visited[
                pixelIndex
            ] =
                1;

            queue[
                writeIndex
            ] =
                pixelIndex;

            writeIndex +=
                1;
        };

    for (
        let x = 0;
        x < image.width;
        x += 1
    ) {
        enqueue(
            x
        );

        enqueue(
            (
                image.height -
                1
            ) *
                image.width +
                x
        );
    }

    for (
        let y = 1;
        y <
        image.height - 1;
        y += 1
    ) {
        enqueue(
            y *
            image.width
        );

        enqueue(
            y *
                image.width +
                image.width -
                1
        );
    }

    let removed =
        0;

    while (
        readIndex <
        writeIndex
    ) {
        const pixelIndex =
            queue[
                readIndex
            ];

        readIndex +=
            1;

        const x =
            pixelIndex %
            image.width;

        const y =
            Math.floor(
                pixelIndex /
                image.width
            );

        const offset =
            pixelIndex *
            4;

        image.data[
            offset
        ] =
            0;

        image.data[
            offset + 1
        ] =
            0;

        image.data[
            offset + 2
        ] =
            0;

        image.data[
            offset + 3
        ] =
            0;

        removed +=
            1;

        if (
            x >
            0
        ) {
            enqueue(
                pixelIndex -
                1
            );
        }

        if (
            x <
            image.width - 1
        ) {
            enqueue(
                pixelIndex +
                1
            );
        }

        if (
            y >
            0
        ) {
            enqueue(
                pixelIndex -
                image.width
            );
        }

        if (
            y <
            image.height - 1
        ) {
            enqueue(
                pixelIndex +
                image.width
            );
        }
    }

    const removedRatio =
        removed /
        pixelCount;

    if (
        removedRatio >
        0.98
    ) {
        throw new Error(
            "Background removal removed almost the entire generated sprite"
        );
    }

    return removed;
}

function estimateBackgroundColor(
    image:
        RgbaImage
): {
    r:
        number;

    g:
        number;

    b:
        number;
} {
    const patch =
        Math.max(
            1,
            Math.min(
                16,
                Math.floor(
                    Math.min(
                        image.width,
                        image.height
                    ) *
                    0.05
                )
            )
        );

    const rValues:
        number[] = [];

    const gValues:
        number[] = [];

    const bValues:
        number[] = [];

    const samplePatch =
        (
            startX:
                number,

            startY:
                number
        ) => {
            for (
                let y = startY;
                y <
                startY + patch;
                y += 1
            ) {
                for (
                    let x = startX;
                    x <
                    startX + patch;
                    x += 1
                ) {
                    const offset =
                        (
                            y *
                            image.width +
                            x
                        ) *
                            4;

                    rValues.push(
                        image.data[
                            offset
                        ]
                    );

                    gValues.push(
                        image.data[
                            offset + 1
                        ]
                    );

                    bValues.push(
                        image.data[
                            offset + 2
                        ]
                    );
                }
            }
        };

    samplePatch(
        0,
        0
    );

    samplePatch(
        image.width -
            patch,
        0
    );

    samplePatch(
        0,
        image.height -
            patch
    );

    samplePatch(
        image.width -
            patch,
        image.height -
            patch
    );

    return {
        r:
            median(
                rValues
            ),

        g:
            median(
                gValues
            ),

        b:
            median(
                bValues
            )
    };
}

function median(
    values:
        number[]
): number {
    values.sort(
        (
            a,
            b
        ) =>
            a - b
    );

    return values[
        Math.floor(
            values.length /
            2
        )
    ] ?? 0;
}

function findVisibleBounds(
    image:
        RgbaImage,

    alphaThreshold:
        number
): Bounds | null {
    let minX =
        image.width;

    let minY =
        image.height;

    let maxX =
        -1;

    let maxY =
        -1;

    for (
        let y = 0;
        y < image.height;
        y += 1
    ) {
        for (
            let x = 0;
            x < image.width;
            x += 1
        ) {
            const alpha =
                image.data[
                    (
                        y *
                        image.width +
                        x
                    ) *
                        4 +
                        3
                ];

            if (
                alpha <=
                alphaThreshold
            ) {
                continue;
            }

            minX =
                Math.min(
                    minX,
                    x
                );

            minY =
                Math.min(
                    minY,
                    y
                );

            maxX =
                Math.max(
                    maxX,
                    x
                );

            maxY =
                Math.max(
                    maxY,
                    y
                );
        }
    }

    if (
        maxX <
            minX ||
        maxY <
            minY
    ) {
        return null;
    }

    return {
        left:
            minX,

        top:
            minY,

        width:
            maxX -
            minX +
            1,

        height:
            maxY -
            minY +
            1
    };
}

function getResizeKernel(
    style:
        string
) {
    if (
        style ===
        "pixel-art"
    ) {
        return sharp.kernel
            .nearest;
    }

    return sharp.kernel
        .lanczos3;
}

async function encodeImage(
    pipeline:
        SharpPipeline,

    format:
        GeneratedAssetFormat
): Promise<Buffer> {
    if (
        format ===
        "webp"
    ) {
        return pipeline
            .webp({
                lossless:
                    true
            })
            .toBuffer();
    }

    return pipeline
        .png({
            compressionLevel:
                9
        })
        .toBuffer();
}

async function validateProcessedImage(
    bytes:
        Buffer,

    request:
        NormalizedAssetGenerationRequest
): Promise<void> {
    const metadata =
        await sharp(
            bytes
        ).metadata();

    if (
        metadata.width !==
            request.width ||
        metadata.height !==
            request.height
    ) {
        throw new Error(
            [
                "Processed asset has unexpected dimensions:",
                `${metadata.width}x${metadata.height},`,
                `expected ${request.width}x${request.height}`
            ].join(
                " "
            )
        );
    }

    if (
        request.transparent &&
        !metadata.hasAlpha
    ) {
        throw new Error(
            "Processed transparent asset does not contain an alpha channel"
        );
    }
}

function getMimeType(
    format:
        GeneratedAssetFormat
): string {
    return format ===
        "webp"
        ? "image/webp"
        : "image/png";
}

function validateOptions(
    options:
        ResolvedProcessorOptions
): void {
    if (
        options.paddingRatio <
            0 ||
        options.paddingRatio >=
            0.45
    ) {
        throw new Error(
            "AssetProcessor paddingRatio must be between 0 and 0.45"
        );
    }

    if (
        options.backgroundColorDistance <=
        0
    ) {
        throw new Error(
            "AssetProcessor backgroundColorDistance must be positive"
        );
    }

    if (
        options.transparentAlphaThreshold <
            0 ||
        options.transparentAlphaThreshold >
            255
    ) {
        throw new Error(
            "AssetProcessor transparentAlphaThreshold must be between 0 and 255"
        );
    }
}