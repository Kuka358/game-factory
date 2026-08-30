import {
    createHash
} from "node:crypto";

import sharp from "sharp";

import type {
    AssetTilesetLayoutRequirements
} from "@game-factory/assets";

import type {
    AssetGenerationRequest,
    GeneratedAsset,
    GeneratedAssetFormat
} from "./AssetGenerationTypes.js";


const TILESET_PROCESSOR_VERSION =
    "tileset-atlas-2-frame-validation";


const DEFAULT_GENERATION_SIZE =
    512;


const DEFAULT_MAX_ATTEMPTS_PER_TILE =
    3;


/*
 * This is deliberately not extremely strict yet.
 *
 * 100 means mathematically identical opposite edges.
 * Generated terrain normally needs retries before reaching
 * a reasonably similar edge pair.
 */
const DEFAULT_MINIMUM_SEAM_SCORE =
    72;

const DEFAULT_MINIMUM_INTER_TILE_SEAM_SCORE =
    60;


const DEFAULT_MAX_ATLAS_REPAIR_ATTEMPTS =
    4;


const TILE_VARIANTS = [
    "clean base terrain",

    "subtle natural variation",

    "slightly worn terrain",

    "terrain with small surface details",

    "terrain with subtle cracks",

    "terrain with material variation",

    "terrain with small accent details",

    "clean alternate terrain variation"
] as const;



export interface AssetGeneratorLike {
    generate(
        request:
            AssetGenerationRequest
    ): Promise<GeneratedAsset>;
}


export interface TilesetGenerationRequest {
    role:
        string;

    tags:
        readonly string[];

    style:
        string;

    layout:
        AssetTilesetLayoutRequirements;

    format?:
        GeneratedAssetFormat;

    generationSize?:
        number;

    maxAttemptsPerTile?:
        number;

    minimumHorizontalSeamScore?:
        number;

    minimumInterTileSeamScore?:
        number;

    maxAtlasRepairAttempts?:
        number;
}


export interface GeneratedTilesetGenerator {
    generate(
        request:
            TilesetGenerationRequest
    ): Promise<GeneratedAsset>;
}

export type TileFrameSide =
    | "top"
    | "right"
    | "bottom"
    | "left";


export type TileFrameArtifactIssue =
    | "transparent_border"
    | "probable_frame";


export interface TileFrameArtifactValidationResult {
    valid:
        boolean;

    issues:
        TileFrameArtifactIssue[];

    suspiciousSides:
        TileFrameSide[];

    transparentSides:
        TileFrameSide[];
}

interface GeneratedTileCandidate {
    sourceIndex:
        number;

    asset:
        GeneratedAsset;

    bytes:
        Buffer;

    seamScore:
        number;

    frameValidation:
        TileFrameArtifactValidationResult;
}


