import type {
    AIProviderMode,
    AssetResolutionStrategyConfig,
    GameFactoryConfig,
    ImageGeneratorMode,
    SpriteVaultMode
} from "./GameFactoryConfig.js";

export interface LoadGameFactoryConfigOptions {
    env?:
        NodeJS.ProcessEnv;
}

export function loadGameFactoryConfig(
    options:
        LoadGameFactoryConfigOptions = {}
): GameFactoryConfig {
    const env =
        options.env ??
        process.env;

    const spriteVaultMode =
        parseSpriteVaultMode(
            env
                .GAME_FACTORY_SPRITEVAULT_MODE
        );

    const minimumScore =
        parseNumber(
            env
                .GAME_FACTORY_SPRITEVAULT_MIN_SCORE,

            0.5,

            "GAME_FACTORY_SPRITEVAULT_MIN_SCORE"
        );

    if (
        minimumScore <
            0 ||
        minimumScore >
            1
    ) {
        throw new Error(
            "GAME_FACTORY_SPRITEVAULT_MIN_SCORE must be between 0 and 1"
        );
    }

    const spriteVaultTimeoutMs =
        parseInteger(
            env
                .GAME_FACTORY_SPRITEVAULT_TIMEOUT_MS,

            10_000,

            "GAME_FACTORY_SPRITEVAULT_TIMEOUT_MS"
        );

    if (
        spriteVaultTimeoutMs <=
        0
    ) {
        throw new Error(
            "GAME_FACTORY_SPRITEVAULT_TIMEOUT_MS must be greater than 0"
        );
    }

    const spriteVaultBaseUrl =
        normalizeOptionalString(
            env
                .GAME_FACTORY_SPRITEVAULT_URL
        );

    const spriteVaultSearchPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_SPRITEVAULT_SEARCH_PATH
        );

    const spriteVaultApiKey =
        normalizeOptionalString(
            env
                .GAME_FACTORY_SPRITEVAULT_API_KEY
        );

    const spriteVaultDatabasePath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_SPRITEVAULT_DB_PATH
        );

    const spriteVaultRootPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_SPRITEVAULT_ROOT_PATH
        );

    if (
        spriteVaultMode ===
        "http"
    ) {
        if (
            !spriteVaultBaseUrl
        ) {
            throw new Error(
                "GAME_FACTORY_SPRITEVAULT_URL is required when SpriteVault mode is http"
            );
        }

        if (
            !spriteVaultSearchPath
        ) {
            throw new Error(
                "GAME_FACTORY_SPRITEVAULT_SEARCH_PATH is required when SpriteVault mode is http"
            );
        }
    }

    if (
        spriteVaultMode ===
        "local"
    ) {
        if (
            !spriteVaultDatabasePath
        ) {
            throw new Error(
                "GAME_FACTORY_SPRITEVAULT_DB_PATH is required when SpriteVault mode is local"
            );
        }

        if (
            !spriteVaultRootPath
        ) {
            throw new Error(
                "GAME_FACTORY_SPRITEVAULT_ROOT_PATH is required when SpriteVault mode is local"
            );
        }
    }


    const aiProvider =
        parseAIProviderMode(
            env
                .GAME_FACTORY_AI_PROVIDER
        );

    const aiModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_AI_MODEL
        );

    const aiApiKey =
        normalizeOptionalString(
            env
                .GAME_FACTORY_AI_API_KEY
        );

    const aiBaseUrl =
        normalizeOptionalString(
            env
                .GAME_FACTORY_AI_BASE_URL
        );

    const aiSiteUrl =
        normalizeOptionalString(
            env
                .GAME_FACTORY_AI_SITE_URL
        );

    const aiAppName =
        normalizeOptionalString(
            env
                .GAME_FACTORY_AI_APP_NAME
        );

    const aiTimeoutMs =
        parseInteger(
            env
                .GAME_FACTORY_AI_TIMEOUT_MS,

            60_000,

            "GAME_FACTORY_AI_TIMEOUT_MS"
        );

    if (
        aiTimeoutMs <=
        0
    ) {
        throw new Error(
            "GAME_FACTORY_AI_TIMEOUT_MS must be greater than 0"
        );
    }

    if (
        aiProvider !==
            "disabled" &&
        !aiModel
    ) {
        throw new Error(
            "GAME_FACTORY_AI_MODEL is required when AI is enabled"
        );
    }

    if (
        aiProvider ===
            "openrouter" &&
        !aiApiKey
    ) {
        throw new Error(
            "GAME_FACTORY_AI_API_KEY is required for OpenRouter"
        );
    }

    if (
        aiProvider ===
            "openai-compatible" &&
        !aiBaseUrl
    ) {
        throw new Error(
            "GAME_FACTORY_AI_BASE_URL is required for openai-compatible provider"
        );
    }


    const assetStrategy =
        parseAssetResolutionStrategy(
            env
                .GAME_FACTORY_ASSET_STRATEGY
        );

    const imageProvider =
        parseImageGeneratorMode(
            env
                .GAME_FACTORY_IMAGE_PROVIDER
        );

    const generatedAssetCache =
        normalizeOptionalString(
            env
                .GAME_FACTORY_GENERATED_ASSET_CACHE
        ) ??
        ".game-factory/cache/generated-assets";

    const spriteGenerationSize =
        parseInteger(
            env
                .GAME_FACTORY_GENERATED_SPRITE_SIZE,

            512,

            "GAME_FACTORY_GENERATED_SPRITE_SIZE"
        );

    if (
        spriteGenerationSize <=
        0
    ) {
        throw new Error(
            "GAME_FACTORY_GENERATED_SPRITE_SIZE must be greater than 0"
        );
    }

    const comfyUrl =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_URL
        ) ??
        "http://127.0.0.1:8188";

    const comfyWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_WORKFLOW
        );

    const comfyCharacterWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_CHARACTER_WORKFLOW
        );

    const comfyNpcWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_NPC_WORKFLOW
        );

    const comfyItemWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_ITEM_WORKFLOW
        );

    const comfyObstacleWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_OBSTACLE_WORKFLOW
        );

    const comfyBackgroundWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_BACKGROUND_WORKFLOW
        );

    const comfyUiWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_UI_WORKFLOW
        );

    const comfyTilesetWorkflowPath =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_TILESET_WORKFLOW
        );

    const comfyModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_MODEL
        );
    
    const comfyCharacterModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_CHARACTER_MODEL
        );

    const comfyNpcModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_NPC_MODEL
        );

    const comfyItemModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_ITEM_MODEL
        );

    const comfyObstacleModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_OBSTACLE_MODEL
        );

    const comfyBackgroundModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_BACKGROUND_MODEL
        );

    const comfyUiModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_UI_MODEL
        );

    const comfyTilesetModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_TILESET_MODEL
        );

    const comfyOutputNode =
        normalizeOptionalString(
            env
                .GAME_FACTORY_COMFYUI_OUTPUT_NODE
        );

    const comfyTimeoutMs =
        parseInteger(
            env
                .GAME_FACTORY_COMFYUI_TIMEOUT_MS,

            300_000,

            "GAME_FACTORY_COMFYUI_TIMEOUT_MS"
        );

    const semanticValidationEnabled =
        parseBoolean(
            env
                .GAME_FACTORY_ASSET_SEMANTIC_VALIDATION,

            false,

            "GAME_FACTORY_ASSET_SEMANTIC_VALIDATION"
        );


    const semanticValidationModel =
        normalizeOptionalString(
            env
                .GAME_FACTORY_ASSET_SEMANTIC_MODEL
        ) ??
        aiModel;


    const semanticValidationMinimumScore =
        parseNumber(
            env
                .GAME_FACTORY_ASSET_SEMANTIC_MIN_SCORE,

            0.65,

            "GAME_FACTORY_ASSET_SEMANTIC_MIN_SCORE"
        );


    if (
        semanticValidationMinimumScore <
            0 ||
        semanticValidationMinimumScore >
            1
    ) {
        throw new Error(
            "GAME_FACTORY_ASSET_SEMANTIC_MIN_SCORE must be between 0 and 1"
        );
    }


    const semanticValidationFailOpen =
        parseBoolean(
            env
                .GAME_FACTORY_ASSET_SEMANTIC_FAIL_OPEN,

            true,

            "GAME_FACTORY_ASSET_SEMANTIC_FAIL_OPEN"
        );


    if (
        semanticValidationEnabled &&
        aiProvider ===
            "disabled"
    ) {
        throw new Error(
            "Asset semantic validation requires GAME_FACTORY_AI_PROVIDER"
        );
    }


    if (
        semanticValidationEnabled &&
        !semanticValidationModel
    ) {
        throw new Error(
            "GAME_FACTORY_ASSET_SEMANTIC_MODEL or GAME_FACTORY_AI_MODEL is required"
        );
    }

    if (
        comfyTimeoutMs <=
        0
    ) {
        throw new Error(
            "GAME_FACTORY_COMFYUI_TIMEOUT_MS must be greater than 0"
        );
    }

    if (
        imageProvider ===
        "comfyui"
    ) {
        const hasAnyWorkflow =
            Boolean(
                comfyWorkflowPath ||
                comfyCharacterWorkflowPath ||
                comfyNpcWorkflowPath ||
                comfyItemWorkflowPath ||
                comfyObstacleWorkflowPath ||
                comfyBackgroundWorkflowPath ||
                comfyUiWorkflowPath ||
                comfyTilesetWorkflowPath
            );

        if (
            !hasAnyWorkflow
        ) {
            throw new Error(
                [
                    "ComfyUI image generation requires at least one workflow.",
                    "Configure GAME_FACTORY_COMFYUI_WORKFLOW",
                    "or a profile-specific GAME_FACTORY_COMFYUI_*_WORKFLOW."
                ].join(
                    " "
                )
            );
        }

        if (
            !comfyModel
        ) {
            throw new Error(
                "GAME_FACTORY_COMFYUI_MODEL is required when image provider is comfyui"
            );
        }
    }

    if (
        strategyUsesGeneration(
            assetStrategy
        ) &&
        imageProvider ===
            "disabled"
    ) {
        throw new Error(
            [
                `Asset strategy "${assetStrategy}" requires image generation,`,
                "but GAME_FACTORY_IMAGE_PROVIDER is disabled"
            ].join(
                " "
            )
        );
    }

    return {
        spriteVault: {
            mode:
                spriteVaultMode,

            minimumScore,

            baseUrl:
                spriteVaultBaseUrl,

            searchPath:
                spriteVaultSearchPath,

            apiKey:
                spriteVaultApiKey,

            timeoutMs:
                spriteVaultTimeoutMs,

            databasePath:
                spriteVaultDatabasePath,

            rootPath:
                spriteVaultRootPath
        },

        ai: {
            provider:
                aiProvider,

            model:
                aiModel,

            apiKey:
                aiApiKey,

            baseUrl:
                aiBaseUrl,

            timeoutMs:
                aiTimeoutMs,

            siteUrl:
                aiSiteUrl,

            appName:
                aiAppName
        },

        assetGeneration: {
            strategy:
                assetStrategy,

            provider:
                imageProvider,

            cacheDir:
                generatedAssetCache,

            spriteGenerationSize,

            comfyui: {
                baseUrl:
                    comfyUrl,

                workflowPath:
                    comfyWorkflowPath,

                characterWorkflowPath:
                    comfyCharacterWorkflowPath,

                npcWorkflowPath:
                    comfyNpcWorkflowPath,

                itemWorkflowPath:
                    comfyItemWorkflowPath,

                obstacleWorkflowPath:
                    comfyObstacleWorkflowPath,

                backgroundWorkflowPath:
                    comfyBackgroundWorkflowPath,

                uiWorkflowPath:
                    comfyUiWorkflowPath,

                tilesetWorkflowPath:
                    comfyTilesetWorkflowPath,

                model:
                    comfyModel,

                characterModel:
                    comfyCharacterModel,

                npcModel:
                    comfyNpcModel,

                itemModel:
                    comfyItemModel,

                obstacleModel:
                    comfyObstacleModel,

                backgroundModel:
                    comfyBackgroundModel,

                uiModel:
                    comfyUiModel,

                tilesetModel:
                    comfyTilesetModel,

                outputNodeId:
                    comfyOutputNode,

                timeoutMs:
                    comfyTimeoutMs
            },

            semanticValidation: {
                enabled:
                    semanticValidationEnabled,

                model:
                    semanticValidationModel,

                minimumScore:
                    semanticValidationMinimumScore,

                failOpen:
                    semanticValidationFailOpen
            },
        }
    };
}


