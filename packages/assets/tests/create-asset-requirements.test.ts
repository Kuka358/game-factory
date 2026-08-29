import {
    describe,
    expect,
    it
} from "vitest";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    endlessRunnerTemplate
} from "@game-factory/templates";

import {
    createAssetRequirements,
    scoreCandidate,
    type AssetCandidate,
    type AssetRequirement
} from "../src/index.js";

describe(
    "createAssetRequirements",
    () => {
        it(
            "creates semantic asset requirements for endless runner",
            () => {
                const spec:
                    GameSpec = {
                    schema_version:
                        "1.0",

                    metadata: {
                        title:
                            "Dragon Escape",

                        description:
                            "A knight escapes through a dangerous medieval landscape."
                    },

                    generation: {
                        mode:
                            "template",

                        engine:
                            "phaser",

                        seed:
                            123
                    },

                    game: {
                        genre:
                            "endless_runner",

                        orientation:
                            "landscape"
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
                                    "castle",
                                    "landscape"
                                ]
                            }
                        }
                    },

                    controls: {
                        jump: [
                            "pointer"
                        ]
                    },

                    player: {
                        movement: {
                            jump_force:
                                580
                        }
                    },

                    runner: {
                        world_speed:
                            320,

                        obstacle_spawn_interval_ms:
                            1800,

                        speed_increase_per_second:
                            6.4
                    }
                };

                const requirements =
                    createAssetRequirements(
                        spec,
                        endlessRunnerTemplate
                            .manifest
                    );

                expect(
                    requirements.map(
                        (item) =>
                            item.role
                    )
                ).toEqual([
                    "player",
                    "obstacle",
                    "background"
                ]);

                const player =
                    requirements.find(
                        (requirement) =>
                            requirement.role ===
                            "player"
                    );

                expect(
                    player
                ).toEqual({
                    type:
                        "sprite",

                    role:
                        "player",

                    tags: [
                        "knight",
                        "medieval",
                        "pixel-art"
                    ],

                    requirements: {
                        transparent:
                            true,

                        dimensions: {
                            preferredWidth:
                                64,

                            preferredHeight:
                                64
                        },

                        animations: [
                            "idle",
                            "run",
                            "jump"
                        ],

                        orientation:
                            "right"
                    }
                });

                const obstacle =
                    requirements.find(
                        (requirement) =>
                            requirement.role ===
                            "obstacle"
                    );

                expect(
                    obstacle
                ).toEqual({
                    type:
                        "sprite",

                    role:
                        "obstacle",

                    tags: [
                        "spike",
                        "medieval",
                        "pixel-art"
                    ],

                    requirements: {
                        transparent:
                            true,

                        dimensions: {
                            preferredWidth:
                                64,

                            preferredHeight:
                                64
                        },

                        orientation:
                            "none"
                    }
                });

                const background =
                    requirements.find(
                        (requirement) =>
                            requirement.role ===
                            "background"
                    );

                expect(
                    background
                ).toEqual({
                    type:
                        "image",

                    role:
                        "background",

                    tags: [
                        "castle",
                        "landscape",
                        "medieval",
                        "pixel-art"
                    ],

                    requirements: {
                        dimensions: {
                            preferredWidth:
                                1280,

                            preferredHeight:
                                720
                        },

                        orientation:
                            "none"
                    }
                });
            }
        );

        it(
            "prefers candidate with required animations",
            () => {
                const requirement:
                    AssetRequirement = {
                    type:
                        "sprite",

                    role:
                        "player",

                    tags: [
                        "knight"
                    ],

                    requirements: {
                        animations: [
                            "idle",
                            "run",
                            "jump"
                        ]
                    }
                };

                const staticCandidate:
                    AssetCandidate = {
                    id:
                        "static",

                    score:
                        0.9,

                    tags: [],

                    animations: [],

                    sourceUrl:
                        "/static.png",

                    license: {
                        type:
                            "CC0"
                    }
                };

                const animatedCandidate:
                    AssetCandidate = {
                    id:
                        "animated",

                    score:
                        0.85,

                    tags: [],

                    animations: [
                        {
                            name:
                                "idle"
                        },
                        {
                            name:
                                "run"
                        },
                        {
                            name:
                                "jump"
                        }
                    ],

                    sourceUrl:
                        "/animated.png",

                    license: {
                        type:
                            "CC0"
                    }
                };

                expect(
                    scoreCandidate(
                        requirement,
                        animatedCandidate
                    )
                ).toBeGreaterThan(
                    scoreCandidate(
                        requirement,
                        staticCandidate
                    )
                );
            }
        );
    }
);