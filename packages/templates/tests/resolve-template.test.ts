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
    }
);