
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

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

import type {
    AcceptanceContractCandidate
} from "../src/contracts/AcceptanceContract.js";

import {
    createTaskGraphDigest
} from "../src/validation/AcceptanceTestPlanValidator.js";

import {
    reconcileAcceptanceContract,
    type ReconcileAcceptanceContractInput
} from "../src/validation/AcceptanceContractReconciler.js";

function createFixture(): ReconcileAcceptanceContractInput {
    const blueprint: FreeformBlueprint = {
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
            description: "Move horizontally"
        }],
        mechanics: [{
            id: "paddle",
            rules: ["Horizontal movement"],
            failureModes: ["Paddle escapes field"]
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
            id: "move",
            scenario: "Move paddle",
            expected: "Paddle moves correctly"
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
                "Paddle moves horizontally.",
                "Paddle stays inside viewport bounds."
            ],
            checks: ["tsc"],
            estimatedComplexity: "small",
            maxLocalAttempts: 3
        }]
    };

    const graphDigest = createTaskGraphDigest(graph);

    const questions = [
        "What time model does movement use?",
        "What does paddle.x represent?"
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
            setup: ["Create a paddle"],
            actions: ["Apply horizontal input"],
            assertions: ["Paddle position changes"]
        }],
        unresolvedQuestions: questions
    };

    const referenceFiles: AcceptanceReferenceFile[] = [{
        path: "src/game/constants.ts",
        content: "export const PADDLE = { speed: 7 };\n"
    }];

    const referenceDigest = createHash("sha256")
        .update(JSON.stringify(referenceFiles), "utf8")
        .digest("hex");

    const clarification: AcceptanceClarification = {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        taskId: "paddle",
        graphDigest,
        referenceDigest,
        answers: [{
            question: questions[0]!,
            classification: "binding",
            resolution: "Use elapsed time for motion.",
            rationale: "Frame-rate independence."
        }, {
            question: questions[1]!,
            classification: "binding",
            resolution: "X represents the paddle center.",
            rationale: "Consistent boundary geometry."
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
            rule: "Use delta milliseconds."
        }, {
            question: questions[1]!,
            classification: "binding",
            rule: "X is the paddle center."
        }]
    };

    return {
        blueprint,
        graph,
        draftPlan,
        clarification,
        referenceFiles,
        expectedProfile: "continuous_motion",
        candidate
    };
}

describe("AcceptanceContractReconciler", () => {
    it("accepts a valid motion contract", () => {
        const result = reconcileAcceptanceContract(
            createFixture()
        );

        expect(result.timeModel).toBe("delta_ms");
        expect(result.graphRevision).toBe(1);
        expect(result.rules).toHaveLength(2);

        expect(result.graphDigest).toMatch(
            /^[a-f0-9]{64}$/
        );

        expect(result.clarificationDigest).toMatch(
            /^[a-f0-9]{64}$/
        );

        expect(result.runtimePolicyDigest).toMatch(
            /^[a-f0-9]{64}$/
        );
    });

    it("rejects a missing motion time model", () => {
        const input = createFixture();

        const candidate = {
            ...(input.candidate as AcceptanceContractCandidate),
            timeModel: "not_applicable"
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("violates Runtime Policy");
    });

    it("rejects movement per render call", () => {
        const input = createFixture();

        const candidate = {
            ...(input.candidate as AcceptanceContractCandidate),
            timeModel: "per_render_call"
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Invalid normalized acceptance contract");
    });

    it("rejects an untrusted runtime profile", () => {
        const input = createFixture();

        const candidate = {
            ...(input.candidate as AcceptanceContractCandidate),
            profile: "other",
            timeModel: "not_applicable"
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Runtime profile differs");
    });

    it("rejects missing normalized rules", () => {
        const input = createFixture();

        const candidate = {
            ...(input.candidate as AcceptanceContractCandidate),
            rules: (
                input.candidate as AcceptanceContractCandidate
            ).rules.slice(0, 1)
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Missing normalized rule");
    });

    it("rejects duplicate normalized rules", () => {
        const input = createFixture();

        const original =
            input.candidate as AcceptanceContractCandidate;

        const candidate = {
            ...original,
            rules: [
                original.rules[0],
                original.rules[0]
            ]
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Duplicate normalized rule");
    });

    it("rejects unknown questions", () => {
        const input = createFixture();

        const original =
            input.candidate as AcceptanceContractCandidate;

        const candidate = {
            ...original,
            rules: original.rules.map((rule, index) =>
                index === 0
                    ? {
                        ...rule,
                        question: "An invented question"
                    }
                    : rule
            )
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Unknown normalized rule");
    });

    it("rejects changed classifications", () => {
        const input = createFixture();

        const original =
            input.candidate as AcceptanceContractCandidate;

        const candidate = {
            ...original,
            rules: original.rules.map((rule, index) =>
                index === 0
                    ? {
                        ...rule,
                        classification: "non_blocking"
                    }
                    : rule
            )
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("Changed clarification classification");
    });

    it("rejects changed reference content", () => {
        const input = createFixture();

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                referenceFiles: [{
                    path: "src/game/constants.ts",
                    content: "export const PADDLE = { speed: 999 };\n"
                }]
            })
        ).toThrow("Invalid clarification");
    });

    it("rejects candidate source identity mismatch", () => {
        const input = createFixture();

        const candidate = {
            ...(input.candidate as AcceptanceContractCandidate),
            graphDigest: "0".repeat(64)
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                candidate
            })
        ).toThrow("identity mismatch");
    });

    it("rejects unresolved clarifications", () => {
        const input = createFixture();

        const clarification = {
            ...input.clarification,
            answers: input.clarification.answers.map(
                (answer, index) => ({
                    ...answer,
                    classification:
                        index === 0
                            ? "unresolved" as const
                            : answer.classification
                })
            )
        };

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                clarification
            })
        ).toThrow("Unresolved acceptance specifications");
    });

    it("refuses implementation files as references", () => {
        const input = createFixture();

        expect(() =>
            reconcileAcceptanceContract({
                ...input,
                referenceFiles: [{
                    path: "src/game/Paddle.ts",
                    content: "export class Paddle {}"
                }]
            })
        ).toThrow("Invalid reference file");
    });
});
