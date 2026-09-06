import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPlatformerGameSpec, validateGameSpec } from "@game-factory/game-spec";
import { resolveTemplate } from "@game-factory/templates";
import { createAssetRequirements } from "@game-factory/assets";
import { generatePlatformerLevel } from "../../engine-phaser/src/templates/platformer/PlatformerLevelGenerator.js";
import { runGenerationPipeline } from "../src/run-generation-pipeline.js";

function fixture() {
    const result = validateGameSpec(JSON.parse(readFileSync(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")));
    if (!result.valid || !isPlatformerGameSpec(result.data)) throw new Error("Invalid manual Platformer fixture");
    return result.data;
}

describe("manual Platformer integration", () => {
    it("validates and resolves all eight asset roles through the real template contract", () => {
        const spec = fixture();
        const template = resolveTemplate(spec);
        expect(template.manifest.id).toBe("platformer");
        const requirements = createAssetRequirements(spec);
        expect(requirements.map(requirement => requirement.role)).toEqual([
            "player", "obstacle", "background", "enemy", "collectible", "goal", "level_tiles", "score_icon"
        ]);
        expect(requirements.find(requirement => requirement.role === "level_tiles")?.requirements.generation?.profile).toBe("tileset");
        expect(requirements.find(requirement => requirement.role === "score_icon")?.requirements.generation?.uiKind).toBe("icon");
    });

    it("covers both danger categories and collectibles while keeping spawn and goal safe", () => {
        const layout = generatePlatformerLevel({ spec: fixture(), viewportHeight: 720 });
        expect(layout.enemies.length).toBeGreaterThan(0);
        expect(layout.hazards.length).toBeGreaterThan(0);
        expect(layout.collectibles.length).toBeGreaterThan(0);
        for (const entity of [...layout.enemies, ...layout.hazards, ...layout.collectibles]) {
            expect(entity.platformIndex).toBeGreaterThanOrEqual(2);
            expect(entity.platformIndex).toBeLessThan(layout.platforms.length - 1);
        }
    });

    it("repeats seeded layouts and never uses asset selections or density for platform geometry", () => {
        for (const seed of [0, 1, 42, 12345, 2147483647]) {
            const spec = fixture();
            spec.generation.seed = seed;
            const layout = generatePlatformerLevel({ spec, viewportHeight: 720 });
            expect(generatePlatformerLevel({ spec, viewportHeight: 720 })).toEqual(layout);
            delete spec.assets.additional;
            spec.assets.roles.player.tags = ["a completely different visual shape"];
            expect(generatePlatformerLevel({ spec, viewportHeight: 720 })).toEqual(layout);
            spec.platformer.enemy_density = 0;
            spec.platformer.hazard_density = 0;
            spec.platformer.collectible_density = 0;
            expect(generatePlatformerLevel({ spec, viewportHeight: 720 }).platforms).toEqual(layout.platforms);
        }
        const spec = fixture();
        const first = generatePlatformerLevel({ spec, viewportHeight: 720 });
        spec.generation.seed += 1;
        expect(generatePlatformerLevel({ spec, viewportHeight: 720 }).platforms).not.toEqual(first.platforms);
    });

    it("changing collectible density does not shuffle surviving positions", () => {
        const spec = fixture();
        const all = generatePlatformerLevel({ spec, viewportHeight: 720 });
        spec.platformer.collectible_density = 0.5;
        const fewer = generatePlatformerLevel({ spec, viewportHeight: 720 });
        for (const coin of fewer.collectibles) {
            expect(all.collectibles.find(candidate => candidate.platformIndex === coin.platformIndex)).toMatchObject({ x: coin.x, y: coin.y });
        }
    });

    it("clamps requested gaps and rises to the jump envelope across seeds", () => {
        for (let seed = 0; seed < 100; seed += 1) {
            const spec = fixture();
            spec.generation.seed = seed;
            spec.platformer.platform_gap_min = 320;
            spec.platformer.platform_gap_max = 480;
            spec.platformer.platform_height_variation = 320;
            const layout = generatePlatformerLevel({ spec, viewportHeight: 720 });
            for (let index = 1; index < layout.platforms.length; index += 1) {
                const previous = layout.platforms[index - 1]!;
                const next = layout.platforms[index]!;
                const deltaY = next.y - previous.y;
                const force = spec.player.movement.jump_force;
                const flightTime = (force + Math.sqrt(force * force + 2 * 1200 * deltaY)) / 1200;
                const gap = next.x - next.width / 2 - previous.x - previous.width / 2;
                expect(Number.isFinite(flightTime)).toBe(true);
                expect(gap).toBeGreaterThanOrEqual(0);
                expect(gap).toBeLessThanOrEqual(spec.player.movement.move_speed * flightTime);
            }
        }
    });

    it("validates object inputs before asset resolution or build", async () => {
        const spec = fixture();
        spec.platformer.hazard_density = -1;
        await expect(runGenerationPipeline(spec, "unused-invalid-output")).rejects.toThrow("/platformer/hazard_density");
    });
});
