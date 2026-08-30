import {
    describe,
    expect,
    it
} from "vitest";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    resolveTemplate
} from "../src/index.js";

describe(
    "resolveTemplate",
    () => {
        it(
            "selects endless runner template",
            () => {
                const spec:
                    GameSpec = {
                    schema_version: "1.0",

                    metadata: {
                        title:
                            "Dragon Escape",

                        description:
                            "Knight escapes from a dragon"
                    },

                    generation: {
                        mode: "template",
                        engine: "phaser",
                        seed: 123
                    },

                    game: {
                        genre:
                            "endless_runner",

                        orientation:
                            "landscape"
                    },

                    controls: {
                        jump: [
                            "pointer"
                        ]
                    },

                    player: {
                        movement: {
                            jump_force: 580
                        }
                    },

                    assets: {
                        style:
                            "pixel-art",

                        global_tags: [
                            "medieval"
                        ],

                        roles: {
                            player: {
                                tags: [
                                    "knight"
                                ]
                            },

                            obstacle: {
                                tags: [
                                    "spike"
                                ]
                            },

                            background: {
                                tags: [
                                    "castle"
                                ]
                            }
                        }
                    },

                    runner: {
                        world_speed: 320,

                        obstacle_spawn_interval_ms:
                            1800,

                        speed_increase_per_second:
                            6.4
                    }
                };

                const template =
                    resolveTemplate(
                        spec
                    );

                expect(
                    template.manifest.id
                ).toBe(
                    "endless_runner"
                );

                expect(
                    template.manifest.version
                ).toBe(
                    "1.0.0"
                );
            }
        );

        it(
            "selects platformer template",
            () => {
                const spec:
                    GameSpec = {
                    schema_version:
                        "1.0",

                    metadata: {
                        title:
                            "Crystal Caverns",

                        description:
                            "Explore a dangerous crystal cave"
                    },

                    generation: {
                        mode:
                            "template",

                        engine:
                            "phaser",

                        seed:
                            456
                    },

                    game: {
                        genre:
                            "platformer",

                        orientation:
                            "landscape"
                    },

                    controls: {
                        move_left: [
                            "keyboard_a",
                            "keyboard_left"
                        ],

                        move_right: [
                            "keyboard_d",
                            "keyboard_right"
                        ],

                        jump: [
                            "keyboard_space"
                        ]
                    },

                    player: {
                        movement: {
                            move_speed:
                                280,

                            jump_force:
                                560
                        }
                    },

                    platformer: {
                        level_length:
                            6000,

                        platform_gap_min:
                            64,

                        platform_gap_max:
                            180,

                        platform_width_min:
                            160,

                        platform_width_max:
                            420,

                        platform_height_variation:
                            140,

                        enemy_density:
                            0.15,

                        collectible_density:
                            0.25
                    },

                    assets: {
                        style:
                            "pixel-art",

                        global_tags: [
                            "crystal cave"
                        ],

                        roles: {
                            player: {
                                tags: [
                                    "adventurer"
                                ]
                            },

                            obstacle: {
                                tags: [
                                    "crystal spikes"
                                ]
                            },

                            background: {
                                tags: [
                                    "underground crystal cavern"
                                ]
                            }
                        },

                        additional: [
                            {
                                role:
                                    "enemy",

                                profile:
                                    "npc",

                                tags: [
                                    "cave monster"
                                ]
                            },

                            {
                                role:
                                    "collectible",

                                profile:
                                    "item",

                                tags: [
                                    "blue crystal"
                                ]
                            },

                            {
                                role:
                                    "level_tiles",

                                profile:
                                    "tileset",

                                tags: [
                                    "dark cave stone"
                                ]
                            }
                        ]
                    }
                };


                const template =
                    resolveTemplate(
                        spec
                    );


                expect(
                    template.manifest.id
                ).toBe(
                    "platformer"
                );


                expect(
                    template.manifest.version
                ).toBe(
                    "1.0.0"
                );
            }
        );
    }
);