export class TilesetGenerator
    implements GeneratedTilesetGenerator
{
    constructor(
        private readonly generator:
            AssetGeneratorLike
    ) {}


    async generate(
        request:
            TilesetGenerationRequest
    ): Promise<GeneratedAsset> {
        validateRequest(
            request
        );


        const format =
            request.format ??
            "png";


        const generationSize =
            request.generationSize ??
            DEFAULT_GENERATION_SIZE;


        const maxAttempts =
            request.maxAttemptsPerTile ??
            DEFAULT_MAX_ATTEMPTS_PER_TILE;


        const minimumSeamScore =
            request.minimumHorizontalSeamScore ??
            DEFAULT_MINIMUM_SEAM_SCORE;
        
        const minimumInterTileSeamScore =
            request.minimumInterTileSeamScore ??
            DEFAULT_MINIMUM_INTER_TILE_SEAM_SCORE;


        const maxAtlasRepairAttempts =
            request.maxAtlasRepairAttempts ??
            DEFAULT_MAX_ATLAS_REPAIR_ATTEMPTS;


        const tileCount =
            request.layout.columns *
            request.layout.rows;


        const tiles:
            GeneratedTileCandidate[] =
            [];


        for (
            let tileIndex =
                0;

            tileIndex <
                tileCount;

            tileIndex +=
                1
        ) {
            const tile =
                await this.generateTile({
                    request,
                    tileIndex,
                    generationSize,
                    maxAttempts,
                    minimumSeamScore,
                    format
                });


            tiles.push(
                tile
            );
        }

        let ordered =
            await orderTilesForBestHorizontalSeams(
                tiles
            );


        let atlasRepairCount =
            0;


        console.log(
            [
                "[tileset-generator]",
                `order=${ordered.tileOrder.join(",")}`,
                `inter-seam-min=${ordered.minimumScore.toFixed(2)}`,
                `inter-seam-avg=${ordered.averageScore.toFixed(2)}`
            ].join(
                " "
            )
        );


        while (
            ordered.minimumScore <
                minimumInterTileSeamScore &&
            atlasRepairCount <
                maxAtlasRepairAttempts
        ) {
            const target =
                selectAtlasRepairTarget(
                    ordered,
                    atlasRepairCount
                );


            if (
                !target
            ) {
                break;
            }


            const previousSeed =
                target.asset
                    .metadata
                    .generator
                    .seed;


            const repairSeed =
                deriveAtlasRepairSeed(
                    previousSeed,
                    atlasRepairCount +
                        1
                );


            console.warn(
                [
                    "[tileset-generator]",
                    `atlas-repair=${atlasRepairCount + 1}/${maxAtlasRepairAttempts}`,
                    `worst=${ordered.minimumScore.toFixed(2)}`,
                    `required=${minimumInterTileSeamScore}`,
                    `replace-source-tile=${target.sourceIndex}`,
                    `old-seed=${previousSeed}`,
                    `new-seed=${repairSeed}`
                ].join(
                    " "
                )
            );


            const replacement =
                await this.generateTile({
                    request,

                    tileIndex:
                        target.sourceIndex,

                    generationSize,

                    maxAttempts,

                    minimumSeamScore,

                    format,

                    initialSeed:
                        repairSeed
                });


            const storageIndex =
                tiles.findIndex(
                    tile =>
                        tile.sourceIndex ===
                        target.sourceIndex
                );


            if (
                storageIndex <
                0
            ) {
                throw new Error(
                    [
                        "Unable to replace tileset tile",
                        `${target.sourceIndex}:`,
                        "source tile not found"
                    ].join(
                        " "
                    )
                );
            }


            tiles[
                storageIndex
            ] =
                replacement;


            atlasRepairCount +=
                1;


            ordered =
                await orderTilesForBestHorizontalSeams(
                    tiles
                );


            console.log(
                [
                    "[tileset-generator]",
                    `atlas-repair=${atlasRepairCount}`,
                    `order=${ordered.tileOrder.join(",")}`,
                    `inter-seam-min=${ordered.minimumScore.toFixed(2)}`,
                    `inter-seam-avg=${ordered.averageScore.toFixed(2)}`
                ].join(
                    " "
                )
            );
        }


        if (
            ordered.minimumScore <
            minimumInterTileSeamScore
        ) {
            console.warn(
                [
                    "[tileset-generator]",
                    "atlas repair budget exhausted",
                    `repairs=${atlasRepairCount}`,
                    `inter-seam-min=${ordered.minimumScore.toFixed(2)}`,
                    `required=${minimumInterTileSeamScore}`,
                    "using best available atlas"
                ].join(
                    " "
                )
            );
        }


        const atlasBytes =
            await assembleAtlas(
                ordered.tiles.map(
                    tile =>
                        tile.bytes
                ),

                request.layout,

                format
            );


        const width =
            request.layout.tileWidth *
            request.layout.columns;


        const height =
            request.layout.tileHeight *
            request.layout.rows;


        const first =
            ordered.tiles[0];


        if (
            !first
        ) {
            throw new Error(
                "Tileset generator produced zero tiles"
            );
        }


        const tileSeeds =
            ordered.tiles.map(
                tile =>
                    tile.asset
                        .metadata
                        .generator
                        .seed
            );


        const seamScores =
            ordered.tiles.map(
                tile =>
                    tile.seamScore
            );


        const promptHash =
            createAtlasHash({
                role:
                    request.role,

                layout:
                    request.layout,

                tileOrder:
                    ordered.tileOrder,

                interTileSeamScores:
                    ordered.transitionScores,

                promptHashes:
                    ordered.tiles.map(
                        tile =>
                            tile.asset
                                .metadata
                                .generator
                                .promptHash
                    ),

                requiredMinimumInterTileSeamScore:
                    minimumInterTileSeamScore,

                atlasRepairCount,

                seamScores
            });


        return {
            image: {
                bytes:
                    new Uint8Array(
                        atlasBytes
                    ),

                mimeType:
                    mimeTypeForFormat(
                        format
                    ),

                width,

                height,

                seed:
                    first.asset
                        .metadata
                        .generator
                        .seed
            },

            metadata: {
                origin:
                    "generated",

                role:
                    request.role,

                profile:
                    "tileset",

                tags: [
                    ...request.tags
                ],

                style:
                    request.style,

                generator: {
                    provider:
                        first.asset
                            .metadata
                            .generator
                            .provider,

                    model:
                        first.asset
                            .metadata
                            .generator
                            .model,

                    ...(
                        first.asset
                            .metadata
                            .generator
                            .configurationId
                            ? {
                                configurationId:
                                    first.asset
                                        .metadata
                                        .generator
                                        .configurationId
                            }
                            : {}
                    ),

                    prompt:
                        [
                            "Programmatically assembled terrain atlas.",
                            `${tileCount} individually generated seamless terrain tiles.`
                        ].join(
                            " "
                        ),

                    negativePrompt:
                        first.asset
                            .metadata
                            .generator
                            .negativePrompt,

                    promptHash,

                    /*
                     * The full list is stored below in
                     * metadata.tileset.tileSeeds.
                     */
                    seed:
                        first.asset
                            .metadata
                            .generator
                            .seed
                },

                image: {
                    width,

                    height,

                    mimeType:
                        mimeTypeForFormat(
                            format
                        ),

                    transparent:
                        false
                },

                processing: {
                    processorVersion:
                        TILESET_PROCESSOR_VERSION,

                    source: {
                        width,

                        height,

                        format
                    },

                    output: {
                        width,

                        height,

                        format
                    },

                    backgroundRemoved:
                        false,

                    trimmed:
                        false
                },

                tileset: {
                    tileWidth:
                        request.layout
                            .tileWidth,

                    tileHeight:
                        request.layout
                            .tileHeight,

                    columns:
                        request.layout
                            .columns,

                    rows:
                        request.layout
                            .rows,

                    generationSize,

                    minimumHorizontalSeamScore:
                        minimumSeamScore,

                    seamScores,

                    tileSeeds,

                    tileOrder:
                        ordered.tileOrder,

                    interTileSeamScores:
                        ordered.transitionScores,

                    minimumInterTileSeamScore:
                        ordered.minimumScore,

                    averageInterTileSeamScore:
                        ordered.averageScore,

                    requiredMinimumInterTileSeamScore:
                        minimumInterTileSeamScore,

                    atlasRepairCount
                }
            }
        };
    }


    private async generateTile(
        input: {
            request:
                TilesetGenerationRequest;

            tileIndex:
                number;

            generationSize:
                number;

            maxAttempts:
                number;

            minimumSeamScore:
                number;

            format:
                GeneratedAssetFormat;

            initialSeed?:
                number;
        }
    ): Promise<GeneratedTileCandidate> {
        let best:
            GeneratedTileCandidate |
            undefined;


        let retrySeed:
            number |
            undefined =
            input.initialSeed;


        for (
            let attempt =
                1;

            attempt <=
                input.maxAttempts;

            attempt +=
                1
        ) {
            const variant =
                TILE_VARIANTS[
                    input.tileIndex %
                    TILE_VARIANTS.length
                ];

            const semanticTags =
                input.request.tags
                    .filter(
                        tag => {
                            const normalized =
                                tag
                                    .trim()
                                    .toLowerCase()
                                    .replace(
                                        /[_-]+/g,
                                        " "
                                    );


                            return ![
                                "ground tiles",
                                "tileset",
                                "tile set",
                                "tile sheet",
                                "tiles"
                            ].includes(
                                normalized
                            );
                        }
                    );


            const generated =
                await this.generator
                    .generate({
                        role:
                            `${input.request.role}_tile_${input.tileIndex}`,

                        profile:
                            "tileset",

                        kind:
                            "tile",

                        tags: [
                            ...semanticTags,

                            variant

                        ],

                        style:
                            input.request.style,

                        width:
                            input.generationSize,

                        height:
                            input.generationSize,

                        transparent:
                            false,

                        singleSubject:
                            false,

                        /*
                         * Important:
                         *
                         * The model must generate ONE tile,
                         * not a sheet.
                         */
                        allowSpritesheet:
                            false,

                        tileable:
                            true,

                        format:
                            input.format,

                        ...(
                            retrySeed !==
                            undefined
                                ? {
                                    seed:
                                        retrySeed
                                }
                                : {}
                        )
                    });


            const resized =
                await resizeTile(
                    generated.image
                        .bytes,

                    input.request
                        .layout
                        .tileWidth,

                    input.request
                        .layout
                        .tileHeight
                );


            const seamScore =
                await calculateHorizontalSeamScore(
                    resized
                );

            const frameValidation =
                await validateTileFrameArtifacts(
                    resized
                );


            const candidate:
                GeneratedTileCandidate = {
                sourceIndex:
                    input.tileIndex,

                asset:
                    generated,

                bytes:
                    resized,

                seamScore,

                frameValidation
            };

            if (
                !frameValidation.valid
            ) {
                console.warn(
                    [
                        "[tileset-generator]",
                        `tile=${input.tileIndex}`,
                        `attempt=${attempt}`,
                        `frame-artifact=${frameValidation.issues.join(",")}`,
                        `sides=${frameValidation.suspiciousSides.join(",") || "none"}`,
                        `transparent=${frameValidation.transparentSides.join(",") || "none"}`
                    ].join(
                        " "
                    )
                );


                retrySeed =
                    deriveRetrySeed(
                        generated.metadata
                            .generator
                            .seed,

                        attempt +
                            1
                    );


                continue;
            }


            if (
                !best ||
                candidate.seamScore >
                    best.seamScore
            ) {
                best =
                    candidate;
            }


            if (
                seamScore >=
                input.minimumSeamScore
            ) {
                return candidate;
            }


            console.warn(
                [
                    "[tileset-generator]",
                    `tile=${input.tileIndex}`,
                    `attempt=${attempt}`,
                    `seam=${seamScore.toFixed(2)}`,
                    `required=${input.minimumSeamScore}`
                ].join(
                    " "
                )
            );


            retrySeed =
                deriveRetrySeed(
                    generated.metadata
                        .generator
                        .seed,

                    attempt +
                        1
                );
        }


        if (
            !best
        ) {
            throw new Error(
                [
                    `Unable to generate tileset tile ${input.tileIndex}.`,
                    `All ${input.maxAttempts} attempts contained frame artifacts.`
                ].join(
                    " "
                )
            );
        }


        /*
         * Do not kill the whole game generation because one
         * diffusion tile missed an initially heuristic seam
         * threshold.
         *
         * We keep the best candidate and expose the score in
         * metadata. Once we have real benchmark data we can
         * make this strict.
         */
        console.warn(
            [
                "[tileset-generator]",
                `tile=${input.tileIndex}`,
                "using best candidate after retries",
                `seam=${best.seamScore.toFixed(2)}`
            ].join(
                " "
            )
        );


        return best;
    }
}


