import {
    fileURLToPath
} from "node:url";

import {
    build as viteBuild
} from "vite";

import type {
    EngineBuildContext
} from "@game-factory/engine-core";

export async function buildPhaserProject(
    context: EngineBuildContext
): Promise<void> {
    const {
        projectDir,
        buildDir
    } = context;

    const enginePhaserEntry =
        fileURLToPath(
            new URL(
                "../index.js",
                import.meta.url
            )
        );

    const platformWebEntry =
        fileURLToPath(
            new URL(
                "../../../platform-web/dist/index.js",
                import.meta.url
            )
        );

    const platformYandexEntry =
        fileURLToPath(
            new URL(
                "../../../platform-yandex/dist/index.js",
                import.meta.url
            )
        );

    await viteBuild({
        configFile: false,

        root:
            projectDir,

        base:
            "./",

        publicDir:
            "public",

        resolve: {
            alias: {
                "@game-factory/engine-phaser":
                    enginePhaserEntry,

                "@game-factory/platform-web":
                    platformWebEntry,

                "@game-factory/platform-yandex":
                    platformYandexEntry
            }
        },

        build: {
            outDir:
                buildDir,

            emptyOutDir:
                true,

            sourcemap:
                true
        }
    });
}