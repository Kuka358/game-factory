
import {
    describe,
    expect,
    it
} from "vitest";

import type {
    AIProvider,
    AIRequest,
    AIResponse
} from "@game-factory/ai";

import type {
    FreeformBlueprint
} from "../src/contracts/FreeformBlueprint.js";

import type {
    TaskGraph
} from "../src/contracts/TaskGraph.js";

import type {
    AcceptanceTestPlan
} from "../src/contracts/AcceptanceTestPlan.js";

import {
    createTaskGraphDigest,
    assertReadyForTestGeneration
} from "../src/validation/AcceptanceTestPlanValidator.js";

import {
    CloudAcceptanceTestPlanner
} from "../src/cloud/CloudAcceptanceTestPlanner.js";

function blueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Brick Breaker",
        pitch: "A game about breaking bricks",
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
            action: "move paddle",
            input: "arrow keys",
            description: "Move left and right"
        }],
        mechanics: [{
            id: "paddle",
            rules: ["Movement is horizontally clamped"],
            failureModes: ["Paddle escapes screen"]
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
            scenario: "Control paddle",
            expected: "Paddle moves correctly"
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
        tasks: [{
            id: "paddle",
            title: "Paddle movement",
            objective: "Implement paddle movement",
            dependsOn: [],
            allowedPaths: ["src/game/Paddle.ts"],
            readPaths: ["src/game/constants.ts"],
            interfaces: [],
            acceptance: [
                "Right input moves the paddle right.",
                "Paddle stays inside viewport bounds.",
                "tsc passes."
            ],
            checks: ["tsc"],
            estimatedComplexity: "small",
            maxLocalAttempts: 3
        }]
    };
}

function validPlan(source: TaskGraph): AcceptanceTestPlan {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphRevision: 1,
        graphDigest: createTaskGraphDigest(source),
        taskId: "paddle",
        scenarios: [
            {
                id: "move_right",
                requirement:
                    "Right input moves the paddle right.",
                level: "unit",
                setup: ["Create a paddle"],
                actions: ["Apply right input"],
                assertions: ["The X coordinate increases"]
            },
            {
                id: "clamp_right",
                requirement:
                    "Paddle stays inside viewport bounds.",
                level: "unit",
                setup: ["Create a paddle"],
                actions: [
                    "Move right for longer than needed to reach the edge"
                ],
                assertions: [
                    "The paddle does not cross the right boundary"
                ]
            }
        ],
        unresolvedQuestions: []
    };
}

class FakeProvider implements AIProvider {
    readonly id = "fake-cloud";
    readonly requests: AIRequest[] = [];

    private index = 0;

    constructor(
        private readonly outputs: unknown[]
    ) {}

    async generate<T>(
        request: AIRequest
    ): Promise<AIResponse<T>> {
        this.requests.push(request);

        const index = Math.min(
            this.index++,
            this.outputs.length - 1
        );

        return {
            data: this.outputs[index] as T,
            provider: this.id,
            model: request.model,
            usage: {
                inputTokens: 100,
                outputTokens: 200,
                totalTokens: 300
            }
        };
    }
}

function subject(...outputs: unknown[]) {
    const provider = new FakeProvider(outputs);

    return {
        provider,
        planner: new CloudAcceptanceTestPlanner({
            provider,
            model: "test-cloud-model"
        })
    };
}

describe("CloudAcceptanceTestPlanner", () => {
    it("generates a complete behavioral plan", async () => {
        const source = graph();
        const { provider, planner } = subject(
            validPlan(source)
        );

        const result = await planner.plan({
            blueprint: blueprint(),
            graph: source,
            taskId: "paddle"
        });

        expect(result.plan.scenarios).toHaveLength(2);
        expect(result.metadata.usage?.totalTokens).toBe(300);

        expect(provider.requests).toHaveLength(1);

        expect(
            provider.requests[0]!.structuredOutput?.name
        ).toBe("freeform_acceptance_test_plan");

        expect(
            JSON.stringify(provider.requests[0]!.messages)
        ).toContain("Paddle movement");
    });

    it("retries when behavioral coverage is incomplete", async () => {
        const source = graph();

        const incomplete = validPlan(source);
        incomplete.scenarios.pop();

        const { provider, planner } = subject(
            incomplete,
            validPlan(source)
        );

        const result = await planner.plan({
            blueprint: blueprint(),
            graph: source,
            taskId: "paddle"
        });

        expect(provider.requests).toHaveLength(2);
        expect(result.plan.scenarios).toHaveLength(2);

        expect(
            JSON.stringify(provider.requests[1]!.messages)
        ).toContain("Missing behavioral requirement");
    });

    it("does not accept invented requirements", async () => {
        const source = graph();

        const invalid = validPlan(source);
        invalid.scenarios[0]!.requirement =
            "Paddle teleports after pressing space.";

        const { planner } = subject(invalid);

        await expect(
            planner.plan({
                blueprint: blueprint(),
                graph: source,
                taskId: "paddle"
            })
        ).rejects.toThrow(
            "invalid test plan after 2 attempts"
        );
    });

    it("rejects stale graph digests", async () => {
        const source = graph();

        const stale = validPlan(source);
        stale.graphDigest = "0".repeat(64);

        const { planner } = subject(stale);

        await expect(
            planner.plan({
                blueprint: blueprint(),
                graph: source,
                taskId: "paddle"
            })
        ).rejects.toThrow("graphDigest");
    });

    it("rejects an unknown task before calling AI", async () => {
        const source = graph();
        const { provider, planner } = subject(
            validPlan(source)
        );

        await expect(
            planner.plan({
                blueprint: blueprint(),
                graph: source,
                taskId: "missing_task"
            })
        ).rejects.toThrow("Unknown TaskGraph task");

        expect(provider.requests).toHaveLength(0);
    });

    it("preserves unresolved specification questions", async () => {
        const source = graph();
        const value = validPlan(source);

        value.unresolvedQuestions = [
            "Is paddle X its center or left edge?"
        ];

        const { planner } = subject(value);

        const result = await planner.plan({
            blueprint: blueprint(),
            graph: source,
            taskId: "paddle"
        });

        expect(result.plan.unresolvedQuestions).toHaveLength(1);

        expect(() =>
            assertReadyForTestGeneration(result.plan)
        ).toThrow("unresolved questions");
    });

    it("does not mistake tsc for a behavioral test", async () => {
        const source = graph();
        const value = validPlan(source);

        value.scenarios.push({
            id: "compile",
            requirement: "tsc passes.",
            level: "unit",
            setup: [],
            actions: ["Compile the project"],
            assertions: ["Compilation succeeds"]
        });

        const { planner } = subject(value);

        await expect(
            planner.plan({
                blueprint: blueprint(),
                graph: source,
                taskId: "paddle"
            })
        ).rejects.toThrow(
            "Infrastructure checks must not be represented"
        );
    });
});
