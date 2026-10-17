
import { createHash } from "node:crypto";

import {
    Ajv,
    type ErrorObject
} from "ajv";

import type {
    AcceptanceTestPlan
} from "../contracts/AcceptanceTestPlan.js";

import type {
    TaskGraph
} from "../contracts/TaskGraph.js";

import {
    validateTaskGraph
} from "./TaskGraphValidator.js";

export interface AcceptanceTestPlanValidationError {
    path: string;
    message: string;
}

export type AcceptanceTestPlanValidationResult =
    | {
        valid: true;
        data: AcceptanceTestPlan;
    }
    | {
        valid: false;
        errors: AcceptanceTestPlanValidationError[];
    };

const identifier = {
    type: "string",
    pattern: "^[a-z0-9][a-z0-9_-]{0,63}$"
};

const statement = {
    type: "string",
    minLength: 1,
    maxLength: 1024
};

function steps(minItems: number) {
    return {
        type: "array",
        minItems,
        maxItems: 16,
        items: statement
    };
}

export const acceptanceTestPlanSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "schemaVersion",
        "blueprintId",
        "graphRevision",
        "graphDigest",
        "taskId",
        "scenarios",
        "unresolvedQuestions"
    ],
    properties: {
        schemaVersion: {
            type: "string",
            const: "1.0"
        },
        blueprintId: identifier,
        graphRevision: {
            type: "integer",
            minimum: 1
        },
        graphDigest: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
        },
        taskId: identifier,
        scenarios: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "id",
                    "requirement",
                    "level",
                    "setup",
                    "actions",
                    "assertions"
                ],
                properties: {
                    id: identifier,
                    requirement: statement,
                    level: {
                        type: "string",
                        enum: [
                            "unit",
                            "browser_smoke"
                        ]
                    },
                    setup: steps(0),
                    actions: steps(1),
                    assertions: steps(1)
                }
            }
        },
        unresolvedQuestions: {
            type: "array",
            maxItems: 16,
            uniqueItems: true,
            items: statement
        }
    }
};

const ajv = new Ajv({
    allErrors: true
});

const validateSchema = ajv.compile<AcceptanceTestPlan>(
    acceptanceTestPlanSchema
);

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") {
        const serialized = JSON.stringify(value);

        if (serialized === undefined) {
            throw new Error(
                "TaskGraph contains a non-JSON value"
            );
        }

        return serialized;
    }

    if (Array.isArray(value)) {
        return (
            "[" +
            value.map(canonicalJson).join(",") +
            "]"
        );
    }

    const object = value as Record<string, unknown>;

    const properties = Object.keys(object)
        .sort()
        .map(key =>
            JSON.stringify(key) +
            ":" +
            canonicalJson(object[key])
        );

    return "{" + properties.join(",") + "}";
}

export function createTaskGraphDigest(
    graph: TaskGraph
): string {
    return createHash("sha256")
        .update(canonicalJson(graph), "utf8")
        .digest("hex");
}

export function validateAcceptanceTestPlan(
    value: unknown,
    graph: TaskGraph,
    expectedBlueprintId: string
): AcceptanceTestPlanValidationResult {
    const graphResult = validateTaskGraph(
        graph,
        expectedBlueprintId
    );

    if (!graphResult.valid) {
        return {
            valid: false,
            errors: graphResult.errors.map(error => ({
                path: `/graph${error.path}`,
                message: error.message
            }))
        };
    }

    if (!validateSchema(value)) {
        return {
            valid: false,
            errors: (validateSchema.errors ?? []).map(
                formatSchemaError
            )
        };
    }

    const plan = value;

    const errors: AcceptanceTestPlanValidationError[] = [];

    if (plan.blueprintId !== expectedBlueprintId) {
        errors.push({
            path: "/blueprintId",
            message: "Acceptance plan references another Blueprint"
        });
    }

    if (plan.graphRevision !== graph.revision) {
        errors.push({
            path: "/graphRevision",
            message: "TaskGraph revision mismatch"
        });
    }

    if (
        plan.graphDigest !==
        createTaskGraphDigest(graph)
    ) {
        errors.push({
            path: "/graphDigest",
            message: "TaskGraph digest mismatch"
        });
    }

    const task = graph.tasks.find(
        item => item.id === plan.taskId
    );

    if (!task) {
        errors.push({
            path: "/taskId",
            message: "Unknown TaskGraph task"
        });

        return { valid: false, errors };
    }

    const knownRequirements = new Set(
        task.acceptance
    );

    const scenarioIds = new Set<string>();

    for (
        let index = 0;
        index < plan.scenarios.length;
        index++
    ) {
        const scenario = plan.scenarios[index]!;

        if (scenarioIds.has(scenario.id)) {
            errors.push({
                path: `/scenarios/${index}/id`,
                message: "Duplicate test scenario ID"
            });
        }

        scenarioIds.add(scenario.id);

        if (
            !knownRequirements.has(
                scenario.requirement
            )
        ) {
            errors.push({
                path: `/scenarios/${index}/requirement`,
                message:
                    "Scenario references an unknown acceptance criterion"
            });
        }

        if (
            scenario.level === "browser_smoke" &&
            !task.checks.includes("browser_smoke")
        ) {
            errors.push({
                path: `/scenarios/${index}/level`,
                message:
                    "Browser smoke is not enabled for this task"
            });
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        data: plan
    };
}

export function assertReadyForTestGeneration(
    plan: AcceptanceTestPlan
): void {
    if (plan.unresolvedQuestions.length > 0) {
        throw new Error(
            "Acceptance test plan has unresolved questions: " +
            plan.unresolvedQuestions.join("; ")
        );
    }
}

function formatSchemaError(
    error: ErrorObject
): AcceptanceTestPlanValidationError {
    if (error.keyword === "required") {
        return {
            path:
                `${error.instancePath}/` +
                String(error.params.missingProperty),
            message: "Required property is missing"
        };
    }

    if (error.keyword === "additionalProperties") {
        return {
            path: error.instancePath || "/",
            message:
                "Unknown property: " +
                String(error.params.additionalProperty)
        };
    }

    return {
        path: error.instancePath || "/",
        message: error.message ?? "Invalid test plan"
    };
}
