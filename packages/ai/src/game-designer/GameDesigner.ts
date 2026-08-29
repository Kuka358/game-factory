import {
    gameSpecSchema,
    validateGameSpec,
    type GameSpec
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
    GameAssetProfile,
    GameAssetUiKind
} from "@game-factory/game-spec";


export interface GameDesignerAdditionalAssetCapability {
    /*
     * Exact runtime role understood by the template.
     *
     * Examples:
     * enemy
     * collectible
     * health_icon
     * level_tiles
     */
    role:
        string;

    profile:
        GameAssetProfile;

    description:
        string;

    required?:
        boolean;

    /*
     * Only meaningful for profile="ui".
     */
    uiKinds?:
        readonly GameAssetUiKind[];
}

export interface GameDesignerTemplate {
    id:
        string;

    version:
        string;

    genre:
        string;

    supportedModes:
        readonly string[];

    assetRoles:
        readonly string[];

    additionalAssetCapabilities?:
        readonly GameDesignerAdditionalAssetCapability[];
}

export interface GameDesignerGenerationSettings {
    engine:
        "phaser";

    mode:
        "template";

    seed:
        number;
}

export interface GameDesignerPlatformConstraints {
    platform:
        "browser";

    orientation?:
        "landscape" |
        "portrait";

    touchInput:
        boolean;

    keyboardInput:
        boolean;
}

export interface DesignGameInput {
    userPrompt:
        string;

    generation:
        GameDesignerGenerationSettings;

    templates:
        readonly GameDesignerTemplate[];

    platform:
        GameDesignerPlatformConstraints;
}

export interface GameDesignerMetadata {
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

export interface DesignGameResult {
    spec:
        GameSpec;

    metadata:
        GameDesignerMetadata;
}

export interface GameDesignerOptions {
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

export class GameDesigner {
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
            GameDesignerOptions
    ) {
        this.promptVersion =
            options.promptVersion ??
            "v1";

        this.temperature =
            options.temperature ??
            0.2;

        this.maxTokens =
            options.maxTokens ??
            4000;

        this.maxAttempts =
            options.maxAttempts ??
            3;

        if (
            this.maxAttempts < 1
        ) {
            throw new Error(
                "GameDesigner maxAttempts must be at least 1"
            );
        }
    }

    async design(
        input:
            DesignGameInput
    ): Promise<DesignGameResult> {
        const userPrompt =
            input.userPrompt.trim();

        if (!userPrompt) {
            throw new Error(
                "Game designer user prompt cannot be empty"
            );
        }

        if (
            input.templates.length ===
            0
        ) {
            throw new Error(
                "Game designer requires at least one template"
            );
        }

        const prompt =
            await this.options
                .promptRegistry
                .get(
                    "game-designer",
                    this.promptVersion
                );

        const messages =
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
                        createDesignerInput(
                            input
                        )
                }
            ];

        let validationErrors:
            readonly unknown[] = [];

        let previousOutput:
            unknown =
            undefined;

        for (
            let attempt = 1;
            attempt <=
            this.maxAttempts;
            attempt += 1
        ) {
            const attemptMessages =
                attempt === 1
                    ? messages
                    : [
                        ...messages,

                        {
                            role:
                                "assistant" as const,

                            content:
                                serializePreviousOutput(
                                    previousOutput
                                )
                        },

                        {
                            role:
                                "user" as const,

                            content:
                                createRepairMessage(
                                    validationErrors
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
                            attempt === 1
                                ? this.temperature
                                : 0,

                        maxTokens:
                            this.maxTokens,

                        messages:
                            attemptMessages,

                        structuredOutput: {
                            name:
                                "game_spec",

                            schema:
                                gameSpecSchema as
                                    Record<
                                        string,
                                        unknown
                                    >
                        }
                    });

            previousOutput =
                response.data;

            const validation =
                validateGameSpec(
                    response.data
                );

            if (
                validation.valid
            ) {
                return {
                    spec:
                        validation.data,

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

            validationErrors =
                validation.errors;
        }

        throw new AIError(
            "structured_output_failed",

            [
                `Game Designer failed to produce a valid GameSpec after ${this.maxAttempts} attempts.`,
                formatValidationErrors(
                    validationErrors
                )
            ].join(
                "\n"
            ),

            this.options.provider.id
        );
    }
}

function createDesignerInput(
    input:
        DesignGameInput
): string {
    return JSON.stringify(
        {
            user_prompt:
                input.userPrompt,

            generation_settings:
                input.generation,

            template_catalog:
                input.templates,

            platform_constraints:
                input.platform,

            output_contract: {
                description:
                    "The response MUST conform exactly to this GameSpec JSON Schema. Do not rename, move, add, or remove fields.",

                schema:
                    gameSpecSchema
            }
        },

        null,
        2
    );
}

function createRepairMessage(
    errors:
        readonly unknown[]
): string {
    return [
        "The GameSpec above is INVALID.",
        "",
        "Correct that exact GameSpec.",
        "",
        "Important:",
        "- Return the COMPLETE GameSpec, not a patch.",
        "- Preserve the required GameSpec field hierarchy.",
        "- Do not rename schema properties.",
        "- Do not move properties between objects.",
        "- Do not add properties that are absent from the schema.",
        "- Arrays must remain arrays.",
        "- Asset roles must be objects with a tags array.",
        "- generation must be a top-level object.",
        "- player.jump_force belongs inside player.movement.",
        "",
        "Schema validation errors:",
        formatValidationErrors(
            errors
        ),
        "",
        "Return only the corrected structured GameSpec."
    ].join(
        "\n"
    );
}

function formatValidationErrors(
    errors:
        readonly unknown[]
): string {
    if (
        errors.length === 0
    ) {
        return "Unknown validation error.";
    }

    return errors
        .map(
            (
                error,
                index
            ) =>
                `${index + 1}. ${formatValidationError(error)}`
        )
        .join(
            "\n"
        );
}

function formatValidationError(
    error:
        unknown
): string {
    if (
        typeof error ===
        "string"
    ) {
        return error;
    }

    if (
        error instanceof
        Error
    ) {
        return error.message;
    }

    try {
        return JSON.stringify(
            error
        );
    } catch {
        return String(
            error
        );
    }
}

function serializePreviousOutput(
    value:
        unknown
): string {
    try {
        return JSON.stringify(
            value,
            null,
            2
        );
    } catch {
        return String(
            value
        );
    }
}