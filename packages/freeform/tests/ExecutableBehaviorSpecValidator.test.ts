
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type {
    ImplementationTask
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
    createAcceptanceContractDigest,
    validateExecutableBehaviorSpec,
    resolveSpeedPixelsPerSecond
} from "../src/validation/ExecutableBehaviorSpecValidator.js";

const task: ImplementationTask = {
    id: "paddle",
    title: "Paddle",
    objective: "Implement horizontal paddle movement",
    dependsOn: [],
    allowedPaths: ["src/game/Paddle.ts"],
    readPaths: ["src/game/constants.ts"],
    interfaces: [],
    acceptance: ["Move and clamp paddle"],
    checks: ["tsc"],
    estimatedComplexity: "small",
    maxLocalAttempts: 3
};

function contract(): ReconciledAcceptanceContract {
    return {
        schemaVersion: "1.0",
        blueprintId: "breakout",
        taskId: "paddle",
        graphDigest: "a".repeat(64),
        referenceDigest: "b".repeat(64),
        profile: "continuous_motion",
        timeModel: "delta_ms",
        rules: [],
        graphRevision: 1,
        clarificationDigest: "c".repeat(64),
        runtimePolicyDigest: createHash("sha256")
            .update(
                JSON.stringify(
                    DEFAULT_FREEFORM_RUNTIME_POLICY
                )
            )
            .digest("hex")
    };
}

function spec(
    source: ReconciledAcceptanceContract
): HorizontalControllerBehaviorSpec {
    return {
        schemaVersion: "1.0",
        kind: "horizontal_boolean_controller",
        contractDigest:
            createAcceptanceContractDigest(source),
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
}

function invalid(value: unknown): void {
    expect(
        validateExecutableBehaviorSpec(
            value,
            task,
            contract()
        ).valid
    ).toBe(false);
}

describe("ExecutableBehaviorSpecValidator", () => {
    it("accepts a valid horizontal motion spec", () => {
        const source = contract();

        expect(
            validateExecutableBehaviorSpec(
                spec(source),
                task,
                source
            ).valid
        ).toBe(true);
    });

    it("rejects a changed normalized contract", () => {
        const source = contract();
        const value = spec(source);

        source.rules.push({
            question: "Changed",
            classification: "binding",
            rule: "Changed contract"
        });

        const result = validateExecutableBehaviorSpec(
            value,
            task,
            source
        );

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/contractDigest",
                message: "Normalized contract digest mismatch"
            });
        }
    });

    it("rejects source paths outside the task", () => {
        const value = spec(contract());

        value.sourcePath = "src/game/Ball.ts";

        invalid(value);
    });

    it("rejects writable speed references", () => {
        const value = spec(contract());

        value.speed.sourcePath = "src/game/Paddle.ts";

        invalid(value);
    });

    it("rejects movement without delta", () => {
        const value = {
            ...spec(contract()),
            update: {
                method: "update",
                deltaArgumentIndex: -1,
                deltaUnit: "milliseconds"
            }
        };

        invalid(value);
    });

    it("rejects per-call speed units", () => {
        const value = spec(contract());

        const forged = {
            ...value,
            speed: {
                ...value.speed,
                unit: "pixels_per_render_call"
            }
        };

        invalid(forged);
    });

    it("rejects missing nominal FPS", () => {
        const value = spec(contract());

        const { referenceFps: _, ...speed } =
            value.speed.unit === "pixels_per_nominal_frame"
                ? value.speed
                : {
                    ...value.speed,
                    referenceFps: 60
                };

        invalid({
            ...value,
            speed
        });
    });

    it("rejects identical opposing controls", () => {
        const value = spec(contract());

        value.controls.positive = "left";

        invalid(value);
    });

    it("rejects an unsupported contract time model", () => {
        const source = contract();
        const value = spec(source);

        source.timeModel = "engine_managed";

        expect(
            validateExecutableBehaviorSpec(
                value,
                task,
                source
            ).valid
        ).toBe(false);
    });

    it("converts nominal-frame speed into px/s", () => {
        const value = spec(contract());

        expect(
            resolveSpeedPixelsPerSecond(value, 7)
        ).toBe(420);
    });

    it("rejects invalid numeric speeds", () => {
        const value = spec(contract());

        expect(() =>
            resolveSpeedPixelsPerSecond(value, Number.NaN)
        ).toThrow("positive finite number");

        expect(() =>
            resolveSpeedPixelsPerSecond(value, -7)
        ).toThrow("positive finite number");
    });
});
