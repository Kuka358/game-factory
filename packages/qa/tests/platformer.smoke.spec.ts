import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isPlatformerGameSpec, validateGameSpec } from "@game-factory/game-spec";
import type { DebugRectangle, PlatformerDebugDetails } from "@game-factory/runtime";
import { GameFactoryDriver } from "../src/GameFactoryDriver.js";

const validation = validateGameSpec(JSON.parse(readFileSync(path.resolve(process.env.GAME_FACTORY_BUILD_DIR!, "../game-spec.json"), "utf8")));
if (!validation.valid || !isPlatformerGameSpec(validation.data)) throw new Error("Platformer QA requires a validated Platformer build spec");
const spec = validation.data;
const keys = {
    left: spec.controls.move_left.includes("keyboard_left") ? "ArrowLeft" : "a",
    right: spec.controls.move_right.includes("keyboard_right") ? "ArrowRight" : "d"
};

test.setTimeout(120_000);

async function details(page: Page): Promise<PlatformerDebugDetails> {
    const state = await new GameFactoryDriver(page).getState();
    if (!state.details || state.details.genre !== "platformer") throw new Error("Missing Platformer debug details");
    return state.details;
}

async function settle(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const state = window.__GAME_FACTORY__?.getState();
        return state?.details?.grounded || state?.game_over;
    });
    expect((await new GameFactoryDriver(page).getState()).player?.alive).toBe(true);
}

// Run key release on a browser animation frame. Node/trace round trips can take
// 100ms+, enough to walk into a hazard after reaching a waypoint.
async function act(page: Page, target: number, jump: boolean): Promise<void> {
    await page.evaluate(async ({ targetX, jumping, leftCode, rightCode, jumpCode }) => {
        const bridge = window.__GAME_FACTORY__;
        if (!bridge) throw new Error("Missing debug bridge");
        const state = () => bridge.getState();
        const key = (type: string, keyCode: number) => window.dispatchEvent(new KeyboardEvent(type, { keyCode, which: keyCode, bubbles: true }));
        const startX = state().player!.x;
        const right = targetX > startX;
        const direction = right ? rightCode : leftCode;
        let moving = Math.abs(targetX - startX) >= 4;
        if (jumping) {
            if (jumpCode) key("keydown", jumpCode);
            else bridge.dispatchAction("jump");
        }
        if (moving) key("keydown", direction);
        let airborne = false;
        const deadline = performance.now() + 10_000;
        try {
            await new Promise<void>((resolve, reject) => {
                const step = () => {
                    const current = state();
                    if (jumping && !current.details?.grounded) airborne = true;
                    if (moving && (right ? current.player!.x >= targetX : current.player!.x <= targetX)) {
                        key("keyup", direction);
                        moving = false;
                    }
                    if (current.game_over || (!moving && (!jumping || (airborne && current.details?.grounded)))) return resolve();
                    if (performance.now() > deadline) return reject(new Error("Platformer input waypoint timed out"));
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        } finally {
            key("keyup", direction);
            if (jumpCode) key("keyup", jumpCode);
        }
    }, {
        targetX: target, jumping: jump,
        leftCode: keys.left === "ArrowLeft" ? 37 : 65,
        rightCode: keys.right === "ArrowRight" ? 39 : 68,
        jumpCode: spec.controls.jump.includes("keyboard_space") ? 32 : spec.controls.jump.includes("keyboard_up") ? 38 : 0
    });
}

async function moveTo(page: Page, target: number): Promise<void> {
    await act(page, target, false);
}

async function jumpTo(page: Page, target: number): Promise<void> {
    await settle(page);
    await act(page, target, true);
    await settle(page);
}

async function advance(page: Page, platform: DebugRectangle, target: number): Promise<void> {
    const state = await details(page);
    const top = platform.y - platform.height / 2;
    const dangers = [...state.enemies, ...state.hazards]
        .filter(danger => Math.abs(danger.y - top) < 64 && danger.x > state.playerBody.x && danger.x < target + 42)
        .sort((a, b) => a.x - b.x);
    for (const danger of dangers) {
        await moveTo(page, Math.max(state.playerBody.x, danger.x - 112));
        await jumpTo(page, Math.min(platform.x + platform.width / 2 - 25, danger.x + 76));
    }
    await moveTo(page, target);
    expect((await new GameFactoryDriver(page).getState()).player?.alive).toBe(true);
}

async function traverse(page: Page, dieAt?: "enemies" | "hazards"): Promise<void> {
    const layout = await details(page);
    for (let index = 0; index < layout.platforms.length; index += 1) {
        const platform = layout.platforms[index]!;
        const left = platform.x - platform.width / 2;
        const right = platform.x + platform.width / 2;
        const state = await details(page);
        const targetDanger = dieAt && state[dieAt].find(danger => danger.x > left && danger.x < right);
        if (targetDanger) {
            await moveTo(page, targetDanger.x);
            await expect.poll(async () => (await new GameFactoryDriver(page).getState()).game_over).toBe(true);
            expect((await new GameFactoryDriver(page).getState()).player?.alive).toBe(false);
            expect((await details(page)).completed).toBe(false);
            return;
        }
        for (const coin of state.collectibles.filter(coin => coin.x > left && coin.x < right)) {
            await advance(page, platform, coin.x);
            const before = (await new GameFactoryDriver(page).getState()).score;
            await jumpTo(page, coin.x);
            expect((await new GameFactoryDriver(page).getState()).score).toBeGreaterThanOrEqual(before);
        }
        const next = layout.platforms[index + 1];
        if (!next) {
            await advance(page, platform, layout.goal.x);
            break;
        }
        await advance(page, platform, right - 25);
        await jumpTo(page, next.x - next.width / 2 + 25);
    }
    if (dieAt) throw new Error(`Did not encounter ${dieAt}`);
}

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
    await traverse(page);
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
