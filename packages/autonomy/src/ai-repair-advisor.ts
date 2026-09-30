import type {
    AIProvider
} from "@game-factory/ai";

import type {
    RepairAdvisor
} from "./providers.js";

import type {
    RepairContext
} from "./repair-context.js";

import {
    validateRepairPlan
} from "./repair-plan.js";

import type {
    RepairPlan,
    RepairPlanStrategy
} from "./repair-plan.js";


export interface AIRepairAdvisorOptions {
    provider:
        AIProvider;

    model:
        string;

    temperature?:
        number;

    maxTokens?:
        number;
}


interface AIRepairPlanPayload {
    strategy:
        "repair" |
        "replan" |
        "architecture_required" |
        "abort";

    diagnosis:
        string;

    failedChecks:
        readonly string[];

    instructions:
        readonly string[];

    filesHint:
        readonly string[];

    preserve:
        readonly string[];

    reason:
        string;

    question:
        string;
}


export class AIRepairAdvisor
    implements RepairAdvisor
{
    private readonly maxTokens:
        number;


    constructor(
        private readonly options:
            AIRepairAdvisorOptions
    ) {
        if (
            options.model
                .trim()
                .length ===
            0
        ) {
            throw new Error(
                "AIRepairAdvisor model must be non-empty"
            );
        }


        this.maxTokens =
            positiveInteger(
                options.maxTokens ??
                    2_048,
                "maxTokens"
            );
    }


    async advise(
        context:
            RepairContext
    ): Promise<RepairPlan> {
        const response =
            await this.options
                .provider
                .generate<AIRepairPlanPayload>({
                    model:
                        this.options.model,

                    temperature:
                        this.options.temperature ??
                        0.1,

                    maxTokens:
                        this.maxTokens,

                    messages: [
                        {
                            role:
                                "system",

                            content:
                                createSystemPrompt()
                        },

                        {
                            role:
                                "user",

                            content:
                                JSON.stringify(
                                    context
                                )
                        }
                    ],

                    structuredOutput: {
                        name:
                            "repair_plan",

                        schema:
                            createResponseSchema()
                    }
                });


        return validateAIRepairResponse(
            response.data
        );
    }
}


function createSystemPrompt():
    string
{
    return [
        "You are the repair advisor for an autonomous software-development system.",
        "",
        "You do NOT edit files.",
        "You do NOT execute commands.",
        "You diagnose a failed deterministic verification attempt and choose one bounded next strategy.",
        "",
        "The supplied RepairContext is authoritative.",
        "Deterministic verifier failures are facts.",
        "failedChecks in your response must contain exactly the failed check ids supplied in RepairContext.failedChecks.",
        "Do not invent, omit, rename, merge, or reinterpret failed check ids.",
        "",
        "Choose strategy=\"repair\" only when the current iteration can reasonably be repaired within its existing objective and scope.",
        "Choose strategy=\"replan\" when the current iteration design is insufficient and the planner should create a different iteration.",
        "Choose strategy=\"architecture_required\" only when a genuine unresolved architectural decision prevents a safe repair.",
        "Choose strategy=\"abort\" when continuing would be unsafe or the requested result should not be pursued.",
        "",
        "For strategy=\"repair\":",
        "- diagnosis must explain the failure.",
        "- instructions must contain concrete repair guidance.",
        "- filesHint may prioritize relevant files, but it never expands allowedPaths.",
        "- preserve must identify behaviour, APIs, architecture, or invariants that must remain unchanged.",
        "- reason and question must be empty strings.",
        "",
        "For strategy=\"replan\":",
        "- reason must be non-empty.",
        "- instructions, filesHint, preserve must be empty arrays.",
        "- question must be an empty string.",
        "",
        "For strategy=\"architecture_required\":",
        "- question must be non-empty.",
        "- instructions, filesHint, preserve must be empty arrays.",
        "- reason must be an empty string.",
        "",
        "For strategy=\"abort\":",
        "- reason must be non-empty.",
        "- instructions, filesHint, preserve must be empty arrays.",
        "- question must be an empty string.",
        "",
        "Return only the requested structured response."
    ].join(
        "\n"
    );
}


function createResponseSchema():
    Record<string, unknown>
{
    return {
        type:
            "object",

        properties: {
            strategy: {
                type:
                    "string",

                enum: [
                    "repair",
                    "replan",
                    "architecture_required",
                    "abort"
                ]
            },

            diagnosis: {
                type:
                    "string",

                minLength:
                    1
            },

            failedChecks: {
                type:
                    "array",

                minItems:
                    1,

                items: {
                    type:
                        "string",

                    minLength:
                        1
                }
            },

            instructions: {
                type:
                    "array",

                items: {
                    type:
                        "string",

                    minLength:
                        1
                }
            },

            filesHint: {
                type:
                    "array",

                items: {
                    type:
                        "string",

                    minLength:
                        1
                }
            },

            preserve: {
                type:
                    "array",

                items: {
                    type:
                        "string",

                    minLength:
                        1
                }
            },

            reason: {
                type:
                    "string"
            },

            question: {
                type:
                    "string"
            }
        },

        required: [
            "strategy",
            "diagnosis",
            "failedChecks",
            "instructions",
            "filesHint",
            "preserve",
            "reason",
            "question"
        ],

        additionalProperties:
            false
    };
}


