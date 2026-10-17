
import { describe, expect, it } from "vitest";

import type {
    TaskGraph
} from "../src/contracts/TaskGraph.js";

import type {
    AcceptanceTestPlan
} from "../src/contracts/AcceptanceTestPlan.js";

import {
    createTaskGraphDigest,
    validateAcceptanceTestPlan,
    assertReadyForTestGeneration
} from "../src/validation/AcceptanceTestPlanValidator.js";

function graph(): TaskGraph {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        revision: 1,
        tasks: [{
            id: "paddle",
            title: "Paddle movement",
            objective: "Move and clamp the paddle",
            dependsOn: [],
            allowedPaths: ["src/game/Paddle.ts"],
            readPaths: ["src/game/constants.ts"],
            interfaces: [],
            acceptance: [
                "Paddle stays inside viewport bounds",
                "Arrow input changes horizontal movement"
            ],
            checks: ["tsc"],
            estimatedComplexity: "small",
            maxLocalAttempts: 3
        }]
    };
}

function plan(
    source: TaskGraph = graph()
): AcceptanceTestPlan {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphRevision: source.revision,
        graphDigest: createTaskGraphDigest(source),
        taskId: "paddle",
        scenarios: [{
            id: "paddle_bounds",
            requirement:
                "Paddle stays inside viewport bounds",
            level: "unit",
            setup: [
                "Initialize the paddle in the viewport"
            ],
            actions: [
                "Apply right movement for a long duration"
            ],
            assertions: [
                "The paddle remains inside the right boundary"
            ]
        }],
        unresolvedQuestions: []
    };
}

describe("AcceptanceTestPlanValidator", () => {
    it("accepts a valid test plan", () => {
        const source = graph();

        expect(
            validateAcceptanceTestPlan(
                plan(source),
                source,
                "breakout"
            ).valid
        ).toBe(true);
    });

    it("rejects a different Blueprint", () => {
        const source = graph();
        const value = plan(source);

        value.blueprintId = "other";

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });

    it("rejects changed TaskGraph content", () => {
        const source = graph();
        const value = plan(source);

        source.tasks[0]!.objective = "Changed objective";

        const result = validateAcceptanceTestPlan(
            value,
            source,
            "breakout"
        );

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/graphDigest",
                message: "TaskGraph digest mismatch"
            });
        }
    });

    it("rejects unknown tasks", () => {
        const source = graph();
        const value = plan(source);

        value.taskId = "unknown";

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });

    it("rejects invented acceptance criteria", () => {
        const source = graph();
        const value = plan(source);

        value.scenarios[0]!.requirement =
            "Paddle moves at 999 pixels per second";

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });

    it("rejects duplicate scenario IDs", () => {
        const source = graph();
        const value = plan(source);

        value.scenarios.push({
            ...value.scenarios[0]!
        });

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });

    it("rejects unsupported browser verification", () => {
        const source = graph();
        const value = plan(source);

        value.scenarios[0]!.level = "browser_smoke";

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });

    it("blocks test generation when questions remain", () => {
        const value = plan();

        value.unresolvedQuestions = [
            "Is paddle x its center or left edge?"
        ];

        expect(() =>
            assertReadyForTestGeneration(value)
        ).toThrow("unresolved questions");
    });

    it("rejects executable fields in AI plan data", () => {
        const source = graph();

        const value = {
            ...plan(source),
            script: "process.exit(0)"
        };

        expect(
            validateAcceptanceTestPlan(
                value,
                source,
                "breakout"
            ).valid
        ).toBe(false);
    });
});