export async function calculateHorizontalSeamScore(
    bytes:
        Uint8Array,

    edgeWidth =
        4
): Promise<number> {
    const decoded =
        await sharp(
            Buffer.from(
                bytes
            )
        )
            .ensureAlpha()
            .raw()
            .toBuffer({
                resolveWithObject:
                    true
            });


    const width =
        decoded.info.width;

    const height =
        decoded.info.height;

    const channels =
        decoded.info.channels;


    if (
        width <
            2 ||
        height <
            1
    ) {
        return 0;
    }


    const resolvedEdgeWidth =
        Math.max(
            1,

            Math.min(
                edgeWidth,

                Math.floor(
                    width /
                    2
                )
            )
        );


    let difference =
        0;


    let samples =
        0;


    for (
        let y =
            0;

        y <
            height;

        y +=
            1
    ) {
        for (
            let edge =
                0;

            edge <
                resolvedEdgeWidth;

            edge +=
                1
        ) {
            const leftX =
                edge;


            const rightX =
                width -
                resolvedEdgeWidth +
                edge;


            const leftIndex =
                (
                    y *
                    width +
                    leftX
                ) *
                channels;


            const rightIndex =
                (
                    y *
                    width +
                    rightX
                ) *
                channels;


            /*
             * RGB only.
             */
            for (
                let channel =
                    0;

                channel <
                    3;

                channel +=
                    1
            ) {
                difference +=
                    Math.abs(
                        decoded.data[
                            leftIndex +
                            channel
                        ] -
                        decoded.data[
                            rightIndex +
                            channel
                        ]
                    );


                samples +=
                    1;
            }
        }
    }


    if (
        samples ===
        0
    ) {
        return 0;
    }


    const averageDifference =
        difference /
        samples;


    return Number(
        (
            100 -
            (
                averageDifference /
                255 *
                100
            )
        ).toFixed(
            2
        )
    );
}

