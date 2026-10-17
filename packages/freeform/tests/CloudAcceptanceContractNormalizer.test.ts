
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
    AcceptanceTestPlan
} from "../src/contracts/AcceptanceTestPlan.js";

import type {
    AcceptanceClarification
} from "../src/cloud/CloudAcceptanceClarifier.js";

import type {
    AcceptanceContractCandidate
} from "../src/contracts/AcceptanceContract.js";

import {
    createTaskGraphDigest
} from "../src/validation/AcceptanceTestPlanValidator.js";

import {
    CloudAcceptanceContractNormalizer,
    type AcceptanceContractNormalizationInput
} from "../src/cloud/CloudAcceptanceContractNormalizer.js";

function fixture(): {
    input: AcceptanceContractNormalizationInput;
    candidate: AcceptanceContractCandidate;
} {
    const blueprint: FreeformBlueprint = {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Brick Breaker",
        pitch: "Break bricks with a ball",
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
            id: "paddle",
            rules: ["Move and clamp horizontally"],
            failureModes: ["Paddle leaves the screen"]
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
            id: "paddle_movement",
            scenario: "Move the paddle",
            expected: "Paddle stays within bounds"
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
            objective: "Implement horizontal movement",
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

    const graphDigest = createTaskGraphDigest(graph);

    const questions = [
        "What is the time model?",
        "What is the X coordinate convention?"
    ];

    const draftPlan: AcceptanceTestPlan = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphRevision: 1,
        graphDigest,
        taskId: "paddle",
        scenarios: [{
            id: "movement",
            requirement: "Paddle moves horizontally.",
            level: "unit",
            setup: ["Create paddle"],
            actions: ["Apply right input"],
            assertions: ["X increases"]
        }],
        unresolvedQuestions: questions
    };

    const referenceFiles = [{
        path: "src/game/constants.ts",
        content: "export const PADDLE = { speed: 7 };\n"
    }];

    const referenceDigest = createHash("sha256")
        .update(JSON.stringify(referenceFiles), "utf8")
        .digest("hex");

    const clarification: AcceptanceClarification = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphDigest,
        taskId: "paddle",
        referenceDigest,
        answers: [{
            question: questions[0]!,
            classification: "binding",
            resolution:
                "Movement uses elapsed frame time.",
            rationale: "Required for deterministic motion."
        }, {
            question: questions[1]!,
            classification: "binding",
            resolution:
                "X is the center of the paddle.",
            rationale: "Defines collision geometry."
        }]
    };

    const candidate: AcceptanceContractCandidate = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        taskId: "paddle",
        graphDigest,
        referenceDigest,
        profile: "continuous_motion",
        timeModel: "delta_ms",
        rules: [{
            question: questions[0]!,
            classification: "binding",
            rule: "Movement uses elapsed milliseconds."
        }, {
            question: questions[1]!,
            classification: "binding",
            rule: "X represents the paddle center."
        }]
    };

    return {
        input: {
            blueprint,
            graph,
            draftPlan,
            clarification,
            referenceFiles,
            expectedProfile: "continuous_motion"
        },
        candidate
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

            return {
                data: outputs[
                    Math.min(
                        requests.length - 1,
                        outputs.length - 1
                    )
                ] as T,
                provider: "fake-cloud",
                model: request.model
            };
        }
    };

    return { provider, requests };
}

function normalizer(provider: AIProvider) {
    return new CloudAcceptanceContractNormalizer({
        provider,
        model: "test-model"
    });
}

describe("CloudAcceptanceContractNormalizer", () => {
    it("normalizes a valid motion contract", async () => {
        const { input, candidate } = fixture();
        const { provider, requests } = fakeProvider(candidate);

        const result = await normalizer(provider).normalize(
            input
        );

        expect(result.contract.timeModel).toBe("delta_ms");
        expect(result.contract.rules).toHaveLength(2);
        expect(result.contract.runtimePolicyDigest)
            .toMatch(/^[a-f0-9]{64}$/);

        expect(result.metadata.attempts).toBe(1);
        expect(requests).toHaveLength(1);

        expect(
            requests[0]?.structuredOutput?.name
        ).toBe("freeform_acceptance_contract");
    });

    it("retries a forbidden motion time model", async () => {
        const { input, candidate } = fixture();

        const invalid = {
            ...candidate,
            timeModel: "not_applicable"
        };

        const { provider, requests } = fakeProvider(
            invalid,
            candidate
        );

        const result = await normalizer(provider).normalize(
            input
        );

        expect(result.metadata.attempts).toBe(2);
        expect(result.contract.timeModel).toBe("delta_ms");
        expect(requests).toHaveLength(2);

        expect(
            JSON.stringify(requests[1]!.messages)
        ).toContain("PREVIOUS CONTRACT WAS REJECTED");

        expect(
            JSON.stringify(requests[1]!.messages)
        ).toContain("Runtime Policy");
    });

    it("rejects repeated invalid output", async () => {
        const { input, candidate } = fixture();

        const { provider, requests } = fakeProvider({
            ...candidate,
            timeModel: "per_render_call"
        });

        await expect(
            normalizer(provider).normalize(input)
        ).rejects.toThrow("after 2 attempts");

        expect(requests).toHaveLength(2);
    });

    it("rejects unresolved questions before calling AI", async () => {
        const { input, candidate } = fixture();

        input.clarification.answers[0]!.classification =
            "unresolved";

        const { provider, requests } = fakeProvider(candidate);

        await expect(
            normalizer(provider).normalize(input)
        ).rejects.toThrow(
            "Unresolved acceptance specifications"
        );

        expect(requests).toHaveLength(0);
    });

    it("rejects modified trusted reference content", async () => {
        const { input, candidate } = fixture();

        input.referenceFiles = [{
            path: "src/game/constants.ts",
            content: "export const PADDLE = { speed: 999 };"
        }];

        const { provider, requests } = fakeProvider(candidate);

        await expect(
            normalizer(provider).normalize(input)
        ).rejects.toThrow("Invalid clarification");

        expect(requests).toHaveLength(0);
    });

    it("never accepts candidate source as a reference", async () => {
        const { input, candidate } = fixture();

        input.referenceFiles = [{
            path: "src/game/Paddle.ts",
            content: "export class Paddle {}"
        }];

        const { provider, requests } = fakeProvider(candidate);

        await expect(
            normalizer(provider).normalize(input)
        ).rejects.toThrow(
            "Invalid acceptance reference file"
        );

        expect(requests).toHaveLength(0);
    });

    it("rejects a forged runtime profile", async () => {
        const { input, candidate } = fixture();

        const forged = {
            ...candidate,
            profile: "other",
            timeModel: "not_applicable"
        };

        const { provider } = fakeProvider(forged);

        await expect(
            normalizer(provider).normalize(input)
        ).rejects.toThrow("after 2 attempts");
    });
});
