import {
    BuiltinAssetManager,
    ProviderAssetManager,
    type AssetManager,
    type AssetResolutionStrategy
} from "@game-factory/assets";

import {
    AssetGenerator,
    AssetProcessor,
    ComfyUIWorkflowRegistry,
    FileGeneratedAssetCache,
    GeneratedAssetManager,
    ProfiledComfyUIProvider,
    StrategicAssetManager
} from "@game-factory/asset-generator";

import type {
    AssetGenerationProfile
} from "@game-factory/assets";

import type {
    GameFactoryConfig
} from "@game-factory/config";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    HttpSpriteVaultClient,
    LocalSpriteVaultClient
} from "@game-factory/spritevault-client";


export function resolveAssetManager(
    config:
        GameFactoryConfig,

    spec:
        GameSpec
): AssetManager {
    const strategy =
        config.assetGeneration
            .strategy;

    /*
     * No explicit Stage-11 strategy:
     * preserve the exact old behaviour.
     */
    if (
        !strategy
    ) {
        return resolveLegacyAssetManager(
            config
        );
    }

    const spriteVault =
        resolveSpriteVaultAssetManager(
            config
        );

    const generated =
        resolveGeneratedAssetManager(
            config,
            spec
        );

    return new StrategicAssetManager({
        strategy:
            strategy as
                AssetResolutionStrategy,

        spriteVault,

        generated
    });
}


export function describeAssetResolution(
    config:
        GameFactoryConfig
): string {
    const strategy =
        config.assetGeneration
            .strategy;

    if (
        !strategy
    ) {
        return config
            .spriteVault
            .mode ===
            "disabled"
            ? "builtin"
            : `spritevault:${config.spriteVault.mode}`;
    }

    switch (
        strategy
    ) {
        case "generated_only":
            return `generated:${config.assetGeneration.provider}`;

        case "spritevault_only":
            return `spritevault:${config.spriteVault.mode}`;

        case "generated_first":
            return [
                `generated:${config.assetGeneration.provider}`,
                `spritevault:${config.spriteVault.mode}`
            ].join(
                " -> "
            );

        case "spritevault_first":
            return [
                `spritevault:${config.spriteVault.mode}`,
                `generated:${config.assetGeneration.provider}`
            ].join(
                " -> "
            );
    }
}


function resolveLegacyAssetManager(
    config:
        GameFactoryConfig
): AssetManager {
    const providerManager =
        resolveSpriteVaultAssetManager(
            config
        );

    if (
        providerManager
    ) {
        return providerManager;
    }

    return new BuiltinAssetManager();
}


function resolveSpriteVaultAssetManager(
    config:
        GameFactoryConfig
): AssetManager | undefined {
    const spriteVault =
        config.spriteVault;

    switch (
        spriteVault.mode
    ) {
        case "disabled":
            return undefined;

        case "http": {
            if (
                !spriteVault.baseUrl ||
                !spriteVault.searchPath
            ) {
                throw new Error(
                    "SpriteVault HTTP configuration is incomplete"
                );
            }

            const provider =
                new HttpSpriteVaultClient({
                    baseUrl:
                        spriteVault.baseUrl,

                    searchPath:
                        spriteVault.searchPath,

                    apiKey:
                        spriteVault.apiKey,

                    timeoutMs:
                        spriteVault.timeoutMs
                });

            return new ProviderAssetManager({
                provider,

                minimumScore:
                    spriteVault.minimumScore
            });
        }

        case "local": {
            if (
                !spriteVault.databasePath ||
                !spriteVault.rootPath
            ) {
                throw new Error(
                    "SpriteVault local configuration is incomplete"
                );
            }

            const provider =
                new LocalSpriteVaultClient({
                    databasePath:
                        spriteVault.databasePath,

                    rootPath:
                        spriteVault.rootPath
                });

            return new ProviderAssetManager({
                provider,

                minimumScore:
                    spriteVault.minimumScore
            });
        }
    }
}


function resolveGeneratedAssetManager(
    config:
        GameFactoryConfig,

    spec:
        GameSpec
): AssetManager | undefined {
    const generation =
        config.assetGeneration;

    if (
        generation.provider ===
        "disabled"
    ) {
        return undefined;
    }

    switch (
        generation.provider
    ) {
        case "comfyui": {
            const comfy =
                generation.comfyui;

            const model =
                comfy.model;

            if (
                !model
            ) {
                throw new Error(
                    "ComfyUI asset generation model is not configured"
                );
            }

            const fallbackWorkflowPath =
                comfy.workflowPath;

            const registry =
                new ComfyUIWorkflowRegistry({
                    workflows:
                        createProfileWorkflows(
                            comfy
                        ),

                    fallback:
                        fallbackWorkflowPath
                            ? {
                                profile:
                                    "character",

                                workflowPath:
                                    fallbackWorkflowPath,

                                model,

                                outputNodeId:
                                    comfy.outputNodeId,

                                timeoutMs:
                                    comfy.timeoutMs
                            }
                            : undefined
                });

            const provider =
                new ProfiledComfyUIProvider({
                    baseUrl:
                        comfy.baseUrl,

                    registry,

                    timeoutMs:
                        comfy.timeoutMs
                });

            const cache =
                new FileGeneratedAssetCache(
                    generation.cacheDir
                );

            const generator =
                new AssetGenerator(
                    provider,
                    {
                        processor:
                            new AssetProcessor(),

                        cache
                    }
                );

            return new GeneratedAssetManager({
                generator,

                style:
                    spec.assets.style,

                spriteGenerationSize:
                    generation
                        .spriteGenerationSize,

                format:
                    "png",

                writeMetadata:
                    true
            });
        }
    }
}

function createProfileWorkflows(
    comfy:
        GameFactoryConfig[
            "assetGeneration"
        ][
            "comfyui"
        ]
) {
    const model =
        comfy.model;

    if (
        !model
    ) {
        throw new Error(
            "ComfyUI model is not configured"
        );
    }

    const workflows:
        Array<{
            profile:
                AssetGenerationProfile;

            workflowPath:
                string;

            model:
                string;

            outputNodeId?:
                string;

            timeoutMs:
                number;
        }> = [];

    const add =
        (
            profile:
                AssetGenerationProfile,

            workflowPath:
                string | undefined,

            profileModel:
                string | undefined
        ) => {
            if (
                !workflowPath
            ) {
                return;
            }

            workflows.push({
                profile,

                workflowPath,

                model:
                    profileModel ??
                    model,

                outputNodeId:
                    comfy.outputNodeId,

                timeoutMs:
                    comfy.timeoutMs
            });
        };

    add(
        "character",
        comfy.characterWorkflowPath,
        comfy.characterModel
    );

    add(
        "npc",
        comfy.npcWorkflowPath,
        comfy.npcModel
    );

    add(
        "item",
        comfy.itemWorkflowPath,
        comfy.itemModel
    );

    add(
        "obstacle",
        comfy.obstacleWorkflowPath,
        comfy.obstacleModel
    );

    add(
        "background",
        comfy.backgroundWorkflowPath,
        comfy.backgroundModel
    );

    add(
        "ui",
        comfy.uiWorkflowPath,
        comfy.uiModel
    );

    add(
        "tileset",
        comfy.tilesetWorkflowPath,
        comfy.tilesetModel
    );

    return workflows;
}