interface DecodedTileImage {
    data:
        Buffer;

    width:
        number;

    height:
        number;

    channels:
        number;
}


interface TileStripStats {
    meanLuminance:
        number;

    stdDevLuminance:
        number;

    meanAlpha:
        number;
}


export async function validateTileFrameArtifacts(
    bytes:
        Uint8Array,

    borderWidth =
        4
): Promise<TileFrameArtifactValidationResult> {
    const image =
        await decodeTileImage(
            bytes
        );


    if (
        image.width <
            8 ||
        image.height <
            8
    ) {
        return {
            valid:
                false,

            issues: [
                "probable_frame"
            ],

            suspiciousSides: [
                "top",
                "right",
                "bottom",
                "left"
            ],

            transparentSides:
                []
        };
    }


    const resolvedWidth =
        Math.max(
            1,

            Math.min(
                borderWidth,

                Math.floor(
                    Math.min(
                        image.width,
                        image.height
                    ) /
                    4
                )
            )
        );


    const sides:
        readonly TileFrameSide[] = [
            "top",
            "right",
            "bottom",
            "left"
        ];


    const suspiciousSides:
        TileFrameSide[] =
        [];


    const transparentSides:
        TileFrameSide[] =
        [];


    for (
        const side of
        sides
    ) {
        const outer =
            collectTileStripStats(
                image,
                side,
                0,
                resolvedWidth
            );


        const inner =
            collectTileStripStats(
                image,
                side,
                resolvedWidth,
                resolvedWidth
            );


        /*
         * Terrain tiles are expected to fill the complete
         * canvas. A substantially transparent edge is always
         * suspicious.
         */
        if (
            outer.meanAlpha <
            245
        ) {
            transparentSides.push(
                side
            );
        }


        const luminanceContrast =
            Math.abs(
                inner.meanLuminance -
                outer.meanLuminance
            );


        /*
         * A generated frame normally looks like a very
         * uniform strip followed by a sudden material change.
         *
         * Darkness alone is NOT enough: a uniformly dark
         * volcanic/space material must remain valid.
         */
        const flatContrastingStrip =
            outer.stdDevLuminance <=
                10 &&
            luminanceContrast >=
                18;


        const probableDarkBar =
            outer.meanLuminance <=
                24 &&
            (
                inner.meanLuminance -
                outer.meanLuminance
            ) >=
                14 &&
            outer.stdDevLuminance <=
                14;


        if (
            flatContrastingStrip ||
            probableDarkBar
        ) {
            suspiciousSides.push(
                side
            );
        }
    }


    const hasHorizontalPair =
        suspiciousSides.includes(
            "top"
        ) &&
        suspiciousSides.includes(
            "bottom"
        );


    const hasVerticalPair =
        suspiciousSides.includes(
            "left"
        ) &&
        suspiciousSides.includes(
            "right"
        );


    /*
     * Requiring either an opposite pair or 3+ suspicious
     * sides avoids treating one naturally dark edge as a
     * generated frame.
     */
    const probableFrame =
        hasHorizontalPair ||
        hasVerticalPair ||
        suspiciousSides.length >=
            3;


    const issues:
        TileFrameArtifactIssue[] =
        [];


    if (
        transparentSides.length >
        0
    ) {
        issues.push(
            "transparent_border"
        );
    }


    if (
        probableFrame
    ) {
        issues.push(
            "probable_frame"
        );
    }


    return {
        valid:
            issues.length ===
            0,

        issues,

        suspiciousSides,

        transparentSides
    };
}