function parseSpriteVaultMode(
    value:
        string | undefined
): SpriteVaultMode {
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return "disabled";
    }

    const normalized =
        value
            .trim()
            .toLowerCase();

    switch (
        normalized
    ) {
        case "disabled":
        case "http":
        case "local":
            return normalized;

        default:
            throw new Error(
                `Invalid GAME_FACTORY_SPRITEVAULT_MODE: "${value}"`
            );
    }
}

function parseAIProviderMode(
    value:
        string | undefined
): AIProviderMode {
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return "disabled";
    }

    const normalized =
        value
            .trim()
            .toLowerCase();

    switch (
        normalized
    ) {
        case "disabled":
        case "openrouter":
        case "openai-compatible":
            return normalized;

        default:
            throw new Error(
                `Invalid GAME_FACTORY_AI_PROVIDER: "${value}"`
            );
    }
}

function parseAssetResolutionStrategy(
    value:
        string | undefined
):
    AssetResolutionStrategyConfig |
    undefined
{
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return undefined;
    }

    const normalized =
        value
            .trim()
            .toLowerCase();

    switch (
        normalized
    ) {
        case "spritevault_first":
        case "generated_first":
        case "generated_only":
        case "spritevault_only":
            return normalized;

        default:
            throw new Error(
                `Invalid GAME_FACTORY_ASSET_STRATEGY: "${value}"`
            );
    }
}

