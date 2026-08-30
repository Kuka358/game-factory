import {
    describe,
    expect,
    it
} from "vitest";

import {
    validateGameSpec
} from "../src/validator.js";


function createPlatformerSpec() {
    return {
        schema_version:
            "1.0",

        metadata: {
            title:
                "Crystal Caverns",

            description:
                "A platform game through crystal caves"
        },

        generation: {
            mode:
                "template",

            engine:
                "phaser",

            seed:
                12345
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
                        "underground crystal cave"
                    ]
                }
            }
        }
    };
}


describe(
    "platformer GameSpec",
    () => {
        it(
            "accepts a valid platformer spec",
            () => {
                const result =
                    validateGameSpec(
                        createPlatformerSpec()
                    );


                expect(
                    result.valid
                ).toBe(
                    true
                );
            }
        );


        it(
            "requires platformer configuration",
            () => {
                const spec =
                    createPlatformerSpec();


                delete (
                    spec as {
                        platformer?:
                            unknown;
                    }
                ).platformer;


                const result =
                    validateGameSpec(
                        spec
                    );


                expect(
                    result.valid
                ).toBe(
                    false
                );


                if (
                    !result.valid
                ) {
                    expect(
                        result.errors
                    ).toContainEqual({
                        path:
                            "/platformer",

                        message:
                            "Required property is missing"
                    });
                }
            }
        );


        it(
            "rejects inverted platform gap range",
            () => {
                const spec =
                    createPlatformerSpec();


                spec.platformer
                    .platform_gap_min =
                    220;


                spec.platformer
                    .platform_gap_max =
                    100;


                const result =
                    validateGameSpec(
                        spec
                    );


                expect(
                    result.valid
                ).toBe(
                    false
                );


                if (
                    !result.valid
                ) {
                    expect(
                        result.errors
                    ).toContainEqual({
                        path:
                            "/platformer/platform_gap_min",

                        message:
                            "Must be less than or equal to platform_gap_max"
                    });
                }
            }
        );


        it(
            "rejects portrait platformer",
            () => {
                const spec =
                    createPlatformerSpec();


                (
                    spec.game as {
                        genre:
                            string;

                        orientation:
                            string;
                    }
                ).orientation =
                    "portrait";


                const result =
                    validateGameSpec(
                        spec
                    );


                expect(
                    result.valid
                ).toBe(
                    false
                );
            }
        );
    }
);