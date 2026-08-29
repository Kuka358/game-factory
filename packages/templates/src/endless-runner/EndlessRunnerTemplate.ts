import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    GameTemplate,
    TemplateManifest,
    TemplateSupportResult
} from "../Template.js";

const manifest: TemplateManifest = {
    id: "endless_runner",

    version: "1.0.0",

    genre: "endless_runner",

    supportedModes: [
        "template"
    ],


    assetRoles: [
        "player",
        "obstacle",
        "background"
    ],

    additionalAssetCapabilities: [
        {
            role:
                "collectible",

            profile:
                "item",

            description:
                [
                    "Optional collectible object spawned during gameplay.",
                    "The player can pick it up to gain score.",
                    "Use it when the requested game involves collecting",
                    "coins, gems, stars, food, fuel, treasure or similar items."
                ].join(
                    " "
                ),

            required:
                false,
        },

        {
            role:
                "enemy",

            profile:
                "npc",

            description:
                [
                    "Optional enemy NPC used as a moving hazard.",
                    "The enemy replaces some normal obstacles during gameplay.",
                    "Collision with the enemy causes game over.",
                    "Use it when the requested game explicitly involves",
                    "enemies, monsters, guards, bandits, robots or similar hostile characters."
                ].join(
                    " "
                ),

            required:
                false
        }
    ]
};

export const endlessRunnerTemplate:
    GameTemplate = {

    manifest,

    supports(
        spec: GameSpec
    ): TemplateSupportResult {
        const reasons: string[] = [];

        if (
            spec.game.genre !==
            manifest.genre
        ) {
            reasons.push(
                `Unsupported genre: ${spec.game.genre}`
            );
        }

        if (
            !manifest.supportedModes.includes(
                spec.generation.mode
            )
        ) {
            reasons.push(
                `Unsupported generation mode: ${spec.generation.mode}`
            );
        }

        return {
            supported:
                reasons.length === 0,

            reasons
        };
    }
};