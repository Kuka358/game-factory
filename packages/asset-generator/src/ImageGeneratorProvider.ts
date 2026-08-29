import type {
    AssetGenerationProfile
} from "@game-factory/assets";

import type {
    GeneratedAssetFormat,
    GeneratedImage
} from "./AssetGenerationTypes.js";

export interface ImageGeneratorRequest {
    profile:
        AssetGenerationProfile;

    prompt:
        string;

    negativePrompt?:
        string;

    width:
        number;

    height:
        number;

    format:
        GeneratedAssetFormat;

    seed?:
        number;
}

export interface ImageGeneratorIdentity {
    provider:
        string;

    model:
        string;

    /**
     * Distinguishes different workflows/configurations
     * using the same provider and model.
     *
     * Important for persistent cache invalidation.
     */
    configurationId?:
        string;
}

export interface ImageGeneratorProvider {
    readonly id:
        string;

    /**
     * Legacy/default model identifier.
     *
     * Profiled providers may return the actual model
     * through getIdentity().
     */
    readonly model:
        string;

    getIdentity?(
        request:
            ImageGeneratorRequest
    ): ImageGeneratorIdentity;

    generate(
        request:
            ImageGeneratorRequest
    ): Promise<GeneratedImage>;
}