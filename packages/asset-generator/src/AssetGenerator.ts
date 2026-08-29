import {
    createHash
} from "node:crypto";

import {
    AssetProcessor,

    type GeneratedAssetProcessor
} from "./AssetProcessor.js";

import {
    createGeneratedAssetCacheKey,

    type GeneratedAssetCache
} from "./GeneratedAssetCache.js";

import {
    buildAssetGenerationPrompt
} from "./AssetPromptBuilder.js";

import type {
    AssetGenerationPrompt,
    AssetGenerationRequest,
    GeneratedAsset,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

import type {
    ImageGeneratorIdentity,
    ImageGeneratorProvider,
    ImageGeneratorRequest
} from "./ImageGeneratorProvider.js";

import {
    applyAssetGenerationProfilePolicy,
    reinforcePromptAfterValidationFailure
} from "./AssetGenerationPromptPolicy.js";

import {
    SingleSubjectAssetValidator,

    type AssetValidationIssue,
    type GeneratedAssetValidator
} from "./SingleSubjectAssetValidator.js";


export interface AssetGeneratorOptions {
    processor?:
        GeneratedAssetProcessor;

    cache?:
        GeneratedAssetCache;

    validator?:
        GeneratedAssetValidator;

    maxAttempts?:
        number;
}


interface AssetGenerationAttemptResult {
    asset:
        GeneratedAsset;

    cacheKey:
        string;

    fromCache:
        boolean;
}


export class AssetGenerator {
    private readonly processor:
        GeneratedAssetProcessor;

    private readonly cache?:
        GeneratedAssetCache;

    private readonly validator:
        GeneratedAssetValidator;

    private readonly maxAttempts:
        number;


    constructor(
        private readonly provider:
            ImageGeneratorProvider,

        options:
            AssetGeneratorOptions = {}
    ) {
        this.processor =
            options.processor ??
            new AssetProcessor();

        this.cache =
            options.cache;

        this.validator =
            options.validator ??
            new SingleSubjectAssetValidator();

        this.maxAttempts =
            options.maxAttempts ??
            3;

        if (
            this.maxAttempts <
            1
        ) {
            throw new Error(
                "AssetGenerator maxAttempts must be at least 1"
            );
        }
    }


    async generate(
        request:
            AssetGenerationRequest
    ): Promise<GeneratedAsset> {
        validateGenerationRequest(
            request
        );

        /*
         * First build the normal semantic prompt.
         *
         * We derive the deterministic base seed from this
         * version so the same generation request remains
         * reproducible.
         */
        const initialPrompt =
            buildAssetGenerationPrompt(
                request
            );

        const initialPromptHash =
            createPromptHash(
                initialPrompt.positive,
                initialPrompt.negative
            );

        const normalizedRequest:
            NormalizedAssetGenerationRequest = {
            ...request,

            format:
                request.format ??
                "png",

            seed:
                request.seed ??
                deriveSeed(
                    initialPromptHash
                )
        };

        /*
         * Add profile-specific rules such as:
         *
         * character:
         * - exactly one character
         * - no sprite sheet
         * - no multiple poses
         *
         * item:
         * - exactly one isolated item
         *
         * background:
         * - complete environment scene
         */
        const basePrompt =
            applyAssetGenerationProfilePolicy(
                initialPrompt,
                normalizedRequest
            );

        let previousIssues:
            AssetValidationIssue[] =
            [];

        for (
            let attempt = 1;
            attempt <=
            this.maxAttempts;
            attempt += 1
        ) {
            /*
             * Retry uses a different deterministic seed.
             *
             * This prevents retry from simply reproducing
             * the same broken image.
             */
            const attemptRequest:
                NormalizedAssetGenerationRequest =
                attempt ===
                    1
                    ? normalizedRequest
                    : {
                        ...normalizedRequest,

                        seed:
                            deriveRetrySeed(
                                normalizedRequest.seed,
                                attempt
                            )
                    };

            /*
             * First attempt uses normal profile prompt.
             *
             * Later attempts receive stronger corrective
             * instructions based on validation failures.
             */
            const attemptPrompt =
                attempt ===
                    1
                    ? basePrompt
                    : reinforcePromptAfterValidationFailure(
                        basePrompt,
                        attemptRequest,
                        previousIssues,
                        attempt
                    );

            let generated:
                AssetGenerationAttemptResult;

            try {
                generated =
                    await this.generateAttempt(
                        attemptRequest,
                        attemptPrompt
                    );
            } catch (
                error
            ) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        );

                console.warn(
                    [
                        `[asset-generator] processing failed for "${normalizedRequest.role}"`,
                        `profile=${normalizedRequest.profile}`,
                        `attempt=${attempt}`,
                        message
                    ].join(
                        " "
                    )
                );

                if (
                    attempt <
                    this.maxAttempts
                ) {
                    console.warn(
                        [
                            `[asset-generator] retrying "${normalizedRequest.role}"`,
                            `with seed=${deriveRetrySeed(
                                normalizedRequest.seed,
                                attempt + 1
                            )}`
                        ].join(
                            " "
                        )
                    );

                    continue;
                }

                throw new Error(
                    [
                        `Generated asset "${normalizedRequest.role}" failed processing after ${this.maxAttempts} attempts.`,
                        message
                    ].join(
                        "\n"
                    ),
                    {
                        cause:
                            error
                    }
                );
            }

            /*
             * Cached assets are intentionally validated too.
             *
             * This protects us from an older cache entry
             * created before single-subject validation
             * existed.
             */
            const validation =
                await this.validator
                    .validate(
                        generated.asset.image,
                        attemptRequest
                    );

            if (
                validation.valid
            ) {
                /*
                 * Only valid generated images are persisted.
                 *
                 * A sprite sheet rejected by the validator
                 * must never enter the persistent cache.
                 */
                if (
                    !generated.fromCache &&
                    this.cache
                ) {
                    await this.cache.put(
                        generated.cacheKey,
                        generated.asset
                    );
                }

                return generated.asset;
            }

            previousIssues =
                validation.issues;

            console.warn(
                [
                    `[asset-generator] validation failed for "${normalizedRequest.role}"`,
                    `profile=${normalizedRequest.profile}`,
                    `attempt=${attempt}`,
                    validation.issues
                        .map(
                            (issue) =>
                                issue.code
                        )
                        .join(
                            ", "
                        )
                ].join(
                    " "
                )
            );

            if (
                attempt <
                this.maxAttempts
            ) {
                console.warn(
                    [
                        `[asset-generator] retrying "${normalizedRequest.role}"`,
                        `with seed=${deriveRetrySeed(
                            normalizedRequest.seed,
                            attempt + 1
                        )}`
                    ].join(
                        " "
                    )
                );
            }
        }

        throw new Error(
            [
                `Generated asset "${normalizedRequest.role}" failed validation after ${this.maxAttempts} attempts.`,

                ...previousIssues.map(
                    (issue) =>
                        `- ${issue.code}: ${issue.message}`
                )
            ].join(
                "\n"
            )
        );
    }


    private async generateAttempt(
        request:
            NormalizedAssetGenerationRequest,

        prompt:
            AssetGenerationPrompt
    ): Promise<AssetGenerationAttemptResult> {
        /*
         * Hash the ACTUAL prompt used for this attempt.
         *
         * Retry prompts therefore produce separate cache
         * entries from the original prompt.
         */
        const promptHash =
            createPromptHash(
                prompt.positive,
                prompt.negative
            );

        const providerRequest:
            ImageGeneratorRequest = {
            profile:
                request.profile,

            prompt:
                prompt.positive,

            negativePrompt:
                prompt.negative,

            width:
                request.width,

            height:
                request.height,

            format:
                request.format,

            seed:
                request.seed
        };

        const providerIdentity =
            resolveProviderIdentity(
                this.provider,
                providerRequest
            );

        const cacheKey =
            createGeneratedAssetCacheKey({
                provider:
                    providerIdentity.provider,

                model:
                    providerIdentity.model,

                ...(
                    providerIdentity
                        .configurationId
                        ? {
                            providerConfiguration:
                                providerIdentity
                                    .configurationId
                        }
                        : {}
                ),

                promptHash,

                seed:
                    request.seed,

                kind:
                    request.kind,

                width:
                    request.width,

                height:
                    request.height,

                transparent:
                    request.transparent,

                format:
                    request.format,

                processor:
                    this.processor
                        .cacheSignature
            });

        /*
         * Cache lookup happens before ComfyUI.
         *
         * Validation still happens in generate(), so even a
         * stale invalid cache entry cannot silently pass.
         */
        if (
            this.cache
        ) {
            const cached =
                await this.cache.get(
                    cacheKey
                );

            if (
                cached
            ) {
                return {
                    asset:
                        cached,

                    cacheKey,

                    fromCache:
                        true
                };
            }
        }

        const rawImage =
            await this.provider
                .generate(
                    providerRequest
                );

        if (
            rawImage.bytes
                .byteLength ===
            0
        ) {
            throw new Error(
                `Image generator returned an empty image for role "${request.role}"`
            );
        }

        const processed =
            await this.processor
                .process(
                    rawImage,
                    request
                );

        const asset:
            GeneratedAsset = {
            image:
                processed.image,

            metadata: {
                origin:
                    "generated",

                role:
                    request.role,

                profile:
                    request.profile,

                tags: [
                    ...request.tags
                ],

                style:
                    request.style,

                generator: {
                    provider:
                        providerIdentity.provider,

                    model:
                        providerIdentity.model,

                    ...(
                        providerIdentity
                            .configurationId
                            ? {
                                configurationId:
                                    providerIdentity
                                        .configurationId
                            }
                            : {}
                    ),

                    prompt:
                        prompt.positive,

                    negativePrompt:
                        prompt.negative,

                    promptHash,

                    seed:
                        request.seed
                },

                image: {
                    width:
                        processed.image
                            .width,

                    height:
                        processed.image
                            .height,

                    mimeType:
                        processed.image
                            .mimeType,

                    transparent:
                        request.transparent
                },

                processing:
                    processed.metadata
            }
        };

        /*
         * Do NOT cache here.
         *
         * The caller first runs validation. Only a valid
         * asset gets persisted.
         */
        return {
            asset,

            cacheKey,

            fromCache:
                false
        };
    }
}


