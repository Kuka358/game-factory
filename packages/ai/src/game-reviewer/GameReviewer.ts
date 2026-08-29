import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    AIError
} from "../AIError.js";

import type {
    AIProvider,
    AIUsage
} from "../AIProvider.js";

import type {
    PromptRegistry
} from "../prompts/PromptRegistry.js";

import type {
    GameDesignerPlatformConstraints,
    GameDesignerTemplate
} from "../game-designer/GameDesigner.js";

export interface GameReview {
    valid:
        boolean;

    warnings:
        string[];

    suggested_changes:
        string[];
}

export interface ReviewGameInput {
    spec:
        GameSpec;

    templates:
        readonly GameDesignerTemplate[];

    platform:
        GameDesignerPlatformConstraints;

    userPrompt?:
        string;
}

export interface GameReviewerMetadata {
    provider:
        string;

    model:
        string;

    promptId:
        string;

    promptVersion:
        string;

    usage?:
        AIUsage;
}

export interface ReviewGameResult {
    review:
        GameReview;

    metadata:
        GameReviewerMetadata;
}

export interface GameReviewerOptions {
    provider:
        AIProvider;

    model:
        string;

    promptRegistry:
        PromptRegistry;

    promptVersion?:
        string;

    temperature?:
        number;

    maxTokens?:
        number;

    maxAttempts?:
        number;
}

const GAME_REVIEW_SCHEMA:
    Record<string, unknown> = {
    type:
        "object",

    properties: {
        valid: {
            type:
                "boolean"
        },

        warnings: {
            type:
                "array",

            items: {
                type:
                    "string"
            }
        },

        suggested_changes: {
            type:
                "array",

            items: {
                type:
                    "string"
            }
        }
    },

    required: [
        "valid",
        "warnings",
        "suggested_changes"
    ],

    additionalProperties:
        false
};

export class GameReviewer {
    private readonly promptVersion:
        string;

    private readonly temperature:
        number;

    private readonly maxTokens:
        number;

    private readonly maxAttempts:
        number;

    constructor(
        private readonly options:
            GameReviewerOptions
    ) {
        this.promptVersion =
            options.promptVersion ??
            "v1";

        this.temperature =
            options.temperature ??
            0.1;

        this.maxTokens =
            options.maxTokens ??
            2000;

        this.maxAttempts =
            options.maxAttempts ??
            2;

        if (
            this.maxAttempts < 1
        ) {
            throw new Error(
                "GameReviewer maxAttempts must be at least 1"
            );
        }
    }

    async review(
        input:
            ReviewGameInput
    ): Promise<ReviewGameResult> {
        if (
            input.templates.length ===
            0
        ) {
            throw new Error(
                "GameReviewer requires at least one template"
            );
        }

        const prompt =
            await this.options
                .promptRegistry
                .get(
                    "game-reviewer",
                    this.promptVersion
                );

        const baseMessages =
            [
                {
                    role:
                        "system" as const,

                    content:
                        prompt.content
                },

                {
                    role:
                        "user" as const,

                    content:
                        createReviewInput(
                            input
                        )
                }
            ];

        let lastError =
            "Unknown reviewer output error";

        for (
            let attempt = 1;
            attempt <=
            this.maxAttempts;
            attempt += 1
        ) {
            const messages =
                attempt === 1
                    ? baseMessages
                    : [
                        ...baseMessages,

                        {
                            role:
                                "user" as const,

                            content:
                                createRepairMessage(
                                    lastError
                                )
                        }
                    ];

            const response =
                await this.options
                    .provider
                    .generate<unknown>({
                        model:
                            this.options.model,

                        temperature:
                            this.temperature,

                        maxTokens:
                            this.maxTokens,

                        messages,

                        structuredOutput: {
                            name:
                                "game_review",

                            schema:
                                GAME_REVIEW_SCHEMA
                        }
                    });

            const parsed =
                parseGameReview(
                    response.data
                );

            if (parsed.ok) {
                return {
                    review:
                        parsed.value,

                    metadata: {
                        provider:
                            response.provider,

                        model:
                            response.model,

                        promptId:
                            prompt.id,

                        promptVersion:
                            prompt.version,

                        usage:
                            response.usage
                    }
                };
            }

            lastError =
                parsed.error;
        }

        throw new AIError(
            "structured_output_failed",

            [
                `Game Reviewer failed to produce a valid structured review after ${this.maxAttempts} attempts.`,
                lastError
            ].join(
                "\n"
            ),

            this.options.provider.id
        );
    }
}

function createReviewInput(
    input:
        ReviewGameInput
): string {
    return JSON.stringify(
        {
            user_prompt:
                input.userPrompt ??
                null,

            game_spec:
                input.spec,

            template_catalog:
                input.templates,

            platform_constraints:
                input.platform
        },

        null,
        2
    );
}

function createRepairMessage(
    error:
        string
): string {
    return [
        "Your previous review did not match the required structured output.",
        "Return the complete review again.",
        "Do not explain anything outside the structured result.",
        "",
        `Problem: ${error}`
    ].join(
        "\n"
    );
}

interface ParseSuccess {
    ok:
        true;

    value:
        GameReview;
}

interface ParseFailure {
    ok:
        false;

    error:
        string;
}

type ParseResult =
    | ParseSuccess
    | ParseFailure;

function parseGameReview(
    value:
        unknown
): ParseResult {
    if (!isRecord(value)) {
        return {
            ok:
                false,

            error:
                "Game review must be an object"
        };
    }

    if (
        typeof value.valid !==
        "boolean"
    ) {
        return {
            ok:
                false,

            error:
                "Game review valid must be a boolean"
        };
    }

    const warnings =
        parseStringArray(
            value.warnings
        );

    if (!warnings.ok) {
        return {
            ok:
                false,

            error:
                `Game review warnings: ${warnings.error}`
        };
    }

    const suggestedChanges =
        parseStringArray(
            value.suggested_changes
        );

    if (
        !suggestedChanges.ok
    ) {
        return {
            ok:
                false,

            error:
                `Game review suggested_changes: ${suggestedChanges.error}`
        };
    }

    return {
        ok:
            true,

        value: {
            valid:
                value.valid,

            warnings:
                warnings.value,

            suggested_changes:
                suggestedChanges.value
        }
    };
}

function parseStringArray(
    value:
        unknown
):
    | {
        ok: true;
        value: string[];
    }
    | {
        ok: false;
        error: string;
    }
{
    if (
        !Array.isArray(value)
    ) {
        return {
            ok:
                false,

            error:
                "must be an array"
        };
    }

    if (
        !value.every(
            (item) =>
                typeof item ===
                "string"
        )
    ) {
        return {
            ok:
                false,

            error:
                "must contain only strings"
        };
    }

    return {
        ok:
            true,

        value:
            value.map(
                (item) =>
                    item.trim()
            )
            .filter(Boolean)
    };
}

function isRecord(
    value:
        unknown
): value is
    Record<string, unknown>
{
    return (
        typeof value ===
            "object" &&
        value !== null &&
        !Array.isArray(
            value
        )
    );
}