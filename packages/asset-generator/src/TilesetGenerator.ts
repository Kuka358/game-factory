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
    "tileset-atlas-1";


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
}


export interface GeneratedTilesetGenerator {
    generate(
        request:
            TilesetGenerationRequest
    ): Promise<GeneratedAsset>;
}


interface GeneratedTileCandidate {
    asset:
        GeneratedAsset;

    bytes:
        Buffer;

    seamScore:
        number;
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


        const atlasBytes =
            await assembleAtlas(
                tiles.map(
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
            tiles[0];


        if (
            !first
        ) {
            throw new Error(
                "Tileset generator produced zero tiles"
            );
        }


        const tileSeeds =
            tiles.map(
                tile =>
                    tile.asset
                        .metadata
                        .generator
                        .seed
            );


        const seamScores =
            tiles.map(
                tile =>
                    tile.seamScore
            );


        const promptHash =
            createAtlasHash({
                role:
                    request.role,

                layout:
                    request.layout,

                promptHashes:
                    tiles.map(
                        tile =>
                            tile.asset
                                .metadata
                                .generator
                                .promptHash
                    ),

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

                    tileSeeds
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
        }
    ): Promise<GeneratedTileCandidate> {
        let best:
            GeneratedTileCandidate |
            undefined;


        let retrySeed:
            number |
            undefined;


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


            const generated =
                await this.generator
                    .generate({
                        role:
                            `${input.request.role}_tile_${input.tileIndex}`,

                        profile:
                            "tileset",

                        kind:
                            "background",

                        tags: [
                            ...input.request.tags,

                            variant,

                            `terrain tile variation ${input.tileIndex + 1}`
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


            const candidate:
                GeneratedTileCandidate = {
                asset:
                    generated,

                bytes:
                    resized,

                seamScore
            };


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
                `Unable to generate tileset tile ${input.tileIndex}`
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
}