import type {
    AIProvider
} from "@game-factory/ai";

import type {
    AssetSemanticReviewer,
    GeneratedAssetSemanticMetadata,
    GeneratedImage,
    NormalizedAssetGenerationRequest
} from "@game-factory/asset-generator";


interface SemanticReviewDto {
    matches:
        boolean;

    score:
        number;

    description:
        string;

    matchedTags:
        string[];

    missingOrWrongTags:
        string[];
}


const SEMANTIC_REVIEW_SCHEMA = {
    type:
        "object",

    properties: {
        matches: {
            type:
                "boolean"
        },

        score: {
            type:
                "number",

            minimum:
                0,

            maximum:
                1
        },

        description: {
            type:
                "string"
        },

        matchedTags: {
            type:
                "array",

            items: {
                type:
                    "string"
            }
        },

        missingOrWrongTags: {
            type:
                "array",

            items: {
                type:
                    "string"
            }
        }
    },

    required: [
        "matches",
        "score",
        "description",
        "matchedTags",
        "missingOrWrongTags"
    ],

    additionalProperties:
        false
} satisfies Record<
    string,
    unknown
>;


export class AIAssetSemanticReviewer
    implements AssetSemanticReviewer
{
    constructor(
        private readonly provider:
            AIProvider,

        private readonly model:
            string
    ) {}


    async review(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<GeneratedAssetSemanticMetadata> {
        const dataUrl =
            [
                `data:${image.mimeType};base64,`,
                Buffer.from(
                    image.bytes
                ).toString(
                    "base64"
                )
            ].join(
                ""
            );


        const response =
            await this.provider
                .generate<SemanticReviewDto>({
                    model:
                        this.model,

                    temperature:
                        0,

                    maxTokens:
                        500,

                    messages: [
                        {
                            role:
                                "system",

                            content:
                                [
                                    "You are a strict semantic QA classifier for generated 2D game assets.",
                                    "Judge whether the IMAGE visibly represents the requested semantic concepts.",
                                    "Do not judge artistic beauty, polish, exact pixel density, or whether you personally like the image.",
                                    "Focus on identity, object type, creature type, environment type, requested colors/materials, and major defining visual features.",
                                    "Minor decorative omissions should not cause failure.",
                                    "A generic or related but visibly different subject should receive a low score.",
                                    "score=1 means an unmistakable semantic match.",
                                    "score=0.75 means clearly correct with minor omissions.",
                                    "score=0.5 means ambiguous or overly generic.",
                                    "score=0.25 means mostly the wrong subject.",
                                    "score=0 means unrelated."
                                ].join(
                                    " "
                                )
                        },

                        {
                            role:
                                "user",

                            content: [
                                {
                                    type:
                                        "text",

                                    text:
                                        [
                                            `Profile: ${request.profile}`,
                                            `Role: ${request.role}`,
                                            `Style: ${request.style}`,
                                            `UI kind: ${request.uiKind ?? "none"}`,
                                            `Requested concepts: ${request.tags.join(", ")}`,
                                            "",
                                            "Review the supplied generated game asset against those requested concepts."
                                        ].join(
                                            "\n"
                                        )
                                },

                                {
                                    type:
                                        "image_url",

                                    image_url: {
                                        url:
                                            dataUrl
                                    }
                                }
                            ]
                        }
                    ],

                    structuredOutput: {
                        name:
                            "asset_semantic_review",

                        schema:
                            SEMANTIC_REVIEW_SCHEMA
                    }
                });


        return {
            provider:
                response.provider,

            model:
                response.model,

            matches:
                response.data
                    .matches,

            score:
                response.data
                    .score,

            description:
                response.data
                    .description,

            matchedTags:
                response.data
                    .matchedTags,

            missingOrWrongTags:
                response.data
                    .missingOrWrongTags
        };
    }
}