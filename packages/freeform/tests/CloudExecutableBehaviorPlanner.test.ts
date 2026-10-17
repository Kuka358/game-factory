
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

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
    ReconciledAcceptanceContract
} from "../src/contracts/AcceptanceContract.js";

import type {
    HorizontalControllerBehaviorSpec
} from "../src/contracts/ExecutableBehaviorSpec.js";

import {
    DEFAULT_FREEFORM_RUNTIME_POLICY
} from "../src/contracts/FreeformRuntimePolicy.js";

import {
    createTaskGraphDigest
} from "../src/validation/AcceptanceTestPlanValidator.js";

import {
    createAcceptanceContractDigest
} from "../src/validation/ExecutableBehaviorSpecValidator.js";

import {
    CloudExecutableBehaviorPlanner,
    type ExecutableBehaviorPlanningInput
} from "../src/cloud/CloudExecutableBehaviorPlanner.js";

function hash(value: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(value), "utf8")
        .digest("hex");
}

function fixture(): {
    input: ExecutableBehaviorPlanningInput;
    spec: HorizontalControllerBehaviorSpec;
} {
    const blueprint: FreeformBlueprint = {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Brick Breaker",
        pitch: "Break bricks with a paddle",
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
            input: "arrow keys",
            description: "Horizontal movement"
        }],
        mechanics: [{
            id: "paddle",
            rules: ["Move horizontally"],
            failureModes: ["Paddle leaves viewport"]
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
            id: "paddle_movement",
            scenario: "Move the paddle",
            expected: "Paddle stays inside viewport"
        }],
        constraints: {
            offlineRuntime: true,
            noRemoteCode: true,
            scope: "small-2d"
        }
    };

    const graph: TaskGraph = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        revision: 1,
        tasks: [{
            id: "paddle",
            title: "Paddle movement",
            objective: "Implement controlled motion",
            dependsOn: [],
            allowedPaths: ["src/game/Paddle.ts"],
            readPaths: ["src/game/constants.ts"],
            interfaces: [],
            acceptance: [
                "Paddle moves horizontally."
            ],
            checks: ["tsc"],
            estimatedComplexity: "small",
            maxLocalAttempts: 3
        }]
    };

    const referenceFiles = [{
        path: "src/game/constants.ts",
        content: "export const PADDLE = { speed: 7 };\n"
    }];

    const contract: ReconciledAcceptanceContract = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        taskId: "paddle",
        graphRevision: 1,
        graphDigest: createTaskGraphDigest(graph),
        referenceDigest: hash(referenceFiles),
        profile: "continuous_motion",
        timeModel: "delta_ms",
        rules: [{
            question: "How should time be handled?",
            classification: "binding",
            rule: "Use elapsed milliseconds."
        }],
        clarificationDigest: "a".repeat(64),
        runtimePolicyDigest: hash(
            DEFAULT_FREEFORM_RUNTIME_POLICY
        )
    };

    const spec: HorizontalControllerBehaviorSpec = {
        schemaVersion: "1.0",
        kind: "horizontal_boolean_controller",
        contractDigest:
            createAcceptanceContractDigest(contract),
        sourcePath: "src/game/Paddle.ts",
        className: "Paddle",
        update: {
            method: "update",
            deltaArgumentIndex: 1,
            deltaUnit: "milliseconds"
        },
        controls: {
            negative: "left",
            positive: "right",
            simultaneous: "cancel",
            released: "stop"
        },
        coordinates: {
            xOrigin: "center",
            yOrigin: "center",
            initialX: "viewport_center",
            yBehavior: "fixed",
            horizontalBounds: "half_width_clamp"
        },
        speed: {
            sourcePath: "src/game/constants.ts",
            exportName: "PADDLE",
            property: "speed",
            unit: "pixels_per_nominal_frame",
            referenceFps: 60
        }
    };

    return {
        input: {
            blueprint,
            graph,
            contract,
            referenceFiles,
            expectedTarget: {
                sourcePath: "src/game/Paddle.ts",
                className: "Paddle"
            },
            trustedSpeed: {
                ...spec.speed
            }
        },
        spec
    };
}

function fakeProvider(...outputs: unknown[]) {
    const requests: AIRequest[] = [];

    const provider: AIProvider = {
        id: "fake-cloud",

        async generate<T>(
            request: AIRequest
        ): Promise<AIResponse<T>> {
            requests.push(request);

            const index = Math.min(
                requests.length - 1,
                outputs.length - 1
            );

            return {
                data: outputs[index] as T,
                provider: "fake-cloud",
                model: request.model
            };
        }
    };

    return { provider, requests };
}