function parseImageGeneratorMode(
    value:
        string | undefined
): ImageGeneratorMode {
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return "disabled";
    }

    const normalized =
        value
            .trim()
            .toLowerCase();

    switch (
        normalized
    ) {
        case "disabled":
        case "comfyui":
            return normalized;

        default:
            throw new Error(
                `Invalid GAME_FACTORY_IMAGE_PROVIDER: "${value}"`
            );
    }
}

function strategyUsesGeneration(
    strategy:
        AssetResolutionStrategyConfig |
        undefined
): boolean {
    return (
        strategy ===
            "generated_only" ||
        strategy ===
            "generated_first" ||
        strategy ===
            "spritevault_first"
    );
}

function normalizeOptionalString(
    value:
        string | undefined
): string | undefined {
    const normalized =
        value?.trim();

    return normalized
        ? normalized
        : undefined;
}

function parseNumber(
    value:
        string | undefined,

    defaultValue:
        number,

    variableName:
        string
): number {
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return defaultValue;
    }

    const parsed =
        Number(
            value
        );

    if (
        !Number.isFinite(
            parsed
        )
    ) {
        throw new Error(
            `${variableName} must be a number`
        );
    }

    return parsed;
}

function parseInteger(
    value:
        string | undefined,

    defaultValue:
        number,

    variableName:
        string
): number {
    const parsed =
        parseNumber(
            value,
            defaultValue,
            variableName
        );

    if (
        !Number.isInteger(
            parsed
        )
    ) {
        throw new Error(
            `${variableName} must be an integer`
        );
    }

    return parsed;
}

function parseBoolean(
    value:
        string | undefined,

    defaultValue:
        boolean,

    variableName:
        string
): boolean {
    if (
        value ===
            undefined ||
        value.trim() ===
            ""
    ) {
        return defaultValue;
    }


    switch (
        value
            .trim()
            .toLowerCase()
    ) {
        case "1":
        case "true":
        case "yes":
        case "on":
            return true;

        case "0":
        case "false":
        case "no":
        case "off":
            return false;

        default:
            throw new Error(
                `${variableName} must be a boolean`
            );
    }
}