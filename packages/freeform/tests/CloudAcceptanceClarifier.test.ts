
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
    AcceptanceClarification,
    AcceptanceReferenceFile
} from "../src/cloud/CloudAcceptanceClarifier.js";

import {
    CloudAcceptanceClarifier,
    assertClarificationReady,
    validateAcceptanceClarification
} from "../src/cloud/CloudAcceptanceClarifier.js";

import {
    createTaskGraphDigest
} from "../src/validation/AcceptanceTestPlanValidator.js";

function blueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Brick Breaker",
        pitch: "Break bricks with a bouncing ball",
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
            description: "Move paddle horizontally"
        }],
        mechanics: [{
            id: "paddle",
            rules: ["Horizontal movement"],
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
            scenario: "Move paddle",
            expected: "Paddle moves and stops"
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
            objective: "Implement horizontal movement",
            dependsOn: [],
            allowedPaths: ["src/game/Paddle.ts"],
            readPaths: ["src/game/constants.ts"],
            interfaces: [],
            acceptance: [
                "Paddle moves horizontally.",
                "Paddle stops when input is released."
            ],
            checks: ["tsc"],
            estimatedComplexity: "small",
            maxLocalAttempts: 3
        }]
    };
}

const questions = [
    "What input shape does update accept?",
    "What is the paddle speed unit?"
];

const references: AcceptanceReferenceFile[] = [{
    path: "src/game/constants.ts",
    content: "export const PADDLE = { speed: 7 };\n"
}];

const referenceDigest = createHash("sha256")
    .update(JSON.stringify(references), "utf8")
    .digest("hex");

function draft(source: TaskGraph): AcceptanceTestPlan {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphRevision: source.revision,
        graphDigest: createTaskGraphDigest(source),
        taskId: "paddle",
        scenarios: [{
            id: "move",
            requirement: "Paddle moves horizontally.",
            level: "unit",
            setup: ["Create a paddle"],
            actions: ["Apply right input"],
            assertions: ["X increases"]
        }],
        unresolvedQuestions: [...questions]
    };
}

function clarification(
    source: TaskGraph
): AcceptanceClarification {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        graphDigest: createTaskGraphDigest(source),
        taskId: "paddle",
        referenceDigest,
        answers: [
            {
                question: questions[0]!,
                classification: "binding",
                resolution:
                    "update accepts left and right boolean flags.",
                rationale:
                    "A deterministic input contract is required."
            },
            {
                question: questions[1]!,
                classification: "binding",
                resolution:
                    "Speed is expressed in pixels per second.",
                rationale:
                    "Time units must be consistent."
            }
        ]
    };
}

function fakeProvider(outputs: unknown[]) {
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

describe("CloudAcceptanceClarifier", () => {
    it("returns valid binding decisions", async () => {
        const source = graph();
        const { provider, requests } = fakeProvider([
            clarification(source)
        ]);

        const clarifier = new CloudAcceptanceClarifier({
            provider,
            model: "test-model"
        });

        const result = await clarifier.clarify({
            blueprint: blueprint(),
            graph: source,
            draftPlan: draft(source),
            referenceFiles: references
        });

        expect(result.clarification.answers).toHaveLength(2);
        expect(requests).toHaveLength(1);

        expect(
            requests[0]?.structuredOutput?.name
        ).toBe("freeform_acceptance_clarification");

        expect(() =>
            assertClarificationReady(result.clarification)
        ).not.toThrow();
    });

    it("retries a mismatched graph digest", async () => {
        const source = graph();

        const invalid = clarification(source);
        invalid.graphDigest = "0".repeat(64);

        const { provider, requests } = fakeProvider([
            invalid,
            clarification(source)
        ]);

        const clarifier = new CloudAcceptanceClarifier({
            provider,
            model: "test-model"
        });

        const result = await clarifier.clarify({
            blueprint: blueprint(),
            graph: source,
            draftPlan: draft(source),
            referenceFiles: references
        });

        expect(requests).toHaveLength(2);
        expect(result.clarification.graphDigest).toBe(
            createTaskGraphDigest(source)
        );

        expect(
            JSON.stringify(requests[1]?.messages)
        ).toContain("PREVIOUS CLARIFICATION WAS REJECTED");
    });

    it("rejects missing and duplicate answers", () => {
        const source = graph();
        const value = clarification(source);

        value.answers[1] = { ...value.answers[0]! };

        const errors = validateAcceptanceClarification(
            value,
            draft(source),
            referenceDigest
        );

        expect(errors.join(" ")).toContain(
            "Duplicate clarification"
        );

        expect(errors.join(" ")).toContain(
            "Missing clarification"
        );
    });

    it("rejects invented clarification questions", () => {
        const source = graph();
        const value = clarification(source);

        value.answers[0]!.question =
            "May the model delete every game file?";

        const errors = validateAcceptanceClarification(
            value,
            draft(source),
            referenceDigest
        );

        expect(errors.join(" ")).toContain(
            "Unknown clarification question"
        );
    });

    it("rejects candidate implementation as reference", async () => {
        const source = graph();
        const { provider, requests } = fakeProvider([
            clarification(source)
        ]);

        const clarifier = new CloudAcceptanceClarifier({
            provider,
            model: "test-model"
        });

        await expect(
            clarifier.clarify({
                blueprint: blueprint(),
                graph: source,
                draftPlan: draft(source),
                referenceFiles: [{
                    path: "src/game/Paddle.ts",
                    content: "/* Candidate implementation */"
                }]
            })
        ).rejects.toThrow(
            "Invalid acceptance reference file"
        );

        expect(requests).toHaveLength(0);
    });

    it("blocks unresolved clarifications", () => {
        const value = clarification(graph());

        value.answers[1]!.classification = "unresolved";

        expect(() =>
            assertClarificationReady(value)
        ).toThrow("Unresolved acceptance specifications");
    });

    it("rejects invalid Blueprint before AI execution", async () => {
        const source = graph();
        const invalid = blueprint();

        invalid.viewport.width = -1;

        const { provider, requests } = fakeProvider([
            clarification(source)
        ]);

        const clarifier = new CloudAcceptanceClarifier({
            provider,
            model: "test-model"
        });

        await expect(
            clarifier.clarify({
                blueprint: invalid,
                graph: source,
                draftPlan: draft(source),
                referenceFiles: references
            })
        ).rejects.toThrow("Invalid Blueprint");

        expect(requests).toHaveLength(0);
    });
});
