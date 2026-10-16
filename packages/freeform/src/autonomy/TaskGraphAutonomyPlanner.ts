
import {
    validateIterationContract,
    type Planner,
    type PlanningInput,
    type PlanningDecision,
    type IterationContract
} from "@game-factory/autonomy";

import type {
    FreeformBlueprint
} from "../contracts/FreeformBlueprint.js";

import type {
    TaskCheck,
    TaskGraph,
    ImplementationTask
} from "../contracts/TaskGraph.js";

import {
    validateFreeformBlueprint
} from "../validation/FreeformBlueprintValidator.js";

import {
    validateTaskGraph
} from "../validation/TaskGraphValidator.js";

export interface TaskGraphAutonomyPlannerOptions {
    blueprint: FreeformBlueprint;
    graph: TaskGraph;

    // Must correspond to commands registered by the runner.
    availableChecks: readonly TaskCheck[];
}

export class TaskGraphAutonomyPlanner implements Planner {
    private readonly graph: TaskGraph;

    constructor(
        options: TaskGraphAutonomyPlannerOptions
    ) {
        const blueprint = validateFreeformBlueprint(
            options.blueprint
        );

        if (
            !blueprint.valid ||
            !blueprint.data.constraints.offlineRuntime
        ) {
            throw new Error(
                "Autonomy requires a valid offline Blueprint"
            );
        }

        const result = validateTaskGraph(
            options.graph,
            blueprint.data.id
        );

        if (!result.valid) {
            throw new Error(
                "Autonomy requires a valid TaskGraph: " +
                result.errors.map(error =>
                    `${error.path}: ${error.message}`
                ).join("; ")
            );
        }

        if (result.data.revision !== 1) {
            throw new Error(
                "Only initial TaskGraph revision 1 is supported"
            );
        }

        const available = new Set(
            options.availableChecks
        );

        for (const task of result.data.tasks) {
            for (const check of task.checks) {
                if (!available.has(check)) {
                    throw new Error(
                        `Verification check is not configured: ${check}`
                    );
                }
            }
        }

        this.graph = result.data;
    }

    async plan(
        input: PlanningInput
    ): Promise<PlanningDecision> {
        const context = input.context;

        if (context.replan) {
            return {
                type: "blocked",
                reason:
                    "Cloud replanning is not implemented yet: " +
                    context.replan.reason
            };
        }

        // The default Autonomy planning context keeps only
        // the most recent completed iterations.
        // Never accidentally repeat older tasks.
        if (
            context.omitted.completedIterations > 0 ||
            context.progress.completedIterationCount !==
                context.completedIterations.length
        ) {
            return {
                type: "blocked",
                reason:
                    "Planning context omitted completed tasks"
            };
        }

        if (
            context.progress.maxIterations <
            this.graph.tasks.length
        ) {
            return {
                type: "blocked",
                reason:
                    "Autonomy iteration budget is too small"
            };
        }

        const completed = new Set(
            context.completedIterations.map(item =>
                item.id
            )
        );

        for (const task of this.graph.tasks) {
            if (completed.has(task.id)) {
                continue;
            }

            if (
                !task.dependsOn.every(id =>
                    completed.has(id)
                )
            ) {
                continue;
            }

            return {
                type: "iteration",
                contract: this.toContract(task)
            };
        }

        if (
            this.graph.tasks.every(task =>
                completed.has(task.id)
            )
        ) {
            return {
                type: "complete",
                reason: "All Freeform implementation tasks passed"
            };
        }

        return {
            type: "blocked",
            reason: "No runnable TaskGraph task is available"
        };
    }

    private toContract(
        task: ImplementationTask
    ): IterationContract {
        const contextPaths = [
            ...new Set([
                ...task.allowedPaths,
                ...task.readPaths
            ])
        ];

        return validateIterationContract({
            id: task.id,
            objective: task.objective,
            rationale: task.title,

            scope: {
                allowedPaths: [...task.allowedPaths],
                forbiddenPaths: [
                    "package.json",
                    "pnpm-lock.yaml",
                    "tsconfig.json",
                    "vite.config.ts",
                    ".env"
                ]
            },

            contextScope: {
                allowedPaths: contextPaths,
                forbiddenPaths: []
            },

            changes: [{
                description: task.objective,
                filesHint: [...task.allowedPaths]
            }],

            acceptanceCriteria: [...task.acceptance],

            verification: task.checks.map(check => ({
                id: `${task.id}-${check}`,
                command: `verify:${check}`,
                required: true
            })),

            architecturalConstraints: [
                "Modify only files in the writable scope.",
                "Do not install dependencies or modify build configuration.",
                "Do not use external runtime services.",
                ...task.interfaces
            ],

            maxLocalAttempts: task.maxLocalAttempts,

            escalation: {
                onRepeatedFailure: true,
                onArchitectureConflict: true,
                maxRepairRounds: 1
            }
        });
    }
}
