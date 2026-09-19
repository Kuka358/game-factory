export interface TokenEstimator {
    estimateTokens(
        text:
            string
    ): number;
}


export interface ModelContextProfile {
    contextWindowTokens:
        number;

    /**
     * Tokens deliberately left unused between the estimated
     * request and the model's hard context-window boundary.
     *
     * This absorbs tokenizer/protocol estimation error.
     */
    safetyMarginTokens?:
        number;

    /**
     * Estimated provider/chat-template overhead that is not
     * represented directly by system/user message strings.
     */
    requestOverheadTokens?:
        number;
}


export interface ModelContextBudget {
    contextWindowTokens:
        number;

    reservedOutputTokens:
        number;

    safetyMarginTokens:
        number;

    requestOverheadTokens:
        number;

    /**
     * Maximum estimated input tokens allowed before generation.
     *
     * requestOverheadTokens counts inside this limit.
     */
    maxInputTokens:
        number;
}

export interface ModelContextBudgetReport {
    contextWindowTokens:
        number;

    reservedOutputTokens:
        number;

    safetyMarginTokens:
        number;

    requestOverheadTokens:
        number;

    maxInputTokens:
        number;

    estimatedInputTokens:
        number;

    remainingHeadroomTokens:
        number;

    selectedFileCount:
        number;

    skippedFileCount:
        number;

    selectedInventoryCount:
        number;

    skippedInventoryCount:
        number;
}


export interface ModelInputTokenEstimateInput {
    budget:
        ModelContextBudget;

    estimator:
        TokenEstimator;

    systemPrompt:
        string;

    userPrompt:
        string;

    responseSchema:
        Record<string, unknown>;
}


/**
 * Conservative fallback estimator for models whose exact tokenizer
 * is not available locally.
 *
 * Source code is commonly around 3-4 UTF-8 bytes per token.
 * Using 3 bytes/token deliberately overestimates many code prompts.
 *
 * Exact model tokenizers can implement TokenEstimator later without
 * changing the context-selection algorithm.
 */
export class ConservativeUtf8TokenEstimator
    implements TokenEstimator
{
    estimateTokens(
        text:
            string
    ): number {
        if (
            text.length ===
            0
        ) {
            return 0;
        }


        return Math.ceil(
            Buffer.byteLength(
                text,
                "utf8"
            ) /
            3
        );
    }
}


export function createModelContextBudget(
    profile:
        ModelContextProfile,

    reservedOutputTokens:
        number
): ModelContextBudget {
    const contextWindowTokens =
        positiveInteger(
            profile.contextWindowTokens,
            "contextWindowTokens"
        );


    const outputTokens =
        positiveInteger(
            reservedOutputTokens,
            "reservedOutputTokens"
        );


    const safetyMarginTokens =
        nonNegativeInteger(
            profile.safetyMarginTokens ??
                2_048,
            "safetyMarginTokens"
        );


    const requestOverheadTokens =
        nonNegativeInteger(
            profile.requestOverheadTokens ??
                512,
            "requestOverheadTokens"
        );


    if (
        outputTokens +
            safetyMarginTokens +
            requestOverheadTokens >=
        contextWindowTokens
    ) {
        throw new Error(
            [
                "Model context budget leaves no room for input:",
                `contextWindowTokens=${contextWindowTokens},`,
                `reservedOutputTokens=${outputTokens},`,
                `safetyMarginTokens=${safetyMarginTokens},`,
                `requestOverheadTokens=${requestOverheadTokens}`
            ].join(
                " "
            )
        );
    }


    return {
        contextWindowTokens,

        reservedOutputTokens:
            outputTokens,

        safetyMarginTokens,

        requestOverheadTokens,

        maxInputTokens:
            contextWindowTokens -
            outputTokens -
            safetyMarginTokens
    };
}


export function estimateModelInputTokens(
    input:
        ModelInputTokenEstimateInput
): number {
    const schemaText =
        JSON.stringify(
            input.responseSchema
        );


    return (
        input.budget
            .requestOverheadTokens +
        input.estimator
            .estimateTokens(
                input.systemPrompt
            ) +
        input.estimator
            .estimateTokens(
                input.userPrompt
            ) +
        input.estimator
            .estimateTokens(
                schemaText
            )
    );
}


function positiveInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive integer`
        );
    }


    return value;
}


function nonNegativeInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <
            0
    ) {
        throw new Error(
            `${name} must be a non-negative integer`
        );
    }


    return value;
}