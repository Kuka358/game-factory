import type Phaser from "phaser";

import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    GameContext
} from "@game-factory/runtime";

import type {
    TemplateId
} from "@game-factory/templates";

import type {
    PhaserInputService
} from "../input/PhaserInputService.js";

import {
    EndlessRunnerScene
} from "./endless-runner/EndlessRunnerScene.js";

import type {
    PhaserAssetRegistry
} from "../assets/PhaserAssetRegistry.js";

interface PhaserTemplateDependencies {
    spec: GameSpec;

    ctx:
        GameContext;

    input:
        PhaserInputService;

    assets:
        PhaserAssetRegistry;
}

type PhaserTemplateFactory = (
    dependencies:
        PhaserTemplateDependencies
) => Phaser.Scene;

const templateFactories:
    Record<
        TemplateId,
        PhaserTemplateFactory
    > = {
        endless_runner:
            ({
                spec,
                ctx,
                input,
                assets
            }) =>
                new EndlessRunnerScene(
                    spec,
                    ctx,
                    input,
                    assets
                )
    };

export function createTemplateScene(
    templateId: TemplateId,
    dependencies:
        PhaserTemplateDependencies
): Phaser.Scene {
    const factory =
        templateFactories[
            templateId
        ];

    if (!factory) {
        throw new Error(
            `Phaser implementation not found for template: ${templateId}`
        );
    }

    return factory(
        dependencies
    );
}