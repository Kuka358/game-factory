import {
    describe,
    expect,
    it
} from "vitest";

import type {
    GameDesignerTemplate
} from "@game-factory/ai";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    validateTemplateAssetCapabilities
} from "../src/ai/validate-template-asset-capabilities.js";


const template:
    GameDesignerTemplate = {
    id:
        "test_runner",

    version:
        "1.0.0",

    genre:
        "endless_runner",

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
                "Collectible item"
        },

        {
            role:
                "enemy",

            profile:
                "npc",

            description:
                "Enemy character"
        },

        {
            role:
                "score_icon",

            profile:
                "ui",

            description:
                "Score icon",

            uiKinds: [
                "icon"
            ]
        }
    ]
};


function createSpec():
    GameSpec
{
    return {
        schema_version:
            "1.0",

        metadata: {
            title:
                "Test",

            description:
                "Test game"
        },

        generation: {
            mode:
                "template",

            engine:
                "phaser",

            seed:
                1
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

            global_tags:
                [],

            roles: {
                player: {
                    tags: [
                        "hero"
                    ]
                },

                obstacle: {
                    tags: [
                        "rock"
                    ]
                },

                background: {
                    tags: [
                        "forest"
                    ]
                }
            }
        },

        controls: {
            jump: [
                "keyboard_space"
            ]
        },

        player: {
            movement: {
                jump_force:
                    500
            }
        },

        runner: {
            world_speed:
                200,

            obstacle_spawn_interval_ms:
                1500,

            speed_increase_per_second:
                5
        }
    };
}


describe(
    "validateTemplateAssetCapabilities",
    () => {
        it(
            "accepts supported additional asset",
            () => {
                const spec =
                    createSpec();

                spec.assets.additional = [
                    {
                        role:
                            "collectible",

                        profile:
                            "item",

                        tags: [
                            "gold coin"
                        ]
                    }
                ];

                const result =
                    validateTemplateAssetCapabilities(
                        spec,
                        [
                            template
                        ]
                    );

                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );


        it(
            "rejects unsupported role",
            () => {
                const spec =
                    createSpec();

                spec.assets.additional = [
                    {
                        role:
                            "coin",

                        profile:
                            "item",

                        tags: [
                            "gold coin"
                        ]
                    }
                ];

                const result =
                    validateTemplateAssetCapabilities(
                        spec,
                        [
                            template
                        ]
                    );

                expect(
                    result.valid
                ).toBe(
                    false
                );

                expect(
                    result.errors.some(
                        (error) =>
                            error.includes(
                                "coin"
                            )
                    )
                ).toBe(
                    true
                );
            }
        );


        it(
            "rejects incorrect profile",
            () => {
                const spec =
                    createSpec();

                spec.assets.additional = [
                    {
                        role:
                            "enemy",

                        profile:
                            "item",

                        tags: [
                            "monster"
                        ]
                    }
                ];

                const result =
                    validateTemplateAssetCapabilities(
                        spec,
                        [
                            template
                        ]
                    );

                expect(
                    result.valid
                ).toBe(
                    false
                );
            }
        );


        it(
            "validates UI kind",
            () => {
                const spec =
                    createSpec();

                spec.assets.additional = [
                    {
                        role:
                            "score_icon",

                        profile:
                            "ui",

                        ui_kind:
                            "icon",

                        tags: [
                            "gold star"
                        ]
                    }
                ];

                const result =
                    validateTemplateAssetCapabilities(
                        spec,
                        [
                            template
                        ]
                    );

                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );
    }
);