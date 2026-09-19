import type {
    ModelContextProfile
} from "./model-context-budget.js";


export interface CodingModelContextPreset {
    id:
        string;

    maxOutputTokens:
        number;

    context:
        ModelContextProfile;
}


const PRESETS:
    Readonly<
        Record<
            string,
            CodingModelContextPreset
        >
    > = {
        "qwen3.5-9b-lmstudio-32k": {
            id:
                "qwen3.5-9b-lmstudio-32k",

            maxOutputTokens:
                8_192,

            context: {
                /*
                 * This is deliberately the configured LM Studio
                 * runtime window used by game-factory, not a claim
                 * about the model's theoretical maximum context.
                 */
                contextWindowTokens:
                    32_768,

                safetyMarginTokens:
                    2_048,

                requestOverheadTokens:
                    512
            }
        }
    };


export function getModelContextPreset(
    id:
        string
): CodingModelContextPreset {
    const normalized =
        id.trim()
            .toLowerCase();


    const preset =
        PRESETS[
            normalized
        ];


    if (!preset) {
        throw new Error(
            `Unknown coding model context preset: ${id}`
        );
    }


    /*
     * Return fresh objects so callers cannot mutate the registry.
     */
    return {
        id:
            preset.id,

        maxOutputTokens:
            preset.maxOutputTokens,

        context: {
            contextWindowTokens:
                preset.context
                    .contextWindowTokens,

            safetyMarginTokens:
                preset.context
                    .safetyMarginTokens,

            requestOverheadTokens:
                preset.context
                    .requestOverheadTokens
        }
    };
}


export function listModelContextPresets():
    readonly string[]
{
    return Object.keys(
        PRESETS
    ).sort();
}