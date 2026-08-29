import {
    createHash
} from "node:crypto";

import {
    mkdir,
    readFile,
    writeFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import type {
    GeneratedAsset,
    GeneratedAssetFormat,
    GeneratedAssetKind
} from "./AssetGenerationTypes.js";

export interface GeneratedAssetCache {
    get(
        key:
            string
    ):
        Promise<
            GeneratedAsset |
            null
        >;

    put(
        key:
            string,

        asset:
            GeneratedAsset
    ):
        Promise<void>;
}

export interface GeneratedAssetCacheKeyInput {
    provider:
        string;

    model:
        string;

    providerConfiguration?:
        string;

    promptHash:
        string;

    seed:
        number;

    kind:
        GeneratedAssetKind;

    width:
        number;

    height:
        number;

    transparent:
        boolean;

    format:
        GeneratedAssetFormat;

    processor:
        string;
}

export class FileGeneratedAssetCache
    implements GeneratedAssetCache
{
    constructor(
        private readonly rootDir:
            string
    ) {}

    async get(
        key:
            string
    ): Promise<
        GeneratedAsset |
        null
    > {
        const paths =
            this.getPaths(
                key
            );

        try {
            const [
                bytes,
                metadataSource
            ] =
                await Promise.all([
                    readFile(
                        paths.image
                    ),

                    readFile(
                        paths.metadata,
                        "utf8"
                    )
                ]);

            const parsed:
                unknown =
                JSON.parse(
                    metadataSource
                );

            if (
                !isCacheMetadata(
                    parsed
                )
            ) {
                return null;
            }

            return {
                image: {
                    bytes:
                        new Uint8Array(
                            bytes
                        ),

                    mimeType:
                        parsed.image
                            .mimeType,

                    width:
                        parsed.image
                            .width,

                    height:
                        parsed.image
                            .height,

                    seed:
                        parsed.image
                            .seed
                },

                metadata:
                    parsed.metadata
            };
        } catch (
            error
        ) {
            if (
                isMissingFileError(
                    error
                )
            ) {
                return null;
            }

            if (
                error instanceof
                    SyntaxError
            ) {
                return null;
            }

            throw error;
        }
    }

    async put(
        key:
            string,

        asset:
            GeneratedAsset
    ): Promise<void> {
        const paths =
            this.getPaths(
                key
            );

        await mkdir(
            paths.directory,
            {
                recursive:
                    true
            }
        );

        await writeFile(
            paths.image,
            asset.image.bytes
        );

        await writeFile(
            paths.metadata,
            JSON.stringify(
                {
                    image: {
                        mimeType:
                            asset.image
                                .mimeType,

                        width:
                            asset.image
                                .width,

                        height:
                            asset.image
                                .height,

                        seed:
                            asset.image
                                .seed
                    },

                    metadata:
                        asset.metadata
                },
                null,
                2
            ),
            "utf8"
        );
    }

    private getPaths(
        key:
            string
    ) {
        const directory =
            join(
                this.rootDir,
                key.slice(
                    0,
                    2
                )
            );

        return {
            directory,

            image:
                join(
                    directory,
                    `${key}.bin`
                ),

            metadata:
                join(
                    directory,
                    `${key}.json`
                )
        };
    }
}

export function createGeneratedAssetCacheKey(
    input:
        GeneratedAssetCacheKeyInput
): string {
    return createHash(
        "sha256"
    )
        .update(
            JSON.stringify({
                provider:
                    input.provider,

                model:
                    input.model,

                providerConfiguration:
                    input.providerConfiguration,

                promptHash:
                    input.promptHash,

                seed:
                    input.seed,

                kind:
                    input.kind,

                width:
                    input.width,

                height:
                    input.height,

                transparent:
                    input.transparent,

                format:
                    input.format,

                processor:
                    input.processor
            })
        )
        .digest(
            "hex"
        );
}

function isCacheMetadata(
    value:
        unknown
): value is {
    image: {
        mimeType:
            string;

        width:
            number;

        height:
            number;

        seed?:
            number;
    };

    metadata:
        GeneratedAsset["metadata"];
} {
    if (
        !isRecord(
            value
        ) ||
        !isRecord(
            value.image
        ) ||
        !isRecord(
            value.metadata
        )
    ) {
        return false;
    }

    return (
        typeof value.image
            .mimeType ===
            "string" &&
        typeof value.image
            .width ===
            "number" &&
        typeof value.image
            .height ===
            "number" &&
        value.metadata
            .origin ===
            "generated"
    );
}

function isRecord(
    value:
        unknown
): value is
    Record<
        string,
        unknown
    > {
    return (
        typeof value ===
            "object" &&
        value !==
            null &&
        !Array.isArray(
            value
        )
    );
}

function isMissingFileError(
    error:
        unknown
): boolean {
    return (
        isRecord(
            error
        ) &&
        error.code ===
            "ENOENT"
    );
}