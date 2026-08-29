import {
    describe,
    expect,
    it
} from "vitest";

import type {
    AIProvider,
    AIRequest,
    AIResponse,
    PromptDefinition,
    PromptRegistry
} from "../src/index.js";

import {
    GameDesigner
} from "../src/index.js";

class TestPromptRegistry
    implements PromptRegistry
{
    async get():
        Promise<PromptDefinition>
    {
        return {
            id:
                "game-designer",

            version:
                "v1",

            content:
                "Generate a valid GameSpec."
        };
    }
}

class TestProvider
    implements AIProvider
{
    readonly id =
        "test";

    async generate<T>(
        request:
            AIRequest
    ): Promise<
        AIResponse<T>
    > {
        expect(
            request.structuredOutput
                ?.name
        ).toBe(
            "game_spec"
        );

        return {
            provider:
                this.id,

            model:
                request.model,

            data: {
                schema_version:
                    "1.0",

                metadata: {
                    title:
                        "Dragon Escape",

                    description:
                        "A knight escapes through a medieval landscape."
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
                        "keyboard_space",
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
                        6
                }
            } as T
        };
    }
}

describe(
    "GameDesigner",
    () => {
        it(
            "generates and validates GameSpec",
            async () => {
                const designer =
                    new GameDesigner({
                        provider:
                            new TestProvider(),

                        model:
                            "test-model",

                        promptRegistry:
                            new TestPromptRegistry()
                    });

                const result =
                    await designer.design({
                        userPrompt:
                            "Игра про рыцаря, который убегает от дракона",

                        generation: {
                            engine:
                                "phaser",

                            mode:
                                "template",

                            seed:
                                123
                        },

                        templates: [
                            {
                                id:
                                    "endless_runner",

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
                                ]
                            }
                        ],

                        platform: {
                            platform:
                                "browser",

                            orientation:
                                "landscape",

                            keyboardInput:
                                true,

                            touchInput:
                                true
                        }
                    });

                expect(
                    result.spec.metadata
                        .title
                ).toBe(
                    "Dragon Escape"
                );

                expect(
                    result.spec.generation
                        .seed
                ).toBe(
                    123
                );

                expect(
                    result.metadata
                        .promptVersion
                ).toBe(
                    "v1"
                );

                expect(
                    result.metadata.provider
                ).toBe(
                    "test"
                );
            }
        );
    }
);