async function decodeTileImage(
    bytes:
        Uint8Array
): Promise<DecodedTileImage> {
    const decoded =
        await sharp(
            Buffer.from(
                bytes
            )
        )
            .ensureAlpha()
            .raw()
            .toBuffer({
                resolveWithObject:
                    true
            });


    return {
        data:
            decoded.data,

        width:
            decoded.info.width,

        height:
            decoded.info.height,

        channels:
            decoded.info.channels
    };
}


function collectTileStripStats(
    image:
        DecodedTileImage,

    side:
        TileFrameSide,

    offset:
        number,

    thickness:
        number
): TileStripStats {
    let luminanceSum =
        0;

    let luminanceSquaredSum =
        0;

    let alphaSum =
        0;

    let samples =
        0;


    const inspect =
        (
            x:
                number,

            y:
                number
        ): void => {
            if (
                x <
                    0 ||
                x >=
                    image.width ||
                y <
                    0 ||
                y >=
                    image.height
            ) {
                return;
            }


            const index =
                (
                    y *
                    image.width +
                    x
                ) *
                image.channels;


            const red =
                image.data[
                    index
                ] ??
                0;


            const green =
                image.data[
                    index +
                    1
                ] ??
                0;


            const blue =
                image.data[
                    index +
                    2
                ] ??
                0;


            const alpha =
                image.data[
                    index +
                    3
                ] ??
                255;


            const luminance =
                red *
                    0.2126 +
                green *
                    0.7152 +
                blue *
                    0.0722;


            luminanceSum +=
                luminance;


            luminanceSquaredSum +=
                luminance *
                luminance;


            alphaSum +=
                alpha;


            samples +=
                1;
        };


    if (
        side ===
            "left" ||
        side ===
            "right"
    ) {
        const startX =
            side ===
                "left"
                ? offset
                : image.width -
                    offset -
                    thickness;


        for (
            let x =
                startX;

            x <
                startX +
                    thickness;

            x +=
                1
        ) {
            for (
                let y =
                    0;

                y <
                    image.height;

                y +=
                    1
            ) {
                inspect(
                    x,
                    y
                );
            }
        }
    } else {
        const startY =
            side ===
                "top"
                ? offset
                : image.height -
                    offset -
                    thickness;


        for (
            let y =
                startY;

            y <
                startY +
                    thickness;

            y +=
                1
        ) {
            for (
                let x =
                    0;

                x <
                    image.width;

                x +=
                    1
            ) {
                inspect(
                    x,
                    y
                );
            }
        }
    }


    if (
        samples ===
        0
    ) {
        return {
            meanLuminance:
                0,

            stdDevLuminance:
                0,

            meanAlpha:
                0
        };
    }


    const meanLuminance =
        luminanceSum /
        samples;


    const variance =
        Math.max(
            0,

            luminanceSquaredSum /
                samples -
                meanLuminance *
                meanLuminance
        );


    return {
        meanLuminance,

        stdDevLuminance:
            Math.sqrt(
                variance
            ),

        meanAlpha:
            alphaSum /
            samples
    };
}

export async function calculateInterTileSeamScore(
    leftBytes:
        Uint8Array,

    rightBytes:
        Uint8Array,

    edgeWidth =
        4
): Promise<number> {
    const [
        left,
        right
    ] =
        await Promise.all([
            decodeRgba(
                leftBytes
            ),

            decodeRgba(
                rightBytes
            )
        ]);


    if (
        left.height !==
        right.height
    ) {
        return 0;
    }


    const resolvedEdgeWidth =
        Math.max(
            1,

            Math.min(
                edgeWidth,
                left.width,
                right.width
            )
        );


    let difference =
        0;

    let samples =
        0;


    for (
        let y =
            0;

        y <
            left.height;

        y +=
            1
    ) {
        for (
            let edge =
                0;

            edge <
                resolvedEdgeWidth;

            edge +=
                1
        ) {
            const leftX =
                left.width -
                resolvedEdgeWidth +
                edge;


            const rightX =
                edge;


            const leftIndex =
                (
                    y *
                    left.width +
                    leftX
                ) *
                left.channels;


            const rightIndex =
                (
                    y *
                    right.width +
                    rightX
                ) *
                right.channels;


            for (
                let channel =
                    0;

                channel <
                    3;

                channel +=
                    1
            ) {
                const leftValue =
                    left.data[
                        leftIndex +
                        channel
                    ];


                const rightValue =
                    right.data[
                        rightIndex +
                        channel
                    ];


                if (
                    leftValue ===
                        undefined ||
                    rightValue ===
                        undefined
                ) {
                    continue;
                }


                difference +=
                    Math.abs(
                        leftValue -
                        rightValue
                    );


                samples +=
                    1;
            }
        }
    }


    if (
        samples ===
        0
    ) {
        return 0;
    }


    const averageDifference =
        difference /
        samples;


    return Number(
        (
            100 -
            averageDifference /
                255 *
                100
        ).toFixed(
            2
        )
    );
}


