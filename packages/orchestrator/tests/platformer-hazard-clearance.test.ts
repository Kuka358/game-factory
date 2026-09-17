import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isPlatformerGameSpec, validateGameSpec } from "@game-factory/game-spec";
import { ARCADE_GRAVITY_Y, ARCADE_PHYSICS_FPS, PLATFORMER_BODIES, PLATFORMER_ENTITY_HEIGHTS } from "../../runtime/src/platformer-physics.js";
import { hazardHeightAboveSurface } from "../../engine-phaser/src/templates/platformer/hazard-clearance.js";
import { generatePlatformerLevel } from "../../engine-phaser/src/templates/platformer/PlatformerLevelGenerator.js";

describe("physics-derived exposed hazard height", () => {
    it("retains a lethal obstacle while allowing the full body span during a low jump", () => {
        const movement = { move_speed: 200, jump_force: 300 };
        const exposure = hazardHeightAboveSurface(movement) + PLATFORMER_BODIES.hazard.height / 2;
        expect(exposure).toBeGreaterThan(0);
        expect(exposure).toBeLessThan(34);
        const effectiveForce = movement.jump_force - ARCADE_GRAVITY_Y / (2 * ARCADE_PHYSICS_FPS);
        const duration = 2 * Math.sqrt(effectiveForce ** 2 - 2 * ARCADE_GRAVITY_Y * exposure) / ARCADE_GRAVITY_Y;
        expect(duration * movement.move_speed).toBeGreaterThan(PLATFORMER_BODIES.player.width + PLATFORMER_BODIES.hazard.width + 2 * movement.move_speed / ARCADE_PHYSICS_FPS);
    });
    it("preserves ordinary difficult hazards and does not conceal unfixable ones", () => {
        for (const movement of [{ move_speed: 420, jump_force: 640 }, { move_speed: 320, jump_force: 900 },
            { move_speed: 20, jump_force: 300 }, { move_speed: 200, jump_force: 100 }]) {
            expect(hazardHeightAboveSurface(movement)).toBe(PLATFORMER_ENTITY_HEIGHTS.hazard);
        }
    });
    it("keeps seeds deterministic, hazard density and platform variation", async () => {
        const result = validateGameSpec(JSON.parse(await readFile(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")));
        if (!result.valid || !isPlatformerGameSpec(result.data)) throw new Error("Invalid fixture");
        const spec = structuredClone(result.data);
        spec.player.movement = { move_speed: 200, jump_force: 300 };
        spec.platformer.enemy_density = 0;
        spec.platformer.hazard_density = 1;
        for (const seed of [7, 19, 83]) {
            spec.generation.seed = seed;
            const level = generatePlatformerLevel({ spec, viewportHeight: 720 });
            expect(generatePlatformerLevel({ spec, viewportHeight: 720 })).toEqual(level);
            expect(level.hazards).toHaveLength(level.platforms.length - 3);
            expect(new Set(level.platforms.map(p => p.y)).size).toBeGreaterThan(1);
            for (const hazard of level.hazards) {
                const platform = level.platforms[hazard.platformIndex]!;
                const exposure = platform.y - platform.height / 2 - hazard.y + PLATFORMER_BODIES.hazard.height / 2;
                expect(exposure).toBeGreaterThan(0);
                expect(exposure).toBeLessThan(34);
            }
        }
    });
});
