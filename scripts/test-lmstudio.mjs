import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";


const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";

const model =
    process.env.LM_STUDIO_MODEL;

if (!model) {
    throw new Error(
        "LM_STUDIO_MODEL is required"
    );
}

const timeoutMs =
    Number(
        process.env
            .LM_STUDIO_TIMEOUT_MS ??
        "180000"
    );

if (
    !Number.isFinite(
        timeoutMs
    ) ||
    timeoutMs <= 0
) {
    throw new Error(
        "LM_STUDIO_TIMEOUT_MS must be a positive number"
    );
}


const provider =
    new LMStudioProvider({
        baseUrl,
        timeoutMs
    });


const result =
    await provider.generate({
        model,

        temperature:
            0.1,

        maxTokens:
            600,

        messages: [
            {
                role:
                    "system",

                content:
                    [
                        "You are a coding worker.",
                        "Follow the requested output schema exactly.",
                        "Be concise.",
                        "Do not include markdown."
                    ].join(
                        "\n"
                    )
            },

            {
                role:
                    "user",

                content:
                    [
                        "Plan a small TypeScript change.",
                        "",
                        "Task:",
                        "Add a function clamp(value, min, max)",
                        "and unit tests for it.",
                        "",
                        "Return a short implementation plan."
                    ].join(
                        "\n"
                    )
            }
        ],

        structuredOutput: {
            name:
                "coding_plan",

            schema: {
                type:
                    "object",

                properties: {
                    status: {
                        type:
                            "string",

                        enum: [
                            "ready"
                        ]
                    },

                    summary: {
                        type:
                            "string"
                    },

                    steps: {
                        type:
                            "array",

                        items: {
                            type:
                                "string"
                        },

                        minItems:
                            1
                    }
                },

                required: [
                    "status",
                    "summary",
                    "steps"
                ],

                additionalProperties:
                    false
            }
        }
    });


console.log(
    JSON.stringify(
        {
            provider:
                result.provider,

            model:
                result.model,

            usage:
                result.usage,

            data:
                result.data
        },
        null,
        2
    )
);