import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isPlatformerGameSpec, validateGameSpec } from "@game-factory/game-spec";
import { createPlatformerDriver } from "../src/PlatformerDriver.js";
import { GameFactoryDriver } from "../src/GameFactoryDriver.js";

const validation = validateGameSpec(JSON.parse(readFileSync(path.resolve(process.env.GAME_FACTORY_BUILD_DIR!, "../game-spec.json"), "utf8")));
if (!validation.valid || !isPlatformerGameSpec(validation.data)) throw new Error("Platformer QA requires a validated Platformer build spec");
const spec = validation.data;
const { details, settle, moveTo, jumpTo, traverse, observations } = createPlatformerDriver(spec);

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().ready);
    await settle(page);
});

test("platformer movement, jump, fall and restart", async ({ page }) => {
    const game = new GameFactoryDriver(page);
    const initial = await details(page);
    await moveTo(page, initial.playerBody.x + 40);
    await moveTo(page, initial.playerBody.x);
    await jumpTo(page, initial.playerBody.x);
    const first = initial.platforms[0]!;
    const next = initial.platforms[1]!;
    expect(next.x - next.width / 2).toBeGreaterThan(first.x + first.width / 2);
    await moveTo(page, first.x + first.width / 2 + 30);
    await expect.poll(async () => (await game.getState()).game_over, { timeout: 5000 }).toBe(true);
    expect((await game.getState()).player?.alive).toBe(false);
    await game.restart();
    await expect.poll(async () => (await game.getState()).game_over).toBe(false);
    await settle(page);
    expect((await details(page)).platforms).toEqual(initial.platforms);
    expect((await game.getState()).score).toBe(0);
});

test("platformer playable route, collectibles, camera, goal and restart", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    // Capture loading errors too, not just gameplay errors after beforeEach.
    await page.reload();
    await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().ready);
    await settle(page);
    const initial = await details(page);
    const game = new GameFactoryDriver(page);
    const manifest: { assets: { role: string; spritesheet?: object }[] } = JSON.parse(readFileSync(path.resolve(process.env.GAME_FACTORY_BUILD_DIR!, "../asset-manifest.json"), "utf8"));
    if (manifest.assets.some(asset => asset.role === "level_tiles" && asset.spritesheet)) {
        expect(initial.tileVisuals).toBeGreaterThan(0);
    } else {
        expect(initial.tileVisuals).toBe(0);
    }
    expect(initial.playerBody.width).toBeCloseTo(40);
    expect(initial.playerBody.height).toBeCloseTo(56);
    for (const enemy of initial.enemies) expect([enemy.width, enemy.height]).toEqual([40, 56]);
    for (const hazard of initial.hazards) expect([hazard.width, hazard.height]).toEqual([38, 28]);
    for (const coin of initial.collectibles) expect([coin.width, coin.height]).toEqual([30, 30]);
    expect([initial.goal.width, initial.goal.height]).toEqual([40, 96]);
    const firstRouteAction = observations.length;
    await traverse(page);
    // Optional coins behind a safe landing must not pull QA back into danger.
    expect(observations.slice(firstRouteAction).filter(action => action.jump && action.direction === "left")).toEqual([]);
    await expect.poll(async () => (await details(page)).completed).toBe(true);
    expect((await game.getState()).player?.alive).toBe(true);
    expect((await game.getState()).game_over).toBe(true);
    if (initial.collectibles.length) expect((await game.getState()).score).toBeGreaterThan(0);
    expect((await details(page)).cameraX).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("platformer-complete.png") });
    await testInfo.attach("completed level", { path: testInfo.outputPath("platformer-complete.png"), contentType: "image/png" });
    await game.restart();
    await expect.poll(async () => (await game.getState()).game_over).toBe(false);
    await settle(page);
    expect((await details(page)).platforms).toEqual(initial.platforms);
    expect((await game.getState()).score).toBe(0);
    expect((await details(page)).collectibles.length).toBe(initial.collectibles.length);
    expect(errors).toEqual([]);
});

for (const kind of ["enemies", "hazards"] as const) {
    test(`platformer ${kind} are lethal`, async ({ page }) => {
        test.skip((await details(page))[kind].length === 0, `This level has no ${kind}`);
        await traverse(page, kind);
    });
}

test("artwork dimensions do not change Platformer collision geometry", async ({ page }) => {
    const initial = await details(page);
    await page.route("**/assets/*", async route => {
        const filename = new URL(route.request().url()).pathname.split("/").pop() ?? "";
        if (!/^(player|enemy|obstacle|collectible|goal)\.(svg|png|webp)$/.test(filename)) return route.continue();
        const wide = filename.startsWith("enemy") || filename.startsWith("goal");
        const width = wide ? 1024 : 64;
        const height = wide ? 64 : 1024;
        await route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#60b080"/></svg>` });
    });
    await page.reload();
    await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().ready);
    await settle(page);
    const changed = await details(page);
    expect(changed.platforms).toEqual(initial.platforms);
    for (const role of ["enemies", "hazards", "collectibles"] as const) {
        expect(changed[role]).toEqual(initial[role]);
    }
    expect(changed.goal).toEqual(initial.goal);
    expect(changed.playerBody.width).toBeCloseTo(initial.playerBody.width);
    expect(changed.playerBody.height).toBeCloseTo(initial.playerBody.height);
    expect(changed.playerBody.y).toBeCloseTo(initial.playerBody.y);
    await jumpTo(page, changed.playerBody.x + 30);
    expect((await new GameFactoryDriver(page).getState()).player?.alive).toBe(true);
});
