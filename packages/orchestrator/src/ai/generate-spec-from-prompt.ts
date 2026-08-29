import {
    randomInt
} from "node:crypto";

import {
    AIError,
    FilePromptRegistry,
    GameDesigner,
    GameReviewer,
    type AIProvider,
    type GameDesignerTemplate,
    type PromptRegistry
} from "@game-factory/ai";

import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    endlessRunnerTemplate
} from "@game-factory/templates";

import {
    validateTemplateAssetCapabilities
} from "./validate-template-asset-capabilities.js";


const MAX_DESIGN_REVIEW_ATTEMPTS =
    3;


export interface GenerateSpecFromPromptInput {
    prompt:
        string;

    provider:
        AIProvider;

    model:
        string;

    promptRegistry?:
        PromptRegistry;

    seed?:
        number;

    orientation?:
        "portrait" |
        "landscape";
}


export interface GenerateSpecFromPromptResult {
    spec:
        GameSpec;

    review: {
        valid:
            boolean;

        warnings:
            string[];

        suggested_changes:
            string[];
    };

    ai: {
        designer:
            Awaited<
                ReturnType<
                    GameDesigner["design"]
                >
            >["metadata"];

        reviewer:
            Awaited<
                ReturnType<
                    GameReviewer["review"]
                >
            >["metadata"];
    };
}


type DesignResult =
    Awaited<
        ReturnType<
            GameDesigner["design"]
        >
    >;


type ReviewResult =
    Awaited<
        ReturnType<
            GameReviewer["review"]
        >
    >;


type Review =
    ReviewResult["review"];


export async function generateSpecFromPrompt(
    input:
        GenerateSpecFromPromptInput
): Promise<GenerateSpecFromPromptResult> {
    const prompt =
        input.prompt.trim();

    if (
        !prompt
    ) {
        throw new Error(
            "Generation prompt cannot be empty"
        );
    }

    const seed =
        input.seed ??
        randomInt(
            1,
            2_147_483_647
        );

    const promptRegistry =
        input.promptRegistry ??
        new FilePromptRegistry();

    const templates =
        createTemplateCatalog();

    const platform = {
        platform:
            "browser" as const,

        keyboardInput:
            true,

        touchInput:
            true
    };

    const designer =
        new GameDesigner({
            provider:
                input.provider,

            model:
                input.model,

            promptRegistry
        });

    const reviewer =
        new GameReviewer({
            provider:
                input.provider,

            model:
                input.model,

            promptRegistry
        });

    let designerPrompt =
        prompt;

    let finalDesign:
        DesignResult | undefined;

    let finalSpec:
        GameSpec | undefined;

    let finalReview:
        ReviewResult | undefined;


    /*
     * Designer -> Reviewer -> optional repair.
     *
     * A rejected but structurally valid GameSpec is sent
     * back to Designer together with Reviewer feedback.
     *
     * Expensive asset generation starts only after the
     * specification passes review.
     */
    for (
        let attempt = 1;
        attempt <=
        MAX_DESIGN_REVIEW_ATTEMPTS;
        attempt += 1
    ) {
        const design =
            await designer.design({
                userPrompt:
                    designerPrompt,

                generation: {
                    engine:
                        "phaser",

                    mode:
                        "template",

                    seed
                },

                templates,

                platform
            });

        validateGenerationSettings(
            design.spec,
            seed,
            input.provider.id
        );

        const spec =
            applyOrientationOverride(
                design.spec,
                input.orientation
            );

        const capabilityValidation =
            validateTemplateAssetCapabilities(
                spec,
                templates
            );

        if (
            !capabilityValidation.valid
        ) {
            if (
                attempt >=
                MAX_DESIGN_REVIEW_ATTEMPTS
            ) {
                throw new AIError(
                    "review_failed",

                    createCapabilityFailureMessage(
                        capabilityValidation.errors,
                        MAX_DESIGN_REVIEW_ATTEMPTS
                    ),

                    input.provider.id
                );
            }

            console.warn(
                [
                    "[ai]",
                    "GameSpec violates template asset capabilities.",
                    `Repairing specification (${attempt}/${MAX_DESIGN_REVIEW_ATTEMPTS - 1})...`
                ].join(
                    " "
                )
            );

            designerPrompt =
                createRepairPrompt({
                    originalPrompt:
                        prompt,

                    spec,

                    review: {
                        valid:
                            false,

                        warnings:
                            [],

                        suggested_changes:
                            capabilityValidation.errors
                    },

                    repairAttempt:
                        attempt
                });

            continue;
        }

        const reviewed =
            await reviewer.review({
                spec,

                /*
                 * Reviewer always evaluates the resulting
                 * GameSpec against the original user intent.
                 *
                 * Internal repair instructions are not used
                 * as the user prompt here.
                 */
                userPrompt:
                    prompt,

                templates,

                platform
            });

        finalDesign =
            design;

        finalSpec =
            spec;

        finalReview =
            reviewed;

        if (
            reviewed.review.valid
        ) {
            break;
        }

        if (
            attempt >=
            MAX_DESIGN_REVIEW_ATTEMPTS
        ) {
            break;
        }

        console.warn(
            [
                "[ai]",
                "Game Reviewer rejected GameSpec.",
                `Repairing specification (${attempt}/${MAX_DESIGN_REVIEW_ATTEMPTS - 1})...`
            ].join(
                " "
            )
        );

        designerPrompt =
            createRepairPrompt({
                originalPrompt:
                    prompt,

                spec,

                review:
                    reviewed.review,

                repairAttempt:
                    attempt
            });
    }


    if (
        !finalDesign ||
        !finalSpec ||
        !finalReview
    ) {
        throw new AIError(
            "structured_output_failed",

            "Game design pipeline did not produce a result",

            input.provider.id
        );
    }


    if (
        !finalReview.review.valid
    ) {
        throw new AIError(
            "review_failed",

            createReviewFailureMessage(
                finalReview.review,
                MAX_DESIGN_REVIEW_ATTEMPTS
            ),

            input.provider.id
        );
    }


    return {
        spec:
            finalSpec,

        review:
            finalReview.review,

        ai: {
            /*
             * If a repair happened, metadata belongs to the
             * final Designer and Reviewer calls.
             */
            designer:
                finalDesign.metadata,

            reviewer:
                finalReview.metadata
        }
    };
}