async function resizeTile(
    bytes:
        Uint8Array,

    width:
        number,

    height:
        number
): Promise<Buffer> {
    return sharp(
        Buffer.from(
            bytes
        )
    )
        .resize({
            width,

            height,

            fit:
                "fill",

            kernel:
                sharp.kernel
                    .nearest
        })
        .png({
            compressionLevel:
                9
        })
        .toBuffer();
}


async function assembleAtlas(
    tiles:
        readonly Buffer[],

    layout:
        AssetTilesetLayoutRequirements,

    format:
        GeneratedAssetFormat
): Promise<Buffer> {
    const expected =
        layout.columns *
        layout.rows;


    if (
        tiles.length !==
        expected
    ) {
        throw new Error(
            [
                `Tileset atlas expected ${expected} tiles,`,
                `received ${tiles.length}`
            ].join(
                " "
            )
        );
    }


    const width =
        layout.tileWidth *
        layout.columns;


    const height =
        layout.tileHeight *
        layout.rows;


    let pipeline =
        sharp({
            create: {
                width,

                height,

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
            .composite(
                tiles.map(
                    (
                        input,
                        index
                    ) => {
                        const column =
                            index %
                            layout.columns;


                        const row =
                            Math.floor(
                                index /
                                layout.columns
                            );


                        return {
                            input,

                            left:
                                column *
                                layout.tileWidth,

                            top:
                                row *
                                layout.tileHeight
                        };
                    }
                )
            );


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

function deriveAtlasRepairSeed(
    baseSeed:
        number,

    repairAttempt:
        number
): number {
    const value =
        (
            baseSeed +
            repairAttempt *
                10_000_019
        ) %
        2_147_483_647;


    return Math.max(
        1,
        value
    );
}


function deriveRetrySeed(
    baseSeed:
        number,

    attempt:
        number
): number {
    const value =
        (
            baseSeed +
            Math.max(
                0,
                attempt -
                1
            ) *
            1_000_003
        ) %
        2_147_483_647;


    return Math.max(
        1,
        value
    );
}


function createAtlasHash(
    value:
        unknown
): string {
    return createHash(
        "sha256"
    )
        .update(
            JSON.stringify(
                value
            )
        )
        .digest(
            "hex"
        );
}


function mimeTypeForFormat(
    format:
        GeneratedAssetFormat
): string {
    return format ===
        "webp"
        ? "image/webp"
        : "image/png";
}


function validateRequest(
    request:
        TilesetGenerationRequest
): void {
    const {
        tileWidth,
        tileHeight,
        columns,
        rows
    } =
        request.layout;


    for (
        const [
            name,
            value
        ] of [
            [
                "tileWidth",
                tileWidth
            ],

            [
                "tileHeight",
                tileHeight
            ],

            [
                "columns",
                columns
            ],

            [
                "rows",
                rows
            ]
        ] as const
    ) {
        if (
            !Number.isInteger(
                value
            ) ||
            value <=
                0
        ) {
            throw new Error(
                `Tileset ${name} must be a positive integer`
            );
        }
    }


    const count =
        columns *
        rows;


    if (
        count >
        64
    ) {
        throw new Error(
            `Tileset contains too many tiles: ${count}`
        );
    }


    if (
        request.generationSize !==
            undefined &&
        (
            !Number.isInteger(
                request.generationSize
            ) ||
            request.generationSize <=
                0
        )
    ) {
        throw new Error(
            "Tileset generationSize must be a positive integer"
        );
    }


    if (
        request.maxAttemptsPerTile !==
            undefined &&
        (
            !Number.isInteger(
                request.maxAttemptsPerTile
            ) ||
            request.maxAttemptsPerTile <
                1
        )
    ) {
        throw new Error(
            "Tileset maxAttemptsPerTile must be at least 1"
        );
    }


    if (
        request.minimumHorizontalSeamScore !==
            undefined &&
        (
            request.minimumHorizontalSeamScore <
                0 ||
            request.minimumHorizontalSeamScore >
                100
        )
    ) {
        throw new Error(
            "Tileset minimumHorizontalSeamScore must be between 0 and 100"
        );
    }

    if (
        request.minimumInterTileSeamScore !==
            undefined &&
        (
            request.minimumInterTileSeamScore <
                0 ||
            request.minimumInterTileSeamScore >
                100
        )
    ) {
        throw new Error(
            "Tileset minimumInterTileSeamScore must be between 0 and 100"
        );
    }


    if (
        request.maxAtlasRepairAttempts !==
            undefined &&
        (
            !Number.isInteger(
                request.maxAtlasRepairAttempts
            ) ||
            request.maxAtlasRepairAttempts <
                0
        )
    ) {
        throw new Error(
            "Tileset maxAtlasRepairAttempts must be a non-negative integer"
        );
    }
}

interface DecodedRgbaImage {
    data:
        Buffer;

    width:
        number;

    height:
        number;

    channels:
        number;
}


async function decodeRgba(
    bytes:
        Uint8Array
): Promise<DecodedRgbaImage> {
    const decoded =
        await sharp(
            Buffer.from(
                bytes
            )
        )
            .ensureAlpha()
            .raw()
            .toBuffer({
                resolveWithObject:
                    true
            });


    return {
        data:
            decoded.data,

        width:
            decoded.info.width,

        height:
            decoded.info.height,

        channels:
            decoded.info.channels
    };
}

export interface CyclicTileOrder {
    order:
        number[];

    transitionScores:
        number[];

    minimumScore:
        number;

    averageScore:
        number;
}


export function findBestCyclicTileOrder(
    tileCount:
        number,

    getScore:
        (
            from:
                number,

            to:
                number
        ) => number
): CyclicTileOrder {
    if (
        tileCount <=
        0
    ) {
        return {
            order:
                [],

            transitionScores:
                [],

            minimumScore:
                0,

            averageScore:
                0
        };
    }


    if (
        tileCount ===
        1
    ) {
        return evaluateTileOrder(
            [
                0
            ],
            getScore
        );
    }


    /*
     * Exact search is cheap for our current 8-frame atlas:
     *
     * fixing frame 0 removes rotational duplicates:
     * 7! = 5040 candidates.
     */
    if (
        tileCount <=
        9
    ) {
        const tail =
            Array.from(
                {
                    length:
                        tileCount -
                        1
                },

                (
                    _,
                    index
                ) =>
                    index +
                    1
            );


        let best:
            CyclicTileOrder |
            undefined;


        forEachPermutation(
            tail,

            permutation => {
                const candidate =
                    evaluateTileOrder(
                        [
                            0,
                            ...permutation
                        ],

                        getScore
                    );


                if (
                    isBetterOrder(
                        candidate,
                        best
                    )
                ) {
                    best =
                        candidate;
                }
            }
        );


        if (
            best
        ) {
            return best;
        }
    }


    /*
     * Fallback for future large atlases where factorial
     * search would be unreasonable.
     */
    let best:
        CyclicTileOrder |
        undefined;


    for (
        let start =
            0;

        start <
            tileCount;

        start +=
            1
    ) {
        const order =
            buildGreedyOrder(
                start,
                tileCount,
                getScore
            );


        const candidate =
            evaluateTileOrder(
                order,
                getScore
            );


        if (
            isBetterOrder(
                candidate,
                best
            )
        ) {
            best =
                candidate;
        }
    }


    if (
        !best
    ) {
        throw new Error(
            "Unable to determine tileset frame order"
        );
    }


    return best;
}

function evaluateTileOrder(
    order:
        readonly number[],

    getScore:
        (
            from:
                number,

            to:
                number
        ) => number
): CyclicTileOrder {
    if (
        order.length ===
        0
    ) {
        return {
            order:
                [],

            transitionScores:
                [],

            minimumScore:
                0,

            averageScore:
                0
        };
    }


    const transitionScores:
        number[] =
        [];


    for (
        let index =
            0;

        index <
            order.length;

        index +=
            1
    ) {
        const from =
            order[
                index
            ];


        const to =
            order[
                (
                    index +
                    1
                ) %
                order.length
            ];


        if (
            from ===
                undefined ||
            to ===
                undefined
        ) {
            throw new Error(
                "Invalid tileset order"
            );
        }


        transitionScores.push(
            getScore(
                from,
                to
            )
        );
    }


    const minimumScore =
        Math.min(
            ...transitionScores
        );


    const averageScore =
        transitionScores.reduce(
            (
                sum,
                score
            ) =>
                sum +
                score,

            0
        ) /
        transitionScores.length;


    return {
        order: [
            ...order
        ],

        transitionScores:
            transitionScores.map(
                score =>
                    Number(
                        score.toFixed(
                            2
                        )
                    )
            ),

        minimumScore:
            Number(
                minimumScore.toFixed(
                    2
                )
            ),

        averageScore:
            Number(
                averageScore.toFixed(
                    2
                )
            )
    };
}


function isBetterOrder(
    candidate:
        CyclicTileOrder,

    current:
        CyclicTileOrder |
        undefined
): boolean {
    if (
        !current
    ) {
        return true;
    }


    /*
     * Prefer eliminating the single worst visible seam.
     * Average quality is only the tie-breaker.
     */
    if (
        candidate.minimumScore !==
        current.minimumScore
    ) {
        return candidate.minimumScore >
            current.minimumScore;
    }


    return candidate.averageScore >
        current.averageScore;
}


function forEachPermutation(
    values:
        readonly number[],

    visit:
        (
            permutation:
                number[]
        ) => void
): void {
    const used =
        new Array<boolean>(
            values.length
        ).fill(
            false
        );


    const current:
        number[] =
        [];


    const recurse =
        (): void => {
            if (
                current.length ===
                values.length
            ) {
                visit(
                    [
                        ...current
                    ]
                );

                return;
            }


            for (
                let index =
                    0;

                index <
                    values.length;

                index +=
                    1
            ) {
                if (
                    used[
                        index
                    ]
                ) {
                    continue;
                }


                const value =
                    values[
                        index
                    ];


                if (
                    value ===
                    undefined
                ) {
                    continue;
                }


                used[
                    index
                ] =
                    true;


                current.push(
                    value
                );


                recurse();


                current.pop();


                used[
                    index
                ] =
                    false;
            }
        };


    recurse();
}


function buildGreedyOrder(
    start:
        number,

    tileCount:
        number,

    getScore:
        (
            from:
                number,

            to:
                number
        ) => number
): number[] {
    const remaining =
        new Set<number>();


    for (
        let index =
            0;

        index <
            tileCount;

        index +=
            1
    ) {
        if (
            index !==
            start
        ) {
            remaining.add(
                index
            );
        }
    }


    const order = [
        start
    ];


    while (
        remaining.size >
        0
    ) {
        const current =
            order[
                order.length -
                1
            ];


        if (
            current ===
            undefined
        ) {
            break;
        }


        let bestNext:
            number |
            undefined;


        let bestScore =
            Number.NEGATIVE_INFINITY;


        for (
            const candidate of
            remaining
        ) {
            const score =
                getScore(
                    current,
                    candidate
                );


            if (
                score >
                bestScore
            ) {
                bestScore =
                    score;

                bestNext =
                    candidate;
            }
        }


        if (
            bestNext ===
            undefined
        ) {
            break;
        }


        order.push(
            bestNext
        );


        remaining.delete(
            bestNext
        );
    }


    return order;
}

interface OrderedTiles {
    tiles:
        GeneratedTileCandidate[];

    tileOrder:
        number[];

    transitionScores:
        number[];

    minimumScore:
        number;

    averageScore:
        number;
}

function selectAtlasRepairTarget(
    ordered:
        OrderedTiles,

    repairAttempt:
        number
): GeneratedTileCandidate | undefined {
    if (
        ordered.tiles.length ===
            0 ||
        ordered.transitionScores.length ===
            0
    ) {
        return undefined;
    }


    let worstTransitionIndex =
        0;


    let worstScore =
        Number.POSITIVE_INFINITY;


    for (
        let index =
            0;

        index <
            ordered.transitionScores.length;

        index +=
            1
    ) {
        const score =
            ordered.transitionScores[
                index
            ];


        if (
            score ===
            undefined
        ) {
            continue;
        }


        if (
            score <
            worstScore
        ) {
            worstScore =
                score;

            worstTransitionIndex =
                index;
        }
    }


    const from =
        ordered.tiles[
            worstTransitionIndex
        ];


    const to =
        ordered.tiles[
            (
                worstTransitionIndex +
                1
            ) %
            ordered.tiles.length
        ];


    if (
        !from
    ) {
        return to;
    }


    if (
        !to
    ) {
        return from;
    }


    /*
     * First try replacing the weaker standalone tile.
     *
     * On the next repair round prefer the opposite side
     * of the bad transition so we do not regenerate the
     * same endpoint forever.
     */
    const weaker =
        from.seamScore <=
            to.seamScore
            ? from
            : to;


    const stronger =
        weaker ===
            from
            ? to
            : from;


    return repairAttempt %
            2 ===
        0
        ? weaker
        : stronger;
}


async function orderTilesForBestHorizontalSeams(
    tiles:
        readonly GeneratedTileCandidate[]
): Promise<OrderedTiles> {
    if (
        tiles.length ===
        0
    ) {
        return {
            tiles:
                [],

            tileOrder:
                [],

            transitionScores:
                [],

            minimumScore:
                0,

            averageScore:
                0
        };
    }


    const scores =
        new Map<
            string,
            number
        >();


    for (
        let from =
            0;

        from <
            tiles.length;

        from +=
            1
    ) {
        const fromTile =
            tiles[
                from
            ];


        if (
            !fromTile
        ) {
            continue;
        }


        for (
            let to =
                0;

            to <
                tiles.length;

            to +=
                1
        ) {
            const toTile =
                tiles[
                    to
                ];


            if (
                !toTile
            ) {
                continue;
            }


            const score =
                from ===
                    to
                    ? fromTile
                        .seamScore
                    : await calculateInterTileSeamScore(
                        fromTile.bytes,
                        toTile.bytes
                    );


            scores.set(
                pairKey(
                    from,
                    to
                ),

                score
            );
        }
    }


    const ordering =
        findBestCyclicTileOrder(
            tiles.length,

            (
                from,
                to
            ) =>
                scores.get(
                    pairKey(
                        from,
                        to
                    )
                ) ??
                0
        );


    const orderedTiles:
        GeneratedTileCandidate[] =
        [];


    for (
        const index of
        ordering.order
    ) {
        const tile =
            tiles[
                index
            ];


        if (
            !tile
        ) {
            throw new Error(
                `Tileset ordering referenced missing tile ${index}`
            );
        }


        orderedTiles.push(
            tile
        );
    }


    return {
        tiles:
            orderedTiles,

        tileOrder:
            orderedTiles.map(
                tile =>
                    tile.sourceIndex
            ),

        transitionScores:
            ordering.transitionScores,

        minimumScore:
            ordering.minimumScore,

        averageScore:
            ordering.averageScore
    };
}


function pairKey(
    from:
        number,

    to:
        number
): string {
    return `${from}:${to}`;
}