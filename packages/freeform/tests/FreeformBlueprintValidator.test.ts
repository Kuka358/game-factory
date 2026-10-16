
import {
    describe,
    expect,
    it
} from "vitest";

import {
    validateFreeformBlueprint
} from "../src/validation/FreeformBlueprintValidator.js";

import type {
    FreeformBlueprint
} from "../src/contracts/FreeformBlueprint.js";

function createBlueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "breakout",
        title: "Breakout",
        pitch: "A classic brick-breaking game",
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
            input: "keyboard arrows",
            description: "Move the paddle horizontally"
        }],
        mechanics: [{
            id: "ball",
            rules: ["Ball bounces off walls and paddle"],
            failureModes: ["Ball falls below paddle"]
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
        assets: [{
            id: "paddle",
            role: "player paddle",
            description: "Simple horizontal paddle",
            profile: "item",
            width: 96,
            height: 24,
            transparent: true,
            optional: true,
            filename: "assets/paddle.png"
        }],
        acceptance: [{
            id: "ball_bounces",
            scenario: "Ball touches the paddle",
            expected: "Ball changes direction"
        }],
        constraints: {
            offlineRuntime: true,
            noRemoteCode: true,
            scope: "small-2d"
        }
    };
}

describe("validateFreeformBlueprint", () => {
    it("accepts a valid Breakout blueprint", () => {
        const blueprint = createBlueprint();
        const result = validateFreeformBlueprint(blueprint);

        expect(result).toEqual({
            valid: true,
            data: blueprint
        });
    });

    it("rejects unsupported technology", () => {
        const blueprint = {
            ...createBlueprint(),
            technology: {
                engine: "unity",
                language: "csharp"
            }
        };

        expect(
            validateFreeformBlueprint(blueprint).valid
        ).toBe(false);
    });

    it("rejects duplicate asset IDs", () => {
        const blueprint = createBlueprint();

        blueprint.assets.push({
            ...blueprint.assets[0]!,
            filename: "assets/paddle_copy.png"
        });

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/assets/1/id",
                message: "Duplicate assets ID: paddle"
            });
        }
    });

    it("rejects unsafe asset paths", () => {
        const blueprint = createBlueprint();
        blueprint.assets[0]!.filename = "../private/secret.png";

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);
    });

    it("rejects duplicate asset filenames", () => {
        const blueprint = createBlueprint();

        blueprint.assets.push({
            ...blueprint.assets[0]!,
            id: "paddle_copy"
        });

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/assets/1/filename",
                message: "Duplicate asset filename"
            });
        }
    });

    it("rejects incorrect viewport orientation", () => {
        const blueprint = createBlueprint();

        blueprint.viewport.width = 600;
        blueprint.viewport.height = 800;

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);
    });

    it("rejects unknown properties", () => {
        const blueprint = {
            ...createBlueprint(),
            arbitraryCommand: "delete everything"
        };

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);
    });

    it("rejects an invalid schema version", () => {
        const blueprint = {
            ...createBlueprint(),
            schemaVersion: "2.0"
        };

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);
    });

    it("rejects remote code execution", () => {
        const blueprint = {
            ...createBlueprint(),
            constraints: {
                offlineRuntime: true,
                noRemoteCode: false,
                scope: "small-2d"
            }
        };

        const result = validateFreeformBlueprint(blueprint);

        expect(result.valid).toBe(false);
    });
});