function applyOrientationOverride(
    spec:
        GameSpec,

    orientation:
        GenerateSpecFromPromptInput[
            "orientation"
        ]
): GameSpec {
    if (
        orientation ===
        undefined
    ) {
        return spec;
    }

    return {
        ...spec,

        game: {
            ...spec.game,

            orientation
        }
    };
}


function validateGenerationSettings(
    spec:
        GameSpec,

    expectedSeed:
        number,

    providerId:
        string
): void {
    /*
     * Generation settings are controlled by Game Factory,
     * not by the language model.
     */
    if (
        spec.generation.seed !==
        expectedSeed
    ) {
        throw new AIError(
            "structured_output_failed",

            [
                "Game Designer returned an incorrect generation seed.",
                `Expected: ${expectedSeed}`,
                `Received: ${spec.generation.seed}`
            ].join(
                "\n"
            ),

            providerId
        );
    }

    if (
        spec.generation.engine !==
            "phaser" ||
        spec.generation.mode !==
            "template"
    ) {
        throw new AIError(
            "structured_output_failed",

            "Game Designer returned unsupported generation settings",

            providerId
        );
    }
}


interface CreateRepairPromptInput {
    originalPrompt:
        string;

    spec:
        GameSpec;

    review:
        Review;

    repairAttempt:
        number;
}