function validateGenerationRequest(
    request:
        AssetGenerationRequest
): void {
    if (
        !request.role.trim()
    ) {
        throw new Error(
            "Asset generation role cannot be empty"
        );
    }

    if (
        request.width <=
            0 ||
        request.height <=
            0
    ) {
        throw new Error(
            "Asset generation dimensions must be positive"
        );
    }

    if (
        !Number.isInteger(
            request.width
        ) ||
        !Number.isInteger(
            request.height
        )
    ) {
        throw new Error(
            "Asset generation dimensions must be integers"
        );
    }

    if (
        request.tags.length ===
        0
    ) {
        throw new Error(
            "Asset generation requires at least one semantic tag"
        );
    }

    if (
        !request.style.trim()
    ) {
        throw new Error(
            "Asset generation style cannot be empty"
        );
    }

    if (
        request.seed !==
            undefined &&
        (
            !Number.isInteger(
                request.seed
            ) ||
            request.seed <=
                0
        )
    ) {
        throw new Error(
            "Asset generation seed must be a positive integer"
        );
    }
}


function createPromptHash(
    positive:
        string,

    negative:
        string
): string {
    return createHash(
        "sha256"
    )
        .update(
            positive
        )
        .update(
            "\n---negative---\n"
        )
        .update(
            negative
        )
        .digest(
            "hex"
        );
}


function deriveSeed(
    promptHash:
        string
): number {
    const raw =
        Number.parseInt(
            promptHash.slice(
                0,
                8
            ),
            16
        );

    const seed =
        raw %
        2_147_483_647;

    return Math.max(
        1,
        seed
    );
}


function deriveRetrySeed(
    baseSeed:
        number,

    attempt:
        number
): number {
    /*
     * attempt=1 is the original base seed.
     *
     * attempt=2:
     * base + 1_000_003
     *
     * attempt=3:
     * base + 2_000_006
     */
    const offset =
        Math.max(
            0,
            attempt - 1
        ) *
        1_000_003;

    const value =
        (
            baseSeed +
            offset
        ) %
        2_147_483_647;

    return Math.max(
        1,
        value
    );
}


function resolveProviderIdentity(
    provider:
        ImageGeneratorProvider,

    request:
        ImageGeneratorRequest
): ImageGeneratorIdentity {
    return provider.getIdentity
        ? provider.getIdentity(
            request
        )
        : {
            provider:
                provider.id,

            model:
                provider.model
        };
}