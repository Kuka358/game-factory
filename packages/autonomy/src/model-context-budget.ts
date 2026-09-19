export interface TokenEstimator {
    estimateTokens(
        text:
            string
    ): number;
}

export interface TokenEstimateCalibrationObservation {
    rawEstimatedInputTokens:
        number;

    actualInputTokens:
        number;

    actualToRawEstimateRatio:
        number;

    previousMultiplier:
        number;

    nextMultiplier:
        number;
}


export interface TokenEstimateCalibration {
    readonly currentMultiplier:
        number;

    apply(
        rawEstimatedTokens:
            number
    ): number;

    observe(
        rawEstimatedTokens:
            number,

        actualTokens:
            number
    ): TokenEstimateCalibrationObservation;
}


export interface AdaptiveTokenEstimateCalibrationOptions {
    /**
     * Extra protection applied on top of an observed
     * actual/estimated ratio.
     *
     * 1.10 means keep another 10% safety margin after calibration.
     */
    headroomFactor?:
        number;

    /**
     * Prevent one anomalous provider usage result from making
     * every later prompt unusably conservative.
     */
    maxMultiplier?:
        number;
}


export class AdaptiveTokenEstimateCalibration
    implements TokenEstimateCalibration
{
    private multiplier =
        1;

    private readonly headroomFactor:
        number;

    private readonly maxMultiplier:
        number;


    constructor(
        options:
            AdaptiveTokenEstimateCalibrationOptions = {}
    ) {
        this.headroomFactor =
            numberAtLeastOne(
                options.headroomFactor ??
                    1.10,
                "headroomFactor"
            );


        this.maxMultiplier =
            numberAtLeastOne(
                options.maxMultiplier ??
                    2,
                "maxMultiplier"
            );
    }


    get currentMultiplier():
        number
    {
        return this.multiplier;
    }


    apply(
        rawEstimatedTokens:
            number
    ): number {
        const tokens =
            nonNegativeInteger(
                rawEstimatedTokens,
                "rawEstimatedTokens"
            );


        return ceilTokenEstimate(
            tokens *
            this.multiplier
        );
    }


    observe(
        rawEstimatedTokens:
            number,

        actualTokens:
            number
    ): TokenEstimateCalibrationObservation {
        const estimated =
            positiveInteger(
                rawEstimatedTokens,
                "rawEstimatedTokens"
            );


        const actual =
            positiveInteger(
                actualTokens,
                "actualTokens"
            );


        const previousMultiplier =
            this.multiplier;


        const actualToRawEstimateRatio =
            actual /
            estimated;


        const observedMultiplier =
            actualToRawEstimateRatio *
            this.headroomFactor;


        this.multiplier =
            Math.min(
                this.maxMultiplier,

                Math.max(
                    previousMultiplier,
                    1,
                    observedMultiplier
                )
            );


        return {
            rawEstimatedInputTokens:
                estimated,

            actualInputTokens:
                actual,

            actualToRawEstimateRatio,

            previousMultiplier,

            nextMultiplier:
                this.multiplier
        };
    }
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

    rawEstimatedInputTokens:
        number;

    estimateMultiplier:
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

function numberAtLeastOne(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isFinite(
            value
        ) ||
        value <
            1
    ) {
        throw new Error(
            `${name} must be a finite number greater than or equal to 1`
        );
    }


    return value;
}

function ceilTokenEstimate(
    value:
        number
): number {
    /*
     * Floating-point arithmetic can turn an exact mathematical
     * integer such as:
     *
     *   100 * 1.43
     *
     * into:
     *
     *   143.00000000000003
     *
     * A raw Math.ceil() would incorrectly reserve one additional
     * token. Remove only machine-precision noise before rounding
     * upward; meaningful fractional estimates still round up.
     */
    const tolerance =
        Number.EPSILON *
        Math.max(
            1,
            Math.abs(
                value
            )
        ) *
        8;


    return Math.ceil(
        value -
        tolerance
    );
}