function createRepairPrompt(
    input:
        CreateRepairPromptInput
): string {
    const warnings =
        input.review
            .warnings
            .length >
        0
            ? input.review
                .warnings
                .map(
                    (warning) =>
                        `- ${warning}`
                )
                .join(
                    "\n"
                )
            : "- No warnings were supplied.";

    const suggestedChanges =
        input.review
            .suggested_changes
            .length >
        0
            ? input.review
                .suggested_changes
                .map(
                    (change) =>
                        `- ${change}`
                )
                .join(
                    "\n"
                )
            : "- Fix the blocking problems identified by the reviewer.";

    return [
        input.originalPrompt,

        "",

        "--- GAME FACTORY REPAIR REQUEST ---",

        "",

        `Repair attempt: ${input.repairAttempt}`,

        "",

        "A previous GameSpec was syntactically valid but was rejected by the Game Reviewer.",

        "",

        "Preserve the original game concept, visual theme, template-compatible mechanics, and asset intent.",

        "",

        "Change only what is necessary to resolve blocking contradictions or unplayable values.",

        "",

        "Do not add mechanics unsupported by the supplied template.",

        "",

        "Do not invent asset roles unsupported by the selected template.",

        "",

        "If the selected template has no additionalAssetCapabilities, do not add assets.additional entries.",

        "",

        "If assets.additional is used, every role and profile must exactly match a capability supplied by the selected template.",

        "",

        "Do not change the required generation engine, generation mode, or generation seed.",

        "",

        "Quality suggestions that are not required for playability may be applied conservatively.",

        "",

        "Reviewer warnings:",

        warnings,

        "",

        "Reviewer suggested changes:",

        suggestedChanges,

        "",

        "Previous validated GameSpec:",

        JSON.stringify(
            input.spec,
            null,
            2
        ),

        "",

        "Return a complete corrected GameSpec."
    ].join(
        "\n"
    );
}


function createTemplateCatalog():
    GameDesignerTemplate[]
{
    const manifest =
        endlessRunnerTemplate
            .manifest;

    return [
        {
            id:
                manifest.id,

            version:
                manifest.version,

            genre:
                manifest.genre,

            supportedModes: [
                ...manifest
                    .supportedModes
            ],

            assetRoles: [
                ...manifest
                    .assetRoles
            ],

            additionalAssetCapabilities:
                (
                    manifest
                        .additionalAssetCapabilities ??
                    []
                ).map(
                    (capability) => ({
                        role:
                            capability.role,

                        profile:
                            capability.profile,

                        description:
                            capability.description,

                        required:
                            capability.required,

                        uiKinds:
                            capability.uiKinds
                                ? [
                                    ...capability.uiKinds
                                ]
                                : undefined
                    })
                )
        }
    ];
}


function createReviewFailureMessage(
    review: {
        warnings:
            readonly string[];

        suggested_changes:
            readonly string[];
    },

    attempts:
        number
): string {
    const lines = [
        `Game Reviewer rejected the generated GameSpec after ${attempts} design/review attempts.`
    ];

    if (
        review.warnings.length >
        0
    ) {
        lines.push(
            "",
            "Warnings:",
            ...review.warnings.map(
                (warning) =>
                    `- ${warning}`
            )
        );
    }

    if (
        review
            .suggested_changes
            .length >
        0
    ) {
        lines.push(
            "",
            "Suggested changes:",
            ...review
                .suggested_changes
                .map(
                    (change) =>
                        `- ${change}`
                )
        );
    }

    return lines.join(
        "\n"
    );
}

function createCapabilityFailureMessage(
    errors:
        readonly string[],

    attempts:
        number
): string {
    return [
        `GameSpec still violates template asset capabilities after ${attempts} design attempts.`,
        "",
        "Capability errors:",
        ...errors.map(
            (error) =>
                `- ${error}`
        )
    ].join(
        "\n"
    );
}

function createDesignerTemplate(
    manifest:
        typeof endlessRunnerTemplate.manifest
): GameDesignerTemplate {
    return {
        id:
            manifest.id,

        version:
            manifest.version,

        genre:
            manifest.genre,

        supportedModes: [
            ...manifest
                .supportedModes
        ],

        assetRoles: [
            ...manifest
                .assetRoles
        ],

        additionalAssetCapabilities:
            (
                manifest
                    .additionalAssetCapabilities ??
                []
            ).map(
                (capability) => ({
                    role:
                        capability.role,

                    profile:
                        capability.profile,

                    description:
                        capability.description,

                    required:
                        capability.required,

                    uiKinds:
                        capability.uiKinds
                            ? [
                                ...capability.uiKinds
                            ]
                            : undefined
                })
            )
    };
}