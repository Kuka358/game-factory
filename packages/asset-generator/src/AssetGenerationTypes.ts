import type {
    AssetGenerationProfile,
    AssetUiKind
} from "@game-factory/assets";


export type GeneratedAssetKind =
    | "sprite"
    | "background"
    | "tile";

export type GeneratedAssetFormat =
    | "png"
    | "webp";

export interface AssetGenerationRequest {
    role:
        string;

    profile:
        AssetGenerationProfile;

    kind:
        GeneratedAssetKind;

    tags:
        readonly string[];

    style:
        string;

    width:
        number;

    height:
        number;

    transparent:
        boolean;

    singleSubject?:
        boolean;

    allowSpritesheet?:
        boolean;

    /*
     * Used by tileset generation policy.
     */
    tileable?:
        boolean;

    /*
     * Used only for profile="ui".
     */
    uiKind?:
        AssetUiKind;

    animation?:
        string;

    seed?:
        number;

    format?:
        GeneratedAssetFormat;
}

export type NormalizedAssetGenerationRequest =
    Omit<
        AssetGenerationRequest,
        "seed" | "format"
    > & {
        seed:
            number;

        format:
            GeneratedAssetFormat;
    };

export interface AssetGenerationPrompt {
    positive:
        string;

    negative:
        string;
}

export interface GeneratedImage {
    bytes:
        Uint8Array;

    mimeType:
        string;

    width:
        number;

    height:
        number;

    seed?:
        number;
}

export interface GeneratedAssetProcessingMetadata {
    processorVersion:
        string;

    source: {
        width:
            number;

        height:
            number;

        format:
            string | null;
    };

    output: {
        width:
            number;

        height:
            number;

        format:
            GeneratedAssetFormat;
    };

    backgroundRemoved:
        boolean;

    trimmed:
        boolean;
}

export interface GeneratedTilesetMetadata {
    tileWidth:
        number;

    tileHeight:
        number;

    columns:
        number;

    rows:
        number;

    generationSize:
        number;

    minimumHorizontalSeamScore:
        number;

    seamScores:
        number[];

    tileSeeds:
        number[];

    tileOrder:
        number[];

    interTileSeamScores:
        number[];

    minimumInterTileSeamScore:
        number;

    averageInterTileSeamScore:
        number;

    requiredMinimumInterTileSeamScore:
        number;

    atlasRepairCount:
        number;
}

export interface GeneratedAssetMetadata {
    origin:
        "generated";

    role:
        string;

    profile:
        AssetGenerationProfile;

    tags:
        string[];

    style:
        string;

    generator: {
        provider:
            string;

        model:
            string;

        configurationId?:
            string;

        prompt:
            string;

        negativePrompt:
            string;

        promptHash:
            string;

        seed:
            number;
    };

    image: {
        width:
            number;

        height:
            number;

        mimeType:
            string;

        transparent:
            boolean;
    };

    processing:
        GeneratedAssetProcessingMetadata;

    tileset?:
        GeneratedTilesetMetadata;
}

export interface GeneratedAsset {
    image:
        GeneratedImage;

    metadata:
        GeneratedAssetMetadata;
}