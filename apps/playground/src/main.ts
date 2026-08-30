import type { GameSpec } from "@game-factory/game-spec";
import { createPhaserGame } from "@game-factory/engine-phaser";
import type {
    AssetManifest
} from "@game-factory/assets";
import {
    BrowserMockPlatform
} from "@game-factory/platform-web";

const spec: GameSpec = {
    schema_version: "1.0",

    metadata: {
        title: "Dragon Escape",
        description: "Knight escapes from a dragon"
    },

    generation: {
        mode: "template",
        seed: 19283912,
        engine: "phaser"
    },

    game: {
        genre: "endless_runner",
        orientation: "landscape"
    },

    controls: {
        jump: [
            "keyboard_space",
            "pointer"
        ]
    },

    player: {
        movement: {
            jump_force: 780
        }
    },

    runner: {
        world_speed: 150,
        obstacle_spawn_interval_ms: 1800,
        speed_increase_per_second: 6.4
    },

    assets: {
        style:
            "pixel-art",

        global_tags: [
            "medieval",
            "fantasy"
        ],

        roles: {
            player: {
                tags: [
                    "knight"
                ]
            },

            obstacle: {
                tags: [
                    "rock",
                    "spikes"
                ]
            },

            background: {
                tags: [
                    "castle",
                    "forest"
                ]
            }
        }
    }
};

const assetManifest:
    AssetManifest = {
    assets: [
        {
            role:
                "player",

            gamePath:
                "assets/player.svg",

            source:
                "builtin",

            license: {
                type:
                    "internal"
            }
        },

        {
            role:
                "obstacle",

            gamePath:
                "assets/obstacle.svg",

            source:
                "builtin",

            license: {
                type:
                    "internal"
            }
        },

        {
            role:
                "background",

            gamePath:
                "assets/background.svg",

            source:
                "builtin",

            license: {
                type:
                    "internal"
            }
        }
    ]
};

const platform =
    new BrowserMockPlatform();


await platform.init();

createPhaserGame({
    spec,

    templateId:
        "endless_runner",

    assetManifest,

    parent:
        "game",

    platform
});