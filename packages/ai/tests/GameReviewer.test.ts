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
    GameReviewer
} from "../src/index.js";

import type {
    GameSpec
} from "@game-factory/game-spec";

class TestPromptRegistry
    implements PromptRegistry
{
    async get(
        id: string,
        version: string
    ): Promise<PromptDefinition> {
        return {
            id,
            version,
            content:
                "Review the GameSpec."
        };
    }
}

class ValidReviewProvider
    implements AIProvider
{
    readonly id =
        "test-reviewer";

    async generate<T>(
        request:
            AIRequest
    ): Promise<AIResponse<T>> {
        expect(
            request.structuredOutput
                ?.name
        ).toBe(
            "game_review"
        );

        return {
            data: {
                valid:
                    true,

                warnings: [
                    "Difficulty may increase quickly."
                ],

                suggested_changes: [
                    "Consider reducing speed increase."
                ]
            } as T,

            provider:
                this.id,

            model:
                request.model
        };
    }
}

const spec:
    GameSpec = {
    schema_version:
        "1.0",

    metadata: {
        title:
            "Dragon Escape",

        description:
            "A knight runs through a medieval landscape."
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
};

describe(
    "GameReviewer",
    () => {
        it(
            "reviews a valid GameSpec",
            async () => {
                const reviewer =
                    new GameReviewer({
                        provider:
                            new ValidReviewProvider(),

                        model:
                            "review-model",

                        promptRegistry:
                            new TestPromptRegistry()
                    });

                const result =
                    await reviewer.review({
                        spec,

                        userPrompt:
                            "Игра про рыцаря, который убегает от дракона",

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
                    result.review.valid
                ).toBe(
                    true
                );

                expect(
                    result.review.warnings
                ).toEqual([
                    "Difficulty may increase quickly."
                ]);

                expect(
                    result.metadata
                        .promptVersion
                ).toBe(
                    "v1"
                );

                expect(
                    result.metadata.provider
                ).toBe(
                    "test-reviewer"
                );
            }
        );

        it(
            "retries invalid structured review",
            async () => {
                const provider =
                    new RetryReviewProvider();

                const reviewer =
                    new GameReviewer({
                        provider,

                        model:
                            "review-model",

                        promptRegistry:
                            new TestPromptRegistry(),

                        maxAttempts:
                            2
                    });

                const result =
                    await reviewer.review({
                        spec,

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

                            keyboardInput:
                                true,

                            touchInput:
                                true
                        }
                    });

                expect(
                    provider.calls
                ).toBe(
                    2
                );

                expect(
                    result.review.valid
                ).toBe(
                    true
                );
            }
        );
    }
);

class RetryReviewProvider
    implements AIProvider
{
    readonly id =
        "retry-reviewer";

    calls =
        0;

    async generate<T>(
        request:
            AIRequest
    ): Promise<AIResponse<T>> {
        this.calls +=
            1;

        if (
            this.calls === 1
        ) {
            return {
                data: {
                    valid:
                        "yes",

                    warnings:
                        "none",

                    suggested_changes:
                        []
                } as T,

                provider:
                    this.id,

                model:
                    request.model
            };
        }

        return {
            data: {
                valid:
                    true,

                warnings:
                    [],

                suggested_changes:
                    []
            } as T,

            provider:
                this.id,

            model:
                request.model
        };
    }
}