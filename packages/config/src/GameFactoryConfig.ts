export type SpriteVaultMode =
    | "disabled"
    | "http"
    | "local";

export interface SpriteVaultConfig {
    mode:
        SpriteVaultMode;

    minimumScore:
        number;

    baseUrl?:
        string;

    searchPath?:
        string;

    apiKey?:
        string;

    timeoutMs:
        number;

    databasePath?:
        string;

    rootPath?:
        string;
}


export type AIProviderMode =
    | "disabled"
    | "openrouter"
    | "openai-compatible";

export interface AIConfig {
    provider:
        AIProviderMode;

    model?:
        string;

    apiKey?:
        string;

    baseUrl?:
        string;

    timeoutMs:
        number;

    siteUrl?:
        string;

    appName?:
        string;
}


export type AssetResolutionStrategyConfig =
    | "spritevault_first"
    | "generated_first"
    | "generated_only"
    | "spritevault_only";

export type ImageGeneratorMode =
    | "disabled"
    | "comfyui";

export interface ComfyUIImageGeneratorConfig {
    baseUrl:
        string;

    /**
     * Universal fallback workflow.
     */
    workflowPath?:
        string;

    characterWorkflowPath?:
        string;

    npcWorkflowPath?:
        string;

    itemWorkflowPath?:
        string;

    obstacleWorkflowPath?:
        string;

    backgroundWorkflowPath?:
        string;

    uiWorkflowPath?:
        string;

    tilesetWorkflowPath?:
        string;

    model?:
        string;

    characterModel?:
        string;

    npcModel?:
        string;

    itemModel?:
        string;

    obstacleModel?:
        string;

    backgroundModel?:
        string;

    uiModel?:
        string;

    tilesetModel?:
        string;

    outputNodeId?:
        string;

    timeoutMs:
        number;
}

export interface AssetSemanticValidationConfig {
    enabled:
        boolean;

    model?:
        string;

    minimumScore:
        number;

    failOpen:
        boolean;
}

export interface AssetGenerationConfig {
    /**
     * Undefined means:
     * keep the legacy pre-Stage-11 behavior.
     */
    strategy?:
        AssetResolutionStrategyConfig;

    provider:
        ImageGeneratorMode;

    cacheDir:
        string;

    spriteGenerationSize:
        number;

    comfyui:
        ComfyUIImageGeneratorConfig;

    semanticValidation:
        AssetSemanticValidationConfig;
}


export interface GameFactoryConfig {
    spriteVault:
        SpriteVaultConfig;

    ai:
        AIConfig;

    assetGeneration:
        AssetGenerationConfig;
}