function validateAIRepairResponse(
    value:
        unknown
): RepairPlan {
    if (
        !isRecord(
            value
        )
    ) {
        throw new Error(
            "AI repair advisor returned an invalid response"
        );
    }


    const strategy =
        expectStrategy(
            value.strategy
        );


    const diagnosis =
        expectString(
            value.diagnosis,
            "diagnosis"
        );


    const failedChecks =
        expectStringArray(
            value.failedChecks,
            "failedChecks"
        );


    const instructions =
        expectStringArray(
            value.instructions,
            "instructions"
        );


    const filesHint =
        expectStringArray(
            value.filesHint,
            "filesHint"
        );


    const preserve =
        expectStringArray(
            value.preserve,
            "preserve"
        );


    const reason =
        expectString(
            value.reason,
            "reason"
        );


    const question =
        expectString(
            value.question,
            "question"
        );


    switch (
        strategy
    ) {
        case "repair": {
            assertEmptyString(
                reason,
                "reason",
                strategy
            );

            assertEmptyString(
                question,
                "question",
                strategy
            );


            return validateRepairPlan({
                strategy,

                diagnosis,

                failedChecks,

                instructions,

                filesHint,

                preserve
            });
        }


        case "replan": {
            assertEmptyArray(
                instructions,
                "instructions",
                strategy
            );

            assertEmptyArray(
                filesHint,
                "filesHint",
                strategy
            );

            assertEmptyArray(
                preserve,
                "preserve",
                strategy
            );

            assertEmptyString(
                question,
                "question",
                strategy
            );


            return validateRepairPlan({
                strategy,

                diagnosis,

                failedChecks,

                reason
            });
        }


        case "architecture_required": {
            assertEmptyArray(
                instructions,
                "instructions",
                strategy
            );

            assertEmptyArray(
                filesHint,
                "filesHint",
                strategy
            );

            assertEmptyArray(
                preserve,
                "preserve",
                strategy
            );

            assertEmptyString(
                reason,
                "reason",
                strategy
            );


            return validateRepairPlan({
                strategy,

                diagnosis,

                failedChecks,

                question
            });
        }


        case "abort": {
            assertEmptyArray(
                instructions,
                "instructions",
                strategy
            );

            assertEmptyArray(
                filesHint,
                "filesHint",
                strategy
            );

            assertEmptyArray(
                preserve,
                "preserve",
                strategy
            );

            assertEmptyString(
                question,
                "question",
                strategy
            );


            return validateRepairPlan({
                strategy,

                diagnosis,

                failedChecks,

                reason
            });
        }
    }
}


function expectStrategy(
    value:
        unknown
): RepairPlanStrategy {
    if (
        value ===
            "repair" ||
        value ===
            "replan" ||
        value ===
            "architecture_required" ||
        value ===
            "abort"
    ) {
        return value;
    }


    throw new Error(
        "AI repair advisor returned an invalid strategy"
    );
}


function expectString(
    value:
        unknown,

    field:
        string
): string {
    if (
        typeof value !==
        "string"
    ) {
        throw new Error(
            `AI repair advisor ${field} must be a string`
        );
    }


    return value;
}


function expectStringArray(
    value:
        unknown,

    field:
        string
): readonly string[] {
    if (
        !Array.isArray(
            value
        ) ||
        value.some(
            item =>
                typeof item !==
                "string"
        )
    ) {
        throw new Error(
            `AI repair advisor ${field} must be a string array`
        );
    }


    return value;
}


function assertEmptyString(
    value:
        string,

    field:
        string,

    strategy:
        RepairPlanStrategy
): void {
    if (
        value.trim().length >
        0
    ) {
        throw new Error(
            `AI repair advisor ${field} must be empty for ${strategy}`
        );
    }
}


function assertEmptyArray(
    value:
        readonly string[],

    field:
        string,

    strategy:
        RepairPlanStrategy
): void {
    if (
        value.length >
        0
    ) {
        throw new Error(
            `AI repair advisor ${field} must be empty for ${strategy}`
        );
    }
}


function isRecord(
    value:
        unknown
): value is Record<string, unknown> {
    return (
        typeof value ===
            "object" &&
        value !==
            null &&
        !Array.isArray(
            value
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