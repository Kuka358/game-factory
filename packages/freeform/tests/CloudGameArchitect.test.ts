
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

import {
    CloudGameArchitect
} from "../src/cloud/CloudGameArchitect.js";

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
                inputTokens: 100,
                outputTokens: 200,
                totalTokens: 300
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
            action: "move",
            input: "arrows",
            description: "Move paddle"
        }],
        mechanics: [{
            id: "ball",
            rules: ["Ball bounces"],
            failureModes: ["Ball falls"]
        }],
        scenes: [{
            id: "game",
            purpose: "Gameplay",
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

describe("CloudGameArchitect", () => {
    it("generates and validates a Blueprint", async () => {
        const provider = new FakeCloudProvider(
            createBlueprint()
        );

        const architect = new CloudGameArchitect({
            provider,
            model: "test-cloud-model"
        });

        const result = await architect.design({
            prompt: "Make Breakout",
            target: "web",
            orientation: "landscape"
        });

        expect(result.blueprint.id).toBe("breakout");
        expect(result.metadata.provider).toBe("fake-cloud");
        expect(result.metadata.usage?.totalTokens).toBe(300);

        expect(provider.requests).toHaveLength(1);
        expect(
            provider.requests[0]?.structuredOutput?.name
        ).toBe("freeform_blueprint");

        const schema =
            provider.requests[0]?.structuredOutput?.schema;

        expect(schema).toMatchObject({
            type: "object",
            additionalProperties: false
        });

        expect(JSON.stringify(schema)).not.toContain(
            '"pattern"'
        );
    });

    it("rejects an invalid model response", async () => {
        const provider = new FakeCloudProvider({
            title: "Broken"
        });

        const architect = new CloudGameArchitect({
            provider,
            model: "test-cloud-model"
        });

        await expect(
            architect.design({ prompt: "Make Breakout" })
        ).rejects.toThrow(
            "Cloud Architect returned invalid Blueprint"
        );
    });

    it("rejects incorrect target", async () => {
        const blueprint = createBlueprint();
        blueprint.target = "yandex";

        const architect = new CloudGameArchitect({
            provider: new FakeCloudProvider(blueprint),
            model: "test-cloud-model"
        });

        await expect(
            architect.design({
                prompt: "Make Breakout",
                target: "web"
            })
        ).rejects.toThrow("target mismatch");
    });

    it("rejects an empty prompt", async () => {
        const provider = new FakeCloudProvider(
            createBlueprint()
        );

        const architect = new CloudGameArchitect({
            provider,
            model: "test-cloud-model"
        });

        await expect(
            architect.design({ prompt: "   " })
        ).rejects.toThrow();

        expect(provider.requests).toHaveLength(0);
    });

    it("rejects online-only runtime", async () => {
        const blueprint = createBlueprint();
        blueprint.constraints.offlineRuntime = false;

        const architect = new CloudGameArchitect({
            provider: new FakeCloudProvider(blueprint),
            model: "test-cloud-model"
        });

        await expect(
            architect.design({ prompt: "Make Breakout" })
        ).rejects.toThrow("offline runtime");
    });
});
