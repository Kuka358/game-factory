import type Phaser from "phaser";

import type {
    AssetManifest,
    AssetManifestEntry
} from "@game-factory/assets";

export class PhaserAssetRegistry {
    constructor(
        private readonly manifest:
            AssetManifest
    ) {}

    preload(
        scene: Phaser.Scene
    ): void {
        for (
            const asset of
            this.manifest.assets
        ) {
            if (!asset.gamePath) {
                continue;
            }

            const key =
                this.getTextureKey(
                    asset.role
                );

            // При scene.restart() preload вызывается снова.
            // Уже загруженную texture повторно не ставим в очередь.
            if (
                scene.textures.exists(
                    key
                )
            ) {
                continue;
            }

            this.loadAsset(
                scene,
                key,
                asset
            );
        }
    }

    getTextureKey(
        role: string
    ): string {
        const asset =
            this.getRequired(
                role
            );

        return createTextureKey(
            asset.role
        );
    }

    has(
        role: string
    ): boolean {
        return this.manifest.assets.some(
            (asset) =>
                asset.role === role &&
                Boolean(
                    asset.gamePath
                )
        );
    }

    private getRequired(
        role: string
    ): AssetManifestEntry {
        const asset =
            this.manifest.assets.find(
                (candidate) =>
                    candidate.role ===
                    role
            );

        if (
            !asset ||
            !asset.gamePath
        ) {
            throw new Error(
                `Required Phaser asset is missing: ${role}`
            );
        }

        return asset;
    }

    private loadAsset(
        scene: Phaser.Scene,
        key: string,
        asset:
            AssetManifestEntry
    ): void {
        const extension =
            getExtension(
                asset.gamePath
            );

        const url =
            asset.gamePath;

        if (extension === ".svg") {
            scene.load.svg(
                key,
                url
            );

            return;
        }

        scene.load.image(
            key,
            url
        );
    }
}

function createTextureKey(
    role: string
): string {
    return `game-factory.asset.${role}`;
}

function getExtension(
    value: string
): string {
    const clean =
        value
            .split("?")[0]!
            .split("#")[0]!;

    const dot =
        clean.lastIndexOf(
            "."
        );

    return dot >= 0
        ? clean
              .slice(dot)
              .toLowerCase()
        : "";
}