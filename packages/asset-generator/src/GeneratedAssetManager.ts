import {
    mkdir,
    writeFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import type {
    AssetManager,
    AssetManifestEntry,
    AssetRequirement,
    AssetResolutionResult,
    ResolveAssetsInput
} from "@game-factory/assets";

import type {
    AssetGenerator
} from "./AssetGenerator.js";

import type {
    GeneratedAsset,
    GeneratedAssetFormat,
    GeneratedAssetKind
} from "./AssetGenerationTypes.js";

import type {
    AssetGenerationProfile
} from "@game-factory/assets";

import {
    TilesetGenerator,

    type GeneratedTilesetGenerator
} from "./TilesetGenerator.js";

export interface GeneratedAssetManagerOptions {
    generator:
        AssetGenerator;

    style:
        string;

    spriteGenerationSize?:
        number;

    format?:
        GeneratedAssetFormat;

    writeMetadata?:
        boolean;

    tilesetGenerator?:
        GeneratedTilesetGenerator;
}

export class GeneratedAssetManager
    implements AssetManager
{
    private readonly generator:
        AssetGenerator;

    private readonly style:
        string;

    private readonly spriteGenerationSize:
        number;

    private readonly format:
        GeneratedAssetFormat;

    private readonly writeMetadata:
        boolean;

    private readonly tilesetGenerator:
        GeneratedTilesetGenerator;

    constructor(
        options:
            GeneratedAssetManagerOptions
    ) {
        this.generator =
            options.generator;

        this.tilesetGenerator =
            options.tilesetGenerator ??
            new TilesetGenerator(
                this.generator
            );

        this.style =
            options.style;

        this.spriteGenerationSize =
            options.spriteGenerationSize ??
            512;

        this.format =
            options.format ??
            "png";

        this.writeMetadata =
            options.writeMetadata ??
            true;

        if (
            !this.style.trim()
        ) {
            throw new Error(
                "GeneratedAssetManager style cannot be empty"
            );
        }

        if (
            this.spriteGenerationSize <=
            0
        ) {
            throw new Error(
                "GeneratedAssetManager spriteGenerationSize must be positive"
            );
        }
    }

    async resolve(
        input:
            ResolveAssetsInput
    ): Promise<AssetResolutionResult> {
        await mkdir(
            input.assetsDir,
            {
                recursive:
                    true
            }
        );

        const assets:
            AssetManifestEntry[] = [];

        for (
            const requirement of
            input.requirements
        ) {
            const entry =
                await this.resolveRequirement(
                    requirement,
                    input.assetsDir
                );

            assets.push(
                entry
            );
        }

        return {
            manifest: {
                assets
            }
        };
    }

    private async resolveRequirement(
        requirement:
            AssetRequirement,

        assetsDir:
            string
    ): Promise<AssetManifestEntry> {
        const dimensions =
            resolveGenerationDimensions(
                requirement,
                this.spriteGenerationSize
            );

        const profile =
            resolveGenerationProfile(
                requirement
            );

        const kind =
            resolveGenerationKind(
                profile
            );

        const transparent =
            requirement
                .requirements
                .transparent ??
            requirement.type ===
                "sprite";

        const generation =
            requirement
                .requirements
                .generation;


        const generated =
            profile ===
                "tileset"
                ? await this.tilesetGenerator
                    .generate({
                        role:
                            requirement.role,

                        tags:
                            requirement.tags,

                        style:
                            this.style,

                        format:
                            this.format,

                        generationSize:
                            this.spriteGenerationSize,

                        layout:
                            requireTilesetLayout(
                                requirement
                            )
                    })

                : await this.generator
                    .generate({
                        role:
                            requirement.role,

                        profile,

                        kind,

                        tags:
                            requirement.tags,

                        style:
                            this.style,

                        width:
                            dimensions.width,

                        height:
                            dimensions.height,

                        transparent,

                        format:
                            this.format,

                        singleSubject:
                            generation
                                ?.singleSubject,

                        allowSpritesheet:
                            generation
                                ?.allowSpritesheet,

                        tileable:
                            generation
                                ?.tileable,

                        uiKind:
                            generation
                                ?.uiKind
                    });

        const extension =
            getGeneratedAssetExtension(
                generated
            );

        const safeRole =
            sanitizeRole(
                requirement.role
            );

        const fileName =
            `${safeRole}${extension}`;

        await writeFile(
            join(
                assetsDir,
                fileName
            ),
            generated.image.bytes
        );

        if (
            this.writeMetadata
        ) {
            await writeFile(
                join(
                    assetsDir,
                    `${safeRole}.generated.json`
                ),

                JSON.stringify(
                    generated.metadata,
                    null,
                    2
                ),

                "utf8"
            );
        }

        return {
            role:
                requirement.role,

            gamePath:
                [
                    "assets",
                    fileName
                ].join(
                    "/"
                ),

            source:
                "generated",

            sourceAssetId:
                `generated:${generated.metadata.generator.promptHash}`,

            ...(
                generated.metadata
                    .tileset
                    ? {
                        spritesheet: {
                            frameWidth:
                                generated.metadata
                                    .tileset
                                    .tileWidth,

                            frameHeight:
                                generated.metadata
                                    .tileset
                                    .tileHeight,

                            columns:
                                generated.metadata
                                    .tileset
                                    .columns,

                            rows:
                                generated.metadata
                                    .tileset
                                    .rows
                        }
                    }
                    : {}
            ),

            license: {
                type:
                    "generated"
            }
        };
    }
}

function resolveGenerationKind(
    profile:
        AssetGenerationProfile
): GeneratedAssetKind {
    switch (
        profile
    ) {
        case "character":
        case "npc":
        case "item":
        case "obstacle":
        case "ui":
            return "sprite";

        case "background":
        case "tileset":
            return "background";
    }
}

function resolveGenerationDimensions(
    requirement:
        AssetRequirement,

    spriteGenerationSize:
        number
): {
    width:
        number;

    height:
        number;
} {
    const dimensions =
        requirement
            .requirements
            .dimensions;

    if (
        requirement.type ===
        "sprite"
    ) {
        return {
            width:
                Math.max(
                    dimensions
                        ?.preferredWidth ??
                        spriteGenerationSize,

                    spriteGenerationSize
                ),

            height:
                Math.max(
                    dimensions
                        ?.preferredHeight ??
                        spriteGenerationSize,

                    spriteGenerationSize
                )
        };
    }

    const fallback =
        getImageFallbackDimensions(
            requirement
        );

    return {
        width:
            dimensions
                ?.preferredWidth ??
            fallback.width,

        height:
            dimensions
                ?.preferredHeight ??
            fallback.height
    };
}

function getImageFallbackDimensions(
    requirement:
        AssetRequirement
): {
    width:
        number;

    height:
        number;
} {
    switch (
        requirement
            .requirements
            .orientation
    ) {
        case "portrait":
            return {
                width:
                    720,

                height:
                    1280
            };

        case "square":
            return {
                width:
                    1024,

                height:
                    1024
            };

        case "landscape":
        default:
            return {
                width:
                    1280,

                height:
                    720
            };
    }
}

function getGeneratedAssetExtension(
    generated:
        GeneratedAsset
): string {
    switch (
        generated.image
            .mimeType
    ) {
        case "image/png":
            return ".png";

        case "image/webp":
            return ".webp";

        default:
            throw new Error(
                `Unsupported generated asset MIME type: ${generated.image.mimeType}`
            );
    }
}

function sanitizeRole(
    role:
        string
): string {
    const result =
        role
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9_-]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );

    if (
        !result
    ) {
        throw new Error(
            `Invalid asset role: "${role}"`
        );
    }

    return result;
}

function resolveGenerationProfile(
    requirement:
        AssetRequirement
): AssetGenerationProfile {
    const explicit =
        requirement
            .requirements
            .generation
            ?.profile;

    if (
        explicit
    ) {
        return explicit;
    }

    /*
     * Compatibility fallback for older templates.
     */
    switch (
        requirement.role
    ) {
        case "player":
            return "character";

        case "obstacle":
            return "obstacle";

        case "background":
            return "background";
    }

    switch (
        requirement.type
    ) {
        case "sprite":
            return "item";

        case "image":
            return "background";
    }
}

function requireTilesetLayout(
    requirement:
        AssetRequirement
) {
    const layout =
        requirement
            .requirements
            .generation
            ?.tileset;


    if (
        !layout
    ) {
        throw new Error(
            [
                `Tileset asset "${requirement.role}"`,
                "does not define generation.tileset layout"
            ].join(
                " "
            )
        );
    }


    return layout;
}