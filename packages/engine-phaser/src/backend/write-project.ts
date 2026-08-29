import fs from "node:fs/promises";
import path from "node:path";

import type { GameSpec } from "@game-factory/game-spec";

import type {
    TemplateId
} from "@game-factory/templates";

import type {
    EngineBuildContext
} from "@game-factory/engine-core";

import type {
    AssetManifest
} from "@game-factory/assets";


export async function writePhaserProject(
    context:
        EngineBuildContext
): Promise<void> {
    const {
        spec,
        template,
        assetManifest,
        assetsDir,
        projectDir
    } = context;

    const srcDir =
        path.join(
            projectDir,
            "src"
        );

    const publicDir =
        path.join(
            projectDir,
            "public"
        );

    const publicAssetsDir =
        path.join(
            publicDir,
            "assets"
        );

    await fs.rm(
        projectDir,
        {
            recursive: true,
            force: true
        }
    );

    await fs.mkdir(
        srcDir,
        {
            recursive: true
        }
    );

    await fs.mkdir(
        publicAssetsDir,
        {
            recursive: true
        }
    );

    await fs.cp(
        assetsDir,
        publicAssetsDir,
        {
            recursive: true
        }
    );

    await Promise.all([
        fs.writeFile(
            path.join(
                projectDir,
                "index.html"
            ),
            createIndexHtml(),
            "utf8"
        ),

        fs.writeFile(
            path.join(
                srcDir,
                "game-spec.ts"
            ),
            createGameSpecModule(
                spec
            ),
            "utf8"
        ),

        fs.writeFile(
            path.join(
                srcDir,
                "main.ts"
            ),
            createMainModule(
                template.id
            ),
            "utf8"
        ),

        fs.writeFile(
            path.join(
                srcDir,
                "asset-manifest.ts"
            ),

            createAssetManifestModule(
                assetManifest
            ),

            "utf8"
        )
    ]);
}

function createIndexHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    />

    <title>Game Factory Game</title>

    <style>
        html,
        body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #111;
        }

        #game {
            width: 100%;
            height: 100%;
        }

        canvas {
            display: block;
            margin: 0 auto;
        }
    </style>

    <link rel="icon" href="data:," />
</head>

<body>
    <div id="game"></div>

    <script
        type="module"
        src="/src/main.ts"
    ></script>
</body>
</html>
`;
}

function createMainModule(
    templateId:
        TemplateId
): string {
    return `import { createPhaserGame } from "@game-factory/engine-phaser";
import { BrowserMockPlatform } from "@game-factory/platform-web";
import { YandexPlatform } from "@game-factory/platform-yandex";

import { gameSpec } from "./game-spec.js";
import { assetManifest } from "./asset-manifest.js";

type GameFactoryPlatformTarget =
    | "browser"
    | "yandex";

interface GameFactoryGlobal {
    __GAME_FACTORY_PLATFORM__?:
        GameFactoryPlatformTarget;
}

async function bootstrap(): Promise<void> {
    const globalValue =
        globalThis as typeof globalThis &
            GameFactoryGlobal;

    const target =
        globalValue
            .__GAME_FACTORY_PLATFORM__ ??
        "browser";

    const platform =
        target === "yandex"
            ? new YandexPlatform()
            : new BrowserMockPlatform();

    await platform.init();

    createPhaserGame({
        spec: gameSpec,
        templateId: ${JSON.stringify(templateId)},
        assetManifest,
        platform,
        parent: "game"
    });
}

void bootstrap().catch(
    (error: unknown) => {
        console.error(
            "[bootstrap] failed",
            error
        );
    }
);
`;
}

function createGameSpecModule(
    spec: GameSpec
): string {
    return `import type { GameSpec } from "@game-factory/game-spec";

export const gameSpec: GameSpec =
${JSON.stringify(spec, null, 4)};
`;
}

function createAssetManifestModule(
    manifest:
        AssetManifest
): string {
    return `import type { AssetManifest } from "@game-factory/assets";

export const assetManifest: AssetManifest =
${JSON.stringify(manifest, null, 4)};
`;
}