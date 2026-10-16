
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

import {
    CloudGamePlanner
} from "../src/cloud/CloudGamePlanner.js";

class FakeCloudProvider implements AIProvider {
    readonly id = "fake-cloud";

    readonly requests: AIRequest[] = [];

    constructor(
        private readonly output: unknown
    ) {}

    async generate<T>(
        request: AIRequest
    ): Promise<AIResponse<T>> {
        this.requests.push(request);

        return {
            data: this.output as T,
            provider: this.id,
            model: request.model,
            usage: {
                inputTokens: 150,
                outputTokens: 350,
                totalTokens: 500
            }
        };
    }
}

function createBlueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Breakout",
        pitch: "A simple brick-breaking game",
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
            description: "Move horizontally"
        }],
        mechanics: [{
            id: "ball",
            rules: ["Bounce off walls and paddle"],
            failureModes: ["Ball falls off screen"]
        }],
        scenes: [{
            id: "game",
            purpose: "Main gameplay",
            transitions: []
        }],
        visualStyle: {
            style: "minimal",
            paletteNotes: "Bright colors",
            camera: "fixed"
        },
        assets: [],
        acceptance: [{
            id: "bounce",
            scenario: "Ball hits paddle",
            expected: "Ball bounces"
        }],
        constraints: {
            offlineRuntime: true,
            noRemoteCode: true,
            scope: "small-2d"
        }
    };
}

function createTaskGraph(): TaskGraph {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        revision: 1,
        tasks: [
            {
                id: "foundation",
                title: "Create game foundation",
                objective: "Create Phaser game entry point",
                dependsOn: [],
                allowedPaths: ["src/main.ts"],
                readPaths: ["package.json"],
                interfaces: [],
                acceptance: [
                    "Game starts without runtime errors"
                ],
                checks: ["tsc"],
                estimatedComplexity: "small",
                maxLocalAttempts: 2
            },
            {
                id: "ball",
                title: "Implement ball mechanics",
                objective: "Add ball movement and collisions",
                dependsOn: ["foundation"],
                allowedPaths: ["src/ball.ts"],
                readPaths: ["src/main.ts"],
                interfaces: [],
                acceptance: [
                    "Ball bounces off paddle and walls"
                ],
                checks: ["tsc", "unit"],
                estimatedComplexity: "small",
                maxLocalAttempts: 2
            }
        ]
    };
}

function createPlanner(
    output: unknown
) {
    const provider = new FakeCloudProvider(output);

    return {
        provider,
        planner: new CloudGamePlanner({
            provider,
            model: "test-planner-model"
        })
    };
}

describe("CloudGamePlanner", () => {
    it("creates and validates a TaskGraph", async () => {
        const { provider, planner } = createPlanner(
            createTaskGraph()
        );

        const result = await planner.plan({
            blueprint: createBlueprint()
        });

        expect(result.graph.tasks).toHaveLength(2);
        expect(result.graph.blueprintId).toBe("breakout");
        expect(result.metadata.usage?.totalTokens).toBe(500);

        expect(provider.requests).toHaveLength(1);

        const request = provider.requests[0]!;

        expect(request.structuredOutput?.name).toBe(
            "freeform_task_graph"
        );

        expect(
            JSON.stringify(request.structuredOutput?.schema)
        ).not.toContain('"pattern"');

        expect(
            JSON.stringify(request.messages)
        ).toContain("Breakout");
    });

    it("rejects unknown graph dependencies", async () => {
        const graph = createTaskGraph();
        graph.tasks[1]!.dependsOn = ["nonexistent"];

        const { planner } = createPlanner(graph);

        await expect(
            planner.plan({
                blueprint: createBlueprint()
            })
        ).rejects.toThrow("invalid TaskGraph");
    });

    it("rejects a mismatched Blueprint ID", async () => {
        const graph = createTaskGraph();
        graph.blueprintId = "different_game";

        const { planner } = createPlanner(graph);

        await expect(
            planner.plan({
                blueprint: createBlueprint()
            })
        ).rejects.toThrow("invalid TaskGraph");
    });

    it("rejects an invalid input Blueprint", async () => {
        const blueprint = createBlueprint();
        blueprint.viewport.width = -1;

        const { provider, planner } = createPlanner(
            createTaskGraph()
        );

        await expect(
            planner.plan({ blueprint })
        ).rejects.toThrow("invalid Blueprint");

        expect(provider.requests).toHaveLength(0);
    });

    it("rejects invalid task write paths", async () => {
        const graph = createTaskGraph();

        graph.tasks[0]!.allowedPaths = [
            "../../packages/autonomy/src/engine.ts"
        ];

        const { planner } = createPlanner(graph);

        await expect(
            planner.plan({
                blueprint: createBlueprint()
            })
        ).rejects.toThrow("invalid TaskGraph");
    });

    it("rejects an incorrect initial revision", async () => {
        const graph = createTaskGraph();
        graph.revision = 2;

        const { planner } = createPlanner(graph);

        await expect(
            planner.plan({
                blueprint: createBlueprint()
            })
        ).rejects.toThrow(
            "Initial TaskGraph revision must be 1"
        );
    });

    it("rejects an empty model name", () => {
        expect(() =>
            new CloudGamePlanner({
                provider: new FakeCloudProvider(
                    createTaskGraph()
                ),
                model: " "
            })
        ).toThrow("model is required");
    });
});
