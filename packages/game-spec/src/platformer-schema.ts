import type {
    JSONSchemaType
} from "ajv";

import type {
    PlatformerGameSpec
} from "./types.js";


export const platformerGameSpecSchema:
    JSONSchemaType<PlatformerGameSpec> = {
    type:
        "object",

    additionalProperties:
        false,

    required: [
        "schema_version",
        "metadata",
        "generation",
        "game",
        "assets",
        "controls",
        "player",
        "platformer"
    ],

    properties: {
        schema_version: {
            type:
                "string",

            const:
                "1.0"
        },

        metadata: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "title",
                "description"
            ],

            properties: {
                title: {
                    type:
                        "string",

                    minLength:
                        1,

                    maxLength:
                        100
                },

                description: {
                    type:
                        "string",

                    minLength:
                        1,

                    maxLength:
                        500
                }
            }
        },

        generation: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "mode",
                "engine",
                "seed"
            ],

            properties: {
                mode: {
                    type:
                        "string",

                    const:
                        "template"
                },

                engine: {
                    type:
                        "string",

                    const:
                        "phaser"
                },

                seed: {
                    type:
                        "integer",

                    minimum:
                        0
                }
            }
        },

        game: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "genre",
                "orientation"
            ],

            properties: {
                genre: {
                    type:
                        "string",

                    const:
                        "platformer"
                },

                orientation: {
                    type:
                        "string",

                    const:
                        "landscape"
                }
            }
        },

        controls: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "move_left",
                "move_right",
                "jump"
            ],

            properties: {
                move_left: {
                    type:
                        "array",

                    minItems:
                        1,

                    uniqueItems:
                        true,

                    items: {
                        type:
                            "string",

                        enum: [
                            "keyboard_a",
                            "keyboard_left"
                        ]
                    }
                },

                move_right: {
                    type:
                        "array",

                    minItems:
                        1,

                    uniqueItems:
                        true,

                    items: {
                        type:
                            "string",

                        enum: [
                            "keyboard_d",
                            "keyboard_right"
                        ]
                    }
                },

                jump: {
                    type:
                        "array",

                    minItems:
                        1,

                    uniqueItems:
                        true,

                    items: {
                        type:
                            "string",

                        enum: [
                            "keyboard_space",
                            "keyboard_up",
                            "pointer"
                        ]
                    }
                }
            }
        },

        player: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "movement"
            ],

            properties: {
                movement: {
                    type:
                        "object",

                    additionalProperties:
                        false,

                    required: [
                        "move_speed",
                        "jump_force"
                    ],

                    properties: {
                        move_speed: {
                            type:
                                "number",

                            exclusiveMinimum:
                                0,

                            maximum:
                                1000
                        },

                        jump_force: {
                            type:
                                "number",

                            exclusiveMinimum:
                                0,

                            maximum:
                                2000
                        }
                    }
                }
            }
        },

        platformer: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "level_length",
                "platform_gap_min",
                "platform_gap_max",
                "platform_width_min",
                "platform_width_max",
                "platform_height_variation",
                "enemy_density",
                "collectible_density"
            ],

            properties: {
                level_length: {
                    type:
                        "integer",

                    minimum:
                        2000,

                    maximum:
                        20000
                },

                platform_gap_min: {
                    type:
                        "integer",

                    minimum:
                        0,

                    maximum:
                        320
                },

                platform_gap_max: {
                    type:
                        "integer",

                    minimum:
                        0,

                    maximum:
                        480
                },

                platform_width_min: {
                    type:
                        "integer",

                    minimum:
                        64,

                    maximum:
                        640
                },

                platform_width_max: {
                    type:
                        "integer",

                    minimum:
                        64,

                    maximum:
                        1024
                },

                platform_height_variation: {
                    type:
                        "integer",

                    minimum:
                        0,

                    maximum:
                        320
                },

                enemy_density: {
                    type:
                        "number",

                    minimum:
                        0,

                    maximum:
                        1
                },

                hazard_density: {
                    type:
                        "number",

                    minimum:
                        0,

                    maximum:
                        1
                },

                collectible_density: {
                    type:
                        "number",

                    minimum:
                        0,

                    maximum:
                        1
                }
            }
        },

        assets: {
            type:
                "object",

            additionalProperties:
                false,

            required: [
                "style",
                "global_tags",
                "roles"
            ],

            properties: {
                style: {
                    type:
                        "string",

                    enum: [
                        "pixel-art",
                        "cartoon",
                        "vector"
                    ]
                },

                global_tags: {
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

                    maxItems:
                        10,

                    uniqueItems:
                        true
                },

                roles: {
                    type:
                        "object",

                    additionalProperties:
                        false,

                    required: [
                        "player",
                        "obstacle",
                        "background"
                    ],

                    properties: {
                        player:
                            assetRoleSchema(),

                        obstacle:
                            assetRoleSchema(),

                        background:
                            assetRoleSchema()
                    }
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

                                minItems:
                                    1,

                                maxItems:
                                    10,

                                uniqueItems:
                                    true,

                                items: {
                                    type:
                                        "string",

                                    minLength:
                                        1,

                                    maxLength:
                                        50
                                }
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
            }
        }
    }
};


function assetRoleSchema():
    JSONSchemaType<{
        tags:
            string[];
    }> {
    return {
        type:
            "object",

        additionalProperties:
            false,

        required: [
            "tags"
        ],

        properties: {
            tags: {
                type:
                    "array",

                minItems:
                    1,

                maxItems:
                    10,

                uniqueItems:
                    true,

                items: {
                    type:
                        "string",

                    minLength:
                        1,

                    maxLength:
                        50
                }
            }
        }
    };
}