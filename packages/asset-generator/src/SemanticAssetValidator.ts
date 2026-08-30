import type {
    AssetGenerationProfile
} from "@game-factory/assets";

import type {
    GeneratedAssetSemanticMetadata,
    GeneratedImage,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

import type {
    AssetValidationResult,
    GeneratedAssetValidator
} from "./SingleSubjectAssetValidator.js";


export interface AssetSemanticReviewer {
    review(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<GeneratedAssetSemanticMetadata>;
}


export interface SemanticAssetValidatorOptions {
    minimumScore?:
        number;

    profiles?:
        readonly AssetGenerationProfile[];

    failOpen?:
        boolean;
}


const DEFAULT_PROFILES:
    readonly AssetGenerationProfile[] = [
        "character",
        "npc",
        "item",
        "obstacle",
        "ui",
        "background"
    ];


export class SemanticAssetValidator
    implements GeneratedAssetValidator
{
    private readonly minimumScore:
        number;

    private readonly profiles:
        ReadonlySet<
            AssetGenerationProfile
        >;

    private readonly failOpen:
        boolean;


    constructor(
        private readonly reviewer:
            AssetSemanticReviewer,

        options:
            SemanticAssetValidatorOptions = {}
    ) {
        this.minimumScore =
            options.minimumScore ??
            0.65;


        this.profiles =
            new Set(
                options.profiles ??
                DEFAULT_PROFILES
            );


        this.failOpen =
            options.failOpen ??
            true;


        if (
            this.minimumScore <
                0 ||
            this.minimumScore >
                1
        ) {
            throw new Error(
                "Semantic validator minimumScore must be between 0 and 1"
            );
        }
    }


    async validate(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetValidationResult> {
        if (
            !this.profiles.has(
                request.profile
            )
        ) {
            return {
                valid:
                    true,

                issues:
                    []
            };
        }


        try {
            const review =
                await this.reviewer
                    .review(
                        image,
                        request
                    );


            const score =
                Math.max(
                    0,

                    Math.min(
                        1,
                        review.score
                    )
                );


            const normalizedReview = {
                ...review,
                score
            };


            console.log(
                [
                    "[asset-semantic]",
                    `role=${request.role}`,
                    `profile=${request.profile}`,
                    `score=${score.toFixed(2)}`,
                    `matches=${review.matches}`
                ].join(
                    " "
                )
            );


            if (
                review.matches &&
                score >=
                    this.minimumScore
            ) {
                return {
                    valid:
                        true,

                    issues:
                        [],

                    semanticReview:
                        normalizedReview
                };
            }


            return {
                valid:
                    false,

                semanticReview:
                    normalizedReview,

                issues: [
                    {
                        code:
                            "semantic_mismatch",

                        message:
                            [
                                `Semantic score ${score.toFixed(2)}`,
                                `is below required ${this.minimumScore.toFixed(2)}.`,
                                review.description,
                                review
                                    .missingOrWrongTags
                                    .length >
                                    0
                                    ? `Missing/wrong: ${review.missingOrWrongTags.join(", ")}`
                                    : ""
                            ]
                                .filter(
                                    Boolean
                                )
                                .join(
                                    " "
                                )
                    }
                ]
            };
        } catch (
            error
        ) {
            if (
                this.failOpen
            ) {
                console.warn(
                    [
                        "[asset-semantic]",
                        `validation unavailable for "${request.role}",`,
                        "accepting structural result:",
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            )
                    ].join(
                        " "
                    )
                );


                return {
                    valid:
                        true,

                    issues:
                        []
                };
            }


            throw new Error(
                `Semantic validation failed for "${request.role}"`,
                {
                    cause:
                        error
                }
            );
        }
    }
}