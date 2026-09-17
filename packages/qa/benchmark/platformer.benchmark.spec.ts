import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { validateGameSpec, isPlatformerGameSpec } from "@game-factory/game-spec";
import { GameFactoryDriver } from "../src/GameFactoryDriver.js";
import { createPlatformerDriver } from "../src/PlatformerDriver.js";
import { classifyBrowserFailure, type BrowserOutcome } from "../src/benchmark/report.js";

const validated = validateGameSpec(JSON.parse(readFileSync(path.resolve(process.env.GAME_FACTORY_BUILD_DIR!, "../game-spec.json"), "utf8")));
if (!validated.valid || !isPlatformerGameSpec(validated.data)) throw new Error("Benchmark requires validated Platformer spec");
const spec = validated.data;
const outcomePath = path.join(path.dirname(process.env.GAME_FACTORY_QA_REPORT!), "benchmark-outcome.json");

test("Platformer robustness observation", async ({ page }, testInfo) => {
    const game = new GameFactoryDriver(page);
    const driver = createPlatformerDriver(spec);
    const outcome: BrowserOutcome = { phase: "browser_boot", status: "failed", failureCode: "unknown", message: "Observation interrupted", probe: "boot", booted: false, qaStarted: false, completed: false, runtimeErrors: [], phases: [] };
    let phaseStart = performance.now();
    const enter = (phase: BrowserOutcome["phase"]) => {
        outcome.phases.push({ phase: outcome.phase, status: "passed", durationMs: performance.now() - phaseStart });
        outcome.phase = phase;
        phaseStart = performance.now();
    };
    const checkpoint = async () => writeFile(outcomePath, JSON.stringify(outcome, null, 2));
    page.on("pageerror", error => outcome.runtimeErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") outcome.runtimeErrors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) outcome.runtimeErrors.push(`${response.status()} ${response.url()}`); });
    try {
        await checkpoint();
        await page.goto("/");
        await expect(page.locator("canvas")).toBeVisible();
        await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().ready, undefined, { timeout: 15_000 });
        outcome.booted = true;
        await driver.settle(page);
        const initial = await driver.details(page);
        outcome.debug = await game.getState();
        enter("qa_execution");
        outcome.qaStarted = true;
        outcome.probe = "movement";
        await checkpoint();
        // Stay inside the safe first platform even for narrow-platform cases.
        const target = Math.min(initial.playerBody.x + 30, initial.platforms[0]!.width - initial.playerBody.width / 2 - 2);
        await driver.moveTo(page, target);
        expect((await game.getState()).player!.x).toBeGreaterThan(initial.playerBody.x + 4);
        await driver.moveTo(page, initial.playerBody.x);
        outcome.probe = "jump";
        await checkpoint();
        if (spec.controls.jump.every(binding => binding === "pointer")) {
            await page.mouse.click(640, 360);
            await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().details?.grounded === false, undefined, { timeout: 3000 });
            await driver.settle(page);
        } else {
            await driver.jumpTo(page, initial.playerBody.x);
        }
        outcome.probe = "navigation";
        await checkpoint();
        await driver.traverse(page);
        enter("game_completion");
        outcome.probe = "completion";
        await checkpoint();
        await expect.poll(async () => (await driver.details(page)).completed).toBe(true);
        expect((await game.getState()).player?.alive).toBe(true);
        expect((await game.getState()).game_over).toBe(true);
        outcome.completed = true;
        if (initial.collectibles.length) expect((await game.getState()).score).toBeGreaterThan(0);
        expect((await driver.details(page)).cameraX).toBeGreaterThan(0);
        outcome.debug = await game.getState();
        outcome.probe = "restart";
        await checkpoint();
        await game.restart();
        await expect.poll(async () => (await game.getState()).game_over).toBe(false);
        await driver.settle(page);
        expect((await driver.details(page)).platforms).toEqual(initial.platforms);
        expect((await game.getState()).score).toBe(0);
        expect((await driver.details(page)).collectibles.length).toBe(initial.collectibles.length);
        expect(outcome.runtimeErrors).toEqual([]);
        outcome.status = "passed";
        outcome.failureCode = null;
        outcome.message = "Boot, input, route, goal, scoring and restart assertions passed";
    } catch (error) {
        outcome.message = error instanceof Error ? error.message : String(error);
        outcome.failureCode = classifyBrowserFailure(outcome.probe, outcome.message, outcome.runtimeErrors, driver.observations[driver.observations.length - 1]);
        if (outcome.probe === "navigation") outcome.message = `QA navigation did not complete; unreachability is NOT established. ${outcome.message}`;
        throw error;
    } finally {
        outcome.actions = driver.observations;
        try { outcome.debug = await game.getState(); } catch { /* Preserve last available snapshot. */ }
        outcome.phases.push({ phase: outcome.phase, status: outcome.status, durationMs: performance.now() - phaseStart });
        await checkpoint();
        await testInfo.attach("benchmark-observation", { path: outcomePath, contentType: "application/json" });
    }
});
