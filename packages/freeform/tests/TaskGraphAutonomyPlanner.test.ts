
import { describe, expect, it } from "vitest";

import type {
    PlanningInput
} from "@game-factory/autonomy";

import type {
    FreeformBlueprint
} from "../src/contracts/FreeformBlueprint.js";

import type {
    TaskGraph
} from "../src/contracts/TaskGraph.js";

import {
    TaskGraphAutonomyPlanner
} from "../src/autonomy/TaskGraphAutonomyPlanner.js";

function blueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Breakout",
        pitch: "Brick breaker",
        target: "web",
        technology: {
            engine: "phaser",
            language: "typescript"
        },
        viewport: {
            width: 800,
            height: 600,
            orientation: "landscape"
        },
        controls: [{
            action: "move",
            input: "keyboard",
            description: "Move paddle"
        }],
        mechanics: [{
            id: "ball",
            rules: ["Bounce"],
            failureModes: ["Missed paddle"]
        }],
        scenes: [{
            id: "game",
            purpose: "Gameplay",
            transitions: []
        }],
        visualStyle: {
            style: "minimal",
            paletteNotes: "Bright",
            camera: "fixed"
        },
        assets: [],
        acceptance: [{
            id: "playable",
            scenario: "Start game",
            expected: "Game loads"
        }],
        constraints: {
            offlineRuntime: true,
            noRemoteCode: true,
            scope: "small-2d"
        }
    };
}

function graph(): TaskGraph {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        revision: 1,
        tasks: [
            {
                id: "integrate",
                title: "Integrate gameplay",
                objective: "Register game scene",
                dependsOn: ["foundation"],
                allowedPaths: ["src/main.ts"],
                readPaths: ["src/game/MainScene.ts"],
                interfaces: [],
                acceptance: ["Scene launches"],
                checks: ["tsc", "browser_smoke"],
                estimatedComplexity: "small",
                maxLocalAttempts: 2
            },
            {
                id: "foundation",
                title: "Create foundation",
                objective: "Create entry point",
                dependsOn: [],
                allowedPaths: ["src/main.ts"],
                readPaths: ["package.json"],
                interfaces: [],
                acceptance: ["Project compiles"],
                checks: ["tsc"],
                estimatedComplexity: "small",
                maxLocalAttempts: 2
            }
        ]
    };
}

function planningInput(
    completedIds: string[] = []
): PlanningInput {
    return {
        context: {
            run: {
                id: "test-run",
                goal: "Create Breakout"
            },
            progress: {
                currentIteration: completedIds.length,
                maxIterations: 2,
                remainingIterations: 2 - completedIds.length,
                completedIterationCount: completedIds.length
            },
            completedIterations: completedIds.map(id => ({
                id,
                objective: id,
                attemptsPerformed: 1,
                changedFiles: []
            })),
            omitted: {
                completedIterations: 0,
                changedFiles: 0
            }
        }
    };
}

function planner(
    value: TaskGraph = graph()
): TaskGraphAutonomyPlanner {
    return new TaskGraphAutonomyPlanner({
        blueprint: blueprint(),
        graph: value,
        availableChecks: ["tsc", "browser_smoke"]
    });
}

describe("TaskGraphAutonomyPlanner", () => {
    it("runs dependencies before their dependents", async () => {
        const decision = await planner().plan(planningInput());

        expect(decision.type).toBe("iteration");

        if (decision.type === "iteration") {
            expect(decision.contract.id).toBe("foundation");

            expect(decision.contract.scope.allowedPaths)
                .toEqual(["src/main.ts"]);

            expect(decision.contract.contextScope?.allowedPaths)
                .toContain("package.json");

            expect(decision.contract.verification[0]?.command)
                .toBe("verify:tsc");
        }
    });

    it("selects the next task after acceptance", async () => {
        const decision = await planner().plan(
            planningInput(["foundation"])
        );

        expect(decision.type).toBe("iteration");

        if (decision.type === "iteration") {
            expect(decision.contract.id).toBe("integrate");
        }
    });

    it("completes when all tasks are accepted", async () => {
        const decision = await planner().plan(
            planningInput(["foundation", "integrate"])
        );

        expect(decision.type).toBe("complete");
    });

    it("rejects unregistered checks", () => {
        expect(() => new TaskGraphAutonomyPlanner({
            blueprint: blueprint(),
            graph: graph(),
            availableChecks: ["tsc"]
        })).toThrow("not configured");
    });

    it("rejects premature browser smoke", () => {
        const value = graph();
        value.tasks[1]!.checks = ["tsc", "browser_smoke"];

        expect(() => planner(value))
            .toThrow("browser_smoke is only allowed on a terminal task");
    });

    it("blocks when previous completions were omitted", async () => {
        const input = planningInput(["foundation"]);
        input.context.omitted.completedIterations = 1;

        const decision = await planner().plan(input);

        expect(decision.type).toBe("blocked");
    });
});
