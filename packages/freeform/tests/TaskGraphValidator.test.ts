
import { describe, expect, it } from "vitest";

import {
    validateTaskGraph
} from "../src/validation/TaskGraphValidator.js";

import type {
    ImplementationTask,
    TaskGraph
} from "../src/contracts/TaskGraph.js";

function task(
    id: string,
    overrides: Partial<ImplementationTask> = {}
): ImplementationTask {
    return {
        id,
        title: `Implement ${id}`,
        objective: `Implement game feature ${id}`,
        dependsOn: [],
        allowedPaths: [`src/${id}.ts`],
        readPaths: ["src/main.ts"],
        interfaces: [],
        acceptance: ["Feature works correctly"],
        checks: ["tsc"],
        estimatedComplexity: "small",
        maxLocalAttempts: 3,
        ...overrides
    };
}

function graph(): TaskGraph {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        revision: 1,
        tasks: [
            task("foundation"),
            task("ball", {
                dependsOn: ["foundation"]
            })
        ]
    };
}

function invalid(value: unknown): void {
    expect(
        validateTaskGraph(value, "breakout").valid
    ).toBe(false);
}

describe("validateTaskGraph", () => {
    it("accepts a valid dependency graph", () => {
        expect(
            validateTaskGraph(graph(), "breakout").valid
        ).toBe(true);
    });

    it("rejects a different Blueprint ID", () => {
        expect(
            validateTaskGraph(graph(), "tower-defense").valid
        ).toBe(false);
    });

    it("rejects unknown dependencies", () => {
        const value = graph();
        value.tasks[1]!.dependsOn = ["missing"];

        invalid(value);
    });

    it("rejects dependency cycles", () => {
        const value = graph();
        value.tasks[0]!.dependsOn = ["ball"];

        invalid(value);
    });

    it("rejects self dependencies", () => {
        const value = graph();
        value.tasks[0]!.dependsOn = ["foundation"];

        invalid(value);
    });

    it("rejects duplicate task IDs", () => {
        const value = graph();
        value.tasks.push(task("ball"));

        invalid(value);
    });

    it("rejects paths outside src", () => {
        const value = graph();
        value.tasks[0]!.allowedPaths = [
            "../../packages/autonomy/src/engine.ts"
        ];

        invalid(value);
    });

    it("rejects writes to the game package manifest", () => {
        const value = graph();
        value.tasks[0]!.allowedPaths = ["package.json"];

        invalid(value);
    });

    it("rejects unsafe read paths", () => {
        const value = graph();
        value.tasks[0]!.readPaths = ["../.env"];

        invalid(value);
    });

    it("rejects unknown verification commands", () => {
        const value = {
            ...graph(),
            tasks: [
                {
                    ...task("foundation"),
                    checks: ["run_arbitrary_shell"]
                }
            ]
        };

        invalid(value);
    });

    it("requires at least one verification check", () => {
        const value = graph();
        value.tasks[0]!.checks = [];

        invalid(value);
    });

    it("rejects more than three local attempts", () => {
        const value = graph();
        value.tasks[0]!.maxLocalAttempts = 10;

        invalid(value);
    });

    it("rejects shared files without dependency ordering", () => {
        const value = graph();
        value.tasks[1]!.dependsOn = [];
        value.tasks[1]!.allowedPaths = ["src/foundation.ts"];

        invalid(value);
    });

    it("allows shared files when tasks are ordered", () => {
        const value = graph();
        value.tasks[1]!.allowedPaths = ["src/foundation.ts"];

        expect(
            validateTaskGraph(value, "breakout").valid
        ).toBe(true);
    });

    it("rejects unknown object properties", () => {
        invalid({
            ...graph(),
            executeCommand: "npm install anything"
        });
    });
});