function planner(provider: AIProvider) {
    return new CloudExecutableBehaviorPlanner({
        provider,
        model: "test-model"
    });
}

describe("CloudExecutableBehaviorPlanner", () => {
    it("creates a validated behavior specification", async () => {
        const { input, spec } = fixture();
        const { provider, requests } = fakeProvider(spec);

        const result = await planner(provider).plan(input);

        expect(result.spec.kind).toBe(
            "horizontal_boolean_controller"
        );

        expect(result.spec.className).toBe("Paddle");
        expect(result.spec.speed).toEqual(
            input.trustedSpeed
        );

        expect(result.metadata.attempts).toBe(1);
        expect(requests).toHaveLength(1);

        expect(
            requests[0]?.structuredOutput?.name
        ).toBe("freeform_executable_behavior");
    });

    it("repairs an invented speed unit", async () => {
        const { input, spec } = fixture();

        const invalid = {
            ...spec,
            speed: {
                sourcePath: "src/game/constants.ts",
                exportName: "PADDLE",
                property: "speed",
                unit: "pixels_per_second"
            }
        };

        const { provider, requests } = fakeProvider(
            invalid,
            spec
        );

        const result = await planner(provider).plan(input);

        expect(result.metadata.attempts).toBe(2);
        expect(result.spec.speed).toEqual(
            input.trustedSpeed
        );

        expect(
            JSON.stringify(requests[1]!.messages)
        ).toContain("Speed definition differs");
    });

    it("rejects repeated target substitutions", async () => {
        const { input, spec } = fixture();

        const forged = {
            ...spec,
            className: "DifferentPaddle"
        };

        const { provider, requests } = fakeProvider(forged);

        await expect(
            planner(provider).plan(input)
        ).rejects.toThrow("after 2 attempts");

        expect(requests).toHaveLength(2);
    });

    it("repairs an invalid delta signature", async () => {
        const { input, spec } = fixture();

        const invalid = {
            ...spec,
            update: {
                ...spec.update,
                deltaArgumentIndex: -1
            }
        };

        const { provider, requests } = fakeProvider(
            invalid,
            spec
        );

        const result = await planner(provider).plan(input);

        expect(result.metadata.attempts).toBe(2);
        expect(
            result.spec.update.deltaArgumentIndex
        ).toBe(1);

        expect(requests).toHaveLength(2);
    });

    it("rejects stale reference context before AI", async () => {
        const { input, spec } = fixture();

        input.referenceFiles = [{
            path: "src/game/constants.ts",
            content: "export const PADDLE = { speed: 999 };"
        }];

        const { provider, requests } = fakeProvider(spec);

        await expect(
            planner(provider).plan(input)
        ).rejects.toThrow(
            "Reference context digest mismatch"
        );

        expect(requests).toHaveLength(0);
    });

    it("attaches contract digest without asking AI", async () => {
        const { input, spec } = fixture();

        // The real provider now returns a payload
        // WITHOUT a contractDigest field.
        const {
            contractDigest: _omitted,
            ...aiOutput
        } = spec;

        const { provider, requests } = fakeProvider(
            aiOutput
        );

        const result = await planner(provider).plan(
            input
        );

        expect(result.spec.contractDigest).toBe(
            createAcceptanceContractDigest(
                input.contract
            )
        );

        expect(result.metadata.attempts).toBe(1);
        expect(requests).toHaveLength(1);

        const schema = requests[0]!
            .structuredOutput!.schema as {
                required: string[];
                properties: Record<string, unknown>;
            };

        expect(schema.required).not.toContain(
            "contractDigest"
        );

        expect(schema.properties).not.toHaveProperty(
            "contractDigest"
        );
    });

    it("rejects changed TaskGraph before AI", async () => {
        const { input, spec } = fixture();

        input.graph.tasks[0]!.objective =
            "An unexpected new objective";

        const { provider, requests } = fakeProvider(spec);

        await expect(
            planner(provider).plan(input)
        ).rejects.toThrow(
            "Acceptance contract references a different TaskGraph"
        );

        expect(requests).toHaveLength(0);
    });

    it("rejects invalid trusted speed before AI", async () => {
        const { input, spec } = fixture();

        input.trustedSpeed = {
            sourcePath: "src/game/constants.ts",
            exportName: "PADDLE",
            property: "speed",
            unit: "pixels_per_nominal_frame",
            referenceFps: 0
        };

        const { provider, requests } = fakeProvider(spec);

        await expect(
            planner(provider).plan(input)
        ).rejects.toThrow(
            "Invalid trusted nominal FPS"
        );

        expect(requests).toHaveLength(0);
    });
});
