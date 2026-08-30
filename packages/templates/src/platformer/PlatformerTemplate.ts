import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    GameTemplate,
    TemplateManifest,
    TemplateSupportResult
} from "../Template.js";


const manifest:
    TemplateManifest = {
    id:
        "platformer",

    version:
        "1.0.0",

    genre:
        "platformer",

    supportedModes: [
        "template"
    ],

    /*
     * These three roles are part of the base GameSpec
     * asset contract and therefore exist for every
     * platformer.
     */
    assetRoles: [
        "player",
        "obstacle",
        "background"
    ],

    additionalAssetCapabilities: [
        {
            role:
                "enemy",

            profile:
                "npc",

            description:
                [
                    "Optional hostile NPC placed on platforms.",
                    "Use it when the requested platformer includes",
                    "monsters, guards, robots, creatures or other enemies.",
                    "Enemies act as gameplay hazards in the first platformer implementation."
                ].join(
                    " "
                ),

            required:
                false
        },

        {
            role:
                "collectible",

            profile:
                "item",

            description:
                [
                    "Optional collectible item distributed throughout the level.",
                    "Use it for coins, gems, stars, keys, food, energy, treasure",
                    "or similar objects that the player can collect for score."
                ].join(
                    " "
                ),

            required:
                false
        },

        {
            role:
                "goal",

            profile:
                "item",

            description:
                [
                    "Optional visual object representing the end of the level.",
                    "Examples include a flag, portal, exit door, beacon or treasure.",
                    "The runtime may fall back to a built-in goal marker",
                    "when this asset is not requested."
                ].join(
                    " "
                ),

            required:
                false
        },

        {
            role:
                "level_tiles",

            profile:
                "tileset",

            description:
                [
                    "Optional generated terrain material used to render platforms and ground.",
                    "Use it when the requested game explicitly describes",
                    "grass, stone, snow, sand, metal, alien terrain, cave rock",
                    "or another distinctive platform surface."
                ].join(
                    " "
                ),

            required:
                false
        },

        {
            role:
                "score_icon",

            profile:
                "ui",

            description:
                [
                    "Optional decorative icon displayed next to the score or collectible counter.",
                    "Use it when the requested game explicitly asks for",
                    "a themed HUD icon."
                ].join(
                    " "
                ),

            required:
                false,

            uiKinds: [
                "icon"
            ]
        }
    ]
};


export const platformerTemplate:
    GameTemplate = {
    manifest,

    supports(
        spec:
            GameSpec
    ): TemplateSupportResult {
        const reasons:
            string[] =
            [];


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
                reasons.length ===
                0,

            reasons
        };
    }
};