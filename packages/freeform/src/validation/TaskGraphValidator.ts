
import { Ajv, type ErrorObject } from "ajv";

import type {
    ImplementationTask,
    TaskGraph
} from "../contracts/TaskGraph.js";

export interface TaskGraphValidationError {
    path: string;
    message: string;
}

export type TaskGraphValidationResult =
    | { valid: true; data: TaskGraph }
    | { valid: false; errors: TaskGraphValidationError[] };

const identifier = {
    type: "string",
    pattern: "^[a-z0-9][a-z0-9_-]{0,63}$"
};

const description = {
    type: "string",
    minLength: 1,
    maxLength: 1024
};

const pathArray = (minItems: number, maxItems: number) => ({
    type: "array",
    minItems,
    maxItems,
    uniqueItems: true,
    items: {
        type: "string",
        minLength: 1,
        maxLength: 200
    }
});

export const taskGraphSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "schemaVersion",
        "blueprintId",
        "tasks",
        "revision"
    ],
    properties: {
        schemaVersion: { type: "string", const: "1.0" },
        blueprintId: identifier,
        revision: { type: "integer", minimum: 1 },
        tasks: {
            type: "array",
            minItems: 1,
            maxItems: 64,
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "id",
                    "title",
                    "objective",
                    "dependsOn",
                    "allowedPaths",
                    "readPaths",
                    "interfaces",
                    "acceptance",
                    "checks",
                    "estimatedComplexity",
                    "maxLocalAttempts"
                ],
                properties: {
                    id: identifier,
                    title: description,
                    objective: description,
                    dependsOn: {
                        type: "array",
                        maxItems: 32,
                        uniqueItems: true,
                        items: identifier
                    },
                    allowedPaths: pathArray(1, 3),
                    readPaths: pathArray(0, 32),
                    interfaces: {
                        type: "array",
                        maxItems: 32,
                        items: description
                    },
                    acceptance: {
                        type: "array",
                        minItems: 1,
                        maxItems: 32,
                        items: description
                    },
                    checks: {
                        type: "array",
                        minItems: 1,
                        uniqueItems: true,
                        items: {
                            type: "string",
                            enum: [
                                "tsc",
                                "vite",
                                "unit",
                                "browser_smoke"
                            ]
                        }
                    },
                    estimatedComplexity: {
                        type: "string",
                        enum: ["small", "medium"]
                    },
                    maxLocalAttempts: {
                        type: "integer",
                        minimum: 1,
                        maximum: 3
                    }
                }
            }
        }
    }
};

const ajv = new Ajv({ allErrors: true });

const checkSchema = ajv.compile<TaskGraph>(
    taskGraphSchema
);

// Exact, relative game source paths.
// No traversal, absolute paths, wildcards or shell syntax.
const sourcePath =
    /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:ts|tsx|json|css|html)$/;

const bootstrapReadPaths = new Set([
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "index.html"
]);

export function validateTaskGraph(
    value: unknown,
    expectedBlueprintId: string
): TaskGraphValidationResult {
    if (!checkSchema(value)) {
        return {
            valid: false,
            errors: (checkSchema.errors ?? []).map(
                formatSchemaError
            )
        };
    }

    const errors: TaskGraphValidationError[] = [];
    const tasks = value.tasks;
    const byId = new Map<string, ImplementationTask>();

    if (value.blueprintId !== expectedBlueprintId) {
        errors.push({
            path: "/blueprintId",
            message: "TaskGraph references a different Blueprint"
        });
    }

    tasks.forEach((task, index) => {
        if (byId.has(task.id)) {
            errors.push({
                path: `/tasks/${index}/id`,
                message: `Duplicate task ID: ${task.id}`
            });
        } else {
            byId.set(task.id, task);
        }

        const writePaths = new Set<string>();

        task.allowedPaths.forEach((path, pathIndex) => {
            if (!sourcePath.test(path)) {
                errors.push({
                    path: `/tasks/${index}/allowedPaths/${pathIndex}`,
                    message: `Unsafe or unsupported write path: ${path}`
                });
            }

            const normalized = path.toLowerCase();

            if (writePaths.has(normalized)) {
                errors.push({
                    path: `/tasks/${index}/allowedPaths/${pathIndex}`,
                    message: "Duplicate writable path"
                });
            }

            writePaths.add(normalized);
        });

        task.readPaths.forEach((path, pathIndex) => {
            if (
                !sourcePath.test(path) &&
                !bootstrapReadPaths.has(path)
            ) {
                errors.push({
                    path: `/tasks/${index}/readPaths/${pathIndex}`,
                    message: `Unsafe or unsupported read path: ${path}`
                });
            }
        });
    });

    tasks.forEach((task, index) => {
        for (const dependency of task.dependsOn) {
            if (!byId.has(dependency)) {
                errors.push({
                    path: `/tasks/${index}/dependsOn`,
                    message: `Unknown dependency: ${dependency}`
                });
            } else if (dependency === task.id) {
                errors.push({
                    path: `/tasks/${index}/dependsOn`,
                    message: "Task cannot depend on itself"
                });
            }
        }
    });

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // Detect dependency cycles using depth-first search.
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(id: string): void {
        if (visiting.has(id)) {
            errors.push({
                path: "/tasks",
                message: `Dependency cycle detected at task: ${id}`
            });
            return;
        }

        if (visited.has(id)) return;

        visiting.add(id);

        for (const dependency of byId.get(id)!.dependsOn) {
            visit(dependency);
        }

        visiting.delete(id);
        visited.add(id);
    }

    for (const task of tasks) {
        visit(task.id);
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    function dependsOn(
        taskId: string,
        dependencyId: string
    ): boolean {
        const pending = [
            ...byId.get(taskId)!.dependsOn
        ];
        const seen = new Set<string>();

        while (pending.length > 0) {
            const id = pending.pop()!;

            if (id === dependencyId) return true;
            if (seen.has(id)) continue;

            seen.add(id);
            pending.push(...byId.get(id)!.dependsOn);
        }

        return false;
    }

    // Tasks may share a file only when the DAG orders them.
    for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
            const first = tasks[i]!;
            const second = tasks[j]!;

            if (
                dependsOn(first.id, second.id) ||
                dependsOn(second.id, first.id)
            ) {
                continue;
            }

            const owned = new Set(
                first.allowedPaths.map(path =>
                    path.toLowerCase()
                )
            );

            for (const path of second.allowedPaths) {
                if (owned.has(path.toLowerCase())) {
                    errors.push({
                        path: `/tasks/${j}/allowedPaths`,
                        message:
                            `Unordered tasks ${first.id} and ` +
                            `${second.id} both write ${path}`
                    });
                }
            }
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, data: value };
}

function formatSchemaError(
    error: ErrorObject
): TaskGraphValidationError {
    if (error.keyword === "required") {
        return {
            path:
                `${error.instancePath}/${String(error.params.missingProperty)}`,
            message: "Required property is missing"
        };
    }

    if (error.keyword === "additionalProperties") {
        return {
            path:
                `${error.instancePath}/${String(error.params.additionalProperty)}`,
            message: "Unknown property"
        };
    }

    return {
        path: error.instancePath || "/",
        message: error.message ?? "Invalid value"
    };
}
