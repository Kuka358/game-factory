import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateGameSpec, type PlatformerGameSpec } from "@game-factory/game-spec";
import { GameReviewer, type ReviewGameInput } from "../src/index.js";
import { PlatformerTestProvider } from "./fixtures/PlatformerTestProvider.js";

async function spec(): Promise<PlatformerGameSpec> {
    const parsed = validateGameSpec(JSON.parse(await readFile(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")));
    if (!parsed.valid || !("platformer" in parsed.data)) throw new Error("Invalid fixture");
    return parsed.data;
}
const platform = { platform: "browser" as const, keyboardInput: true, touchInput: true };
async function review(game: PlatformerGameSpec, constraints = platform) {
    expect(validateGameSpec(game).valid).toBe(true);
    const provider = new PlatformerTestProvider();
    const reviewer = new GameReviewer({ provider, model: "test", promptRegistry: { async get(id, version) { return { id, version, content: "Review the selected template" }; } } });
    const result = await reviewer.review({ spec: game, platform: constraints, templates: [{ id: "platformer", genre: "platformer", version: "1", supportedModes: ["template"], assetRoles: ["player", "obstacle", "background"] }] });
    return { ...result, provider };
}
function flat(game: PlatformerGameSpec) {
    Object.assign(game.platformer, { platform_gap_min: 0, platform_gap_max: 0, platform_height_variation: 0, platform_width_max: 384, level_length: 3000 });
    game.player.movement.jump_force = 1;
    return game;
}

describe("Platformer semantic Reviewer", () => {
    it("accepts the valid Platformer and retains the existing LLM review", async () => {
        const result = await review(await spec());
        expect(result.review.valid).toBe(true);
        expect(result.provider.requests).toHaveLength(1);
    });
    it.each(["enemy", "hazard"])("rejects an unavoidable flat-level %s barrier before asking the LLM", async kind => {
        const game = flat(await spec());
        game.platformer.enemy_density = kind === "enemy" ? 1 : 0;
        game.platformer.hazard_density = kind === "hazard" ? 1 : 0;
        const result = await review(game);
        expect(result.review.valid).toBe(false);
        expect(result.review.issues).toEqual([expect.objectContaining({ path: "/player/movement/jump_force" })]);
        expect(result.provider.requests).toHaveLength(0);
    });
    it("rejects unavailable movement/jump bindings on a keyboardless target", async () => {
        const game = await spec();
        game.controls.jump = ["keyboard_space"];
        const result = await review(game, { ...platform, keyboardInput: false });
        expect(result.review.valid).toBe(false);
        expect(result.review.issues?.map(issue => issue.path)).toEqual(["/controls/move_right", "/controls/jump"]);
    });
    it("uses the runtime hazard height rather than a subjective minimum jump setting", async () => {
        const game = flat(await spec());
        game.platformer.enemy_density = 0;
        game.platformer.hazard_density = 1;
        // A 34-unit hazard top at gravity 1200 requires sqrt(2*1200*34).
        game.player.movement.jump_force = 285;
        expect((await review(game)).review.valid).toBe(false);
        game.player.movement.jump_force = 286;
        expect((await review(game)).review.valid).toBe(true);
    });
    it("does not mistake pointer-only jump for touchscreen-only input", async () => {
        const game = await spec();
        game.controls.jump = ["pointer"];
        expect((await review(game, { ...platform, touchInput: false })).review.valid).toBe(true);
    });
    it("keeps unreachable optional score and enemy priority non-blocking", async () => {
        const game = flat(await spec());
        game.platformer.enemy_density = 0;
        game.platformer.hazard_density = 0;
        const result = await review(game);
        expect(result.review.valid).toBe(true);
        expect(result.review.warnings.join(" ")).toContain("Standing jumps cannot reach");
        game.player.movement.jump_force = 640;
        game.platformer.enemy_density = 1;
        game.platformer.hazard_density = 1;
        const priority = await review(game);
        expect(priority.review.valid).toBe(true);
        expect(priority.review.warnings.join(" ")).toContain("no hazards will spawn");
    });
    it.each(["no guaranteed danger", "no guaranteed interior", "non-flat", "sufficient jump"])("does not overclaim impossibility: %s", async exception => {
        const game = flat(await spec());
        game.platformer.enemy_density = 1;
        if (exception === "no guaranteed danger") { game.platformer.enemy_density = 0.5; game.platformer.hazard_density = 0.5; }
        if (exception === "no guaranteed interior") { game.platformer.platform_width_max = 1024; game.platformer.level_length = 2000; }
        if (exception === "non-flat") game.platformer.platform_height_variation = 40;
        if (exception === "sufficient jump") game.player.movement.jump_force = 640;
        expect((await review(game)).review.valid).toBe(true);
    });
    it("does not apply Platformer input requirements to Runner", async () => {
        const game: ReviewGameInput["spec"] = JSON.parse(await readFile(new URL("../../../examples/runner-basic.json", import.meta.url), "utf8"));
        const provider = new PlatformerTestProvider();
        const reviewer = new GameReviewer({ provider, model: "test", promptRegistry: { async get(id, version) { return { id, version, content: "Review" }; } } });
        const result = await reviewer.review({ spec: game, templates: [{ id: "endless_runner", genre: "endless_runner", version: "1", supportedModes: ["template"], assetRoles: [] }], platform: { ...platform, keyboardInput: false } });
        expect(result.review.valid).toBe(true);
        expect(provider.requests).toHaveLength(1);
    });
});
