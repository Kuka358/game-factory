import type { JSONSchemaType } from "ajv";
import type { EndlessRunnerGameSpec } from "./types.js";

export const gameSpecSchema: JSONSchemaType<EndlessRunnerGameSpec> = {
    type: "object",
    additionalProperties: false,

    required: [
        "schema_version",
        "metadata",
        "generation",
        "game",
        "assets",
        "controls",
        "player",
        "runner"
    ],

    properties: {
        schema_version: {
            type: "string",
            const: "1.0"
        },

        metadata: {
            type: "object",
            additionalProperties: false,

            required: [
                "title",
                "description"
            ],

            properties: {
                title: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100
                },

                description: {
                    type: "string",
                    minLength: 1,
                    maxLength: 500
                }
            }
        },

        generation: {
            type: "object",

            properties: {
                mode: {
                    type: "string",
                    const: "template"
                },

                engine: {
                    type: "string",
                    const: "phaser"
                },

                seed: {
                    type: "integer",
                    minimum: 0
                }
            },

            required: [
                "mode",
                "engine",
                "seed"
            ],

            additionalProperties: false
        },

        game: {
            type: "object",
            additionalProperties: false,

            required: [
                "genre",
                "orientation"
            ],

            properties: {
                genre: {
                    type: "string",
                    const: "endless_runner"
                },

                orientation: {
                    type: "string",
                    enum: [
                        "landscape",
                        "portrait"
                    ]
                }
            }
        },

        controls: {
            type: "object",
            additionalProperties: false,

            required: [
                "jump"
            ],

            properties: {
                jump: {
                    type: "array",
                    minItems: 1,
                    uniqueItems: true,

                    items: {
                        type: "string",
                        enum: [
                            "keyboard_space",
                            "pointer"
                        ]
                    }
                }
            }
        },

        player: {
            type: "object",
            additionalProperties: false,

            required: [
                "movement"
            ],

            properties: {
                movement: {
                    type: "object",
                    additionalProperties: false,

                    required: [
                        "jump_force"
                    ],

                    properties: {
                        jump_force: {
                            type: "number",
                            exclusiveMinimum: 0
                        }
                    }
                }
            }
        },

        runner: {
            type: "object",
            additionalProperties: false,

            required: [
                "world_speed",
                "obstacle_spawn_interval_ms",
                "speed_increase_per_second"
            ],

            properties: {
                world_speed: {
                    type: "number",
                    exclusiveMinimum: 0
                },

                obstacle_spawn_interval_ms: {
                    type: "integer",
                    minimum: 100
                },

                speed_increase_per_second: {
                    type: "number",
                    minimum: 0
                }
            }
        },

        assets: {
            type: "object",

            properties: {
                style: {
                    type: "string",

                    enum: [
                        "pixel-art",
                        "cartoon",
                        "vector"
                    ]
                },

                global_tags: {
                    type: "array",

                    items: {
                        type: "string",
                        minLength: 1,
                        maxLength: 50
                    },

                    maxItems: 10,

                    uniqueItems: true
                },

                roles: {
                    type: "object",

                    properties: {
                        player: {
                            type: "object",

                            properties: {
                                tags: {
                                    type: "array",

                                    items: {
                                        type: "string",
                                        minLength: 1,
                                        maxLength: 50
                                    },

                                    minItems: 1,
                                    maxItems: 10,
                                    uniqueItems: true
                                }
                            },

                            required: [
                                "tags"
                            ],

                            additionalProperties:
                                false
                        },

                        obstacle: {
                            type: "object",

                            properties: {
                                tags: {
                                    type: "array",

                                    items: {
                                        type: "string",
                                        minLength: 1,
                                        maxLength: 50
                                    },

                                    minItems: 1,
                                    maxItems: 10,
                                    uniqueItems: true
                                }
                            },

                            required: [
                                "tags"
                            ],

                            additionalProperties:
                                false
                        },

                        background: {
                            type: "object",

                            properties: {
                                tags: {
                                    type: "array",

                                    items: {
                                        type: "string",
                                        minLength: 1,
                                        maxLength: 50
                                    },

                                    minItems: 1,
                                    maxItems: 10,
                                    uniqueItems: true
                                }
                            },

                            required: [
                                "tags"
                            ],

                            additionalProperties:
                                false
                        }
                    },

                    required: [
                        "player",
                        "obstacle",
                        "background"
                    ],

                    additionalProperties:
                        false
                },

                additional: {
                    type:
                        "array",

                    nullable:
                        true,

                    maxItems:
                        20,

                    items: {
                        type:
                            "object",

                        additionalProperties:
                            false,

                        required: [
                            "role",
                            "profile",
                            "tags"
                        ],

                        properties: {
                            role: {
                                type:
                                    "string",

                                minLength:
                                    1,

                                maxLength:
                                    50,

                                /*
                                * Keep roles safe for manifests,
                                * filenames and runtime lookup.
                                *
                                * enemy
                                * boss_1
                                * coin_icon
                                */
                                pattern:
                                    "^[a-z][a-z0-9_]*$"
                            },

                            profile: {
                                type:
                                    "string",

                                enum: [
                                    "character",
                                    "npc",
                                    "item",
                                    "obstacle",
                                    "background",
                                    "ui",
                                    "tileset"
                                ]
                            },

                            tags: {
                                type:
                                    "array",

                                items: {
                                    type:
                                        "string",

                                    minLength:
                                        1,

                                    maxLength:
                                        50
                                },

                                minItems:
                                    1,

                                maxItems:
                                    10,

                                uniqueItems:
                                    true
                            },

                            ui_kind: {
                                type:
                                    "string",

                                nullable:
                                    true,

                                enum: [
                                    "button",
                                    "panel",
                                    "icon",
                                    "frame",
                                    "bar"
                                ]
                            }
                        }
                    }
                }
            },

            required: [
                "style",
                "global_tags",
                "roles"
            ],

            additionalProperties:
                false
        },
    }
};