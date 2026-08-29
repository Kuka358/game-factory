import type {
    AssetManager,
    AssetManifestEntry,
    AssetResolutionResult,
    AssetResolutionStrategy,
    AssetSourceKind,
    ResolveAssetsInput
} from "@game-factory/assets";

import {
    getAssetResolutionOrder
} from "@game-factory/assets";

export interface StrategicAssetManagerOptions {
    strategy:
        AssetResolutionStrategy;

    spriteVault?:
        AssetManager;

    generated?:
        AssetManager;
}

export class StrategicAssetManager
    implements AssetManager
{
    private readonly strategy:
        AssetResolutionStrategy;

    private readonly spriteVault?:
        AssetManager;

    private readonly generated?:
        AssetManager;

    constructor(
        options:
            StrategicAssetManagerOptions
    ) {
        this.strategy =
            options.strategy;

        this.spriteVault =
            options.spriteVault;

        this.generated =
            options.generated;
    }

    async resolve(
        input:
            ResolveAssetsInput
    ): Promise<AssetResolutionResult> {
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
            ResolveAssetsInput[
                "requirements"
            ][number],

        assetsDir:
            string
    ): Promise<AssetManifestEntry> {
        const order =
            getAssetResolutionOrder(
                this.strategy
            );

        const failures:
            string[] = [];

        for (
            const source of
            order
        ) {
            const manager =
                this.getManager(
                    source
                );

            if (
                !manager
            ) {
                failures.push(
                    `${source}: source is not configured`
                );

                continue;
            }

            try {
                const result =
                    await manager.resolve({
                        requirements: [
                            requirement
                        ],

                        assetsDir
                    });

                const entry =
                    result.manifest
                        .assets[0];

                if (
                    !entry
                ) {
                    throw new Error(
                        "asset manager returned no manifest entry"
                    );
                }

                return entry;
            } catch (
                error
            ) {
                failures.push(
                    `${source}: ${getErrorMessage(
                        error
                    )}`
                );

                if (
                    order.length >
                    1
                ) {
                    console.warn(
                        [
                            `[assets] ${source} failed for role`,
                            `"${requirement.role}",`,
                            "trying fallback"
                        ].join(
                            " "
                        )
                    );
                }
            }
        }

        throw new Error(
            [
                `Unable to resolve asset for role "${requirement.role}".`,
                ...failures.map(
                    (
                        failure
                    ) =>
                        `- ${failure}`
                )
            ].join(
                "\n"
            )
        );
    }

    private getManager(
        source:
            AssetSourceKind
    ): AssetManager | undefined {
        switch (
            source
        ) {
            case "spritevault":
                return this.spriteVault;

            case "generated":
                return this.generated;
        }
    }
}

function getErrorMessage(
    error:
        unknown
): string {
    if (
        error instanceof
        Error
    ) {
        return error.message;
    }

    return String(
        error
    );
}