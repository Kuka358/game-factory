import Phaser from "phaser";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    createGameContext
} from "@game-factory/runtime";

import type {
    TemplateId
} from "@game-factory/templates";

import {
    installGameFactoryDebugBridge
} from "./debug/GameFactoryDebugBridge.js";

import {
    PhaserInputService
} from "./input/PhaserInputService.js";

import {
    createTemplateScene
} from "./templates/create-template-scene.js";

import type {
    AssetManifest
} from "@game-factory/assets";

import {
    PhaserAssetRegistry
} from "./assets/PhaserAssetRegistry.js";

import type {
    PlatformService
} from "@game-factory/platform-core";

import {
    ARCADE_GRAVITY_Y
} from "./physics.js";

export interface CreatePhaserGameOptions {
    spec: GameSpec;

    templateId:
        TemplateId;

    assetManifest:
        AssetManifest;

    parent:
        HTMLElement | string;

    platform:
        PlatformService;
}

export function createPhaserGame(
    options:
        CreatePhaserGameOptions
): Phaser.Game {
    const {
        spec,
        templateId,
        assetManifest,
        parent,
        platform
    } = options;

    const isPortrait =
        spec.game.orientation ===
        "portrait";

    const width =
        isPortrait
            ? 720
            : 1280;

    const height =
        isPortrait
            ? 1280
            : 720;

    const input =
        new PhaserInputService(
            spec.controls
        );

    const ctx =
        createGameContext({
            input,
            platform
        });

    const assets =
        new PhaserAssetRegistry(
            assetManifest
        );

    const scene =
        createTemplateScene(
            templateId,
            {
                spec,
                ctx,
                input,
                assets
            }
        );

    const config:
        Phaser.Types.Core.GameConfig = {

        type:
            Phaser.AUTO,

        width,
        height,

        parent,

        backgroundColor:
            "#222222",

        physics: {
            default: "arcade",

            arcade: {
                gravity: {
                    x: 0,
                    y: ARCADE_GRAVITY_Y
                },

                debug: true
            }
        },

        scene: [
            scene
        ]
    };

    const game =
        new Phaser.Game(
            config
        );

    installGameFactoryDebugBridge(
        game,
        ctx,
        input
    );

    return game;
}