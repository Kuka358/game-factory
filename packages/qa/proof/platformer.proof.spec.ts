import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { validateGameSpec, isPlatformerGameSpec } from "@game-factory/game-spec";
import { ARCADE_GRAVITY_Y, ARCADE_PHYSICS_FPS, PLATFORMER_ENTITY_HEIGHTS, PLATFORMER_BODIES, type PlatformerDiagnosticTrial, type PlatformerDiagnosticResult } from "@game-factory/runtime";
import { createPlatformerDriver } from "../src/PlatformerDriver.js";
import { physicalRegions, empiricalEnvelope, buildProofGraph } from "../src/platformer-proof.js";
import type { PlatformerActionObservation } from "../src/PlatformerDriver.js";

const workspace = path.dirname(process.env.GAME_FACTORY_BUILD_DIR!);
const result = validateGameSpec(JSON.parse(readFileSync(path.join(workspace, "game-spec.json"), "utf8")));
if (!result.valid || !isPlatformerGameSpec(result.data)) throw new Error("Platformer proof requires validated input");
const spec = result.data;
const original: PlatformerActionObservation = JSON.parse(readFileSync(path.join(workspace, "proof-input.json"), "utf8"));

test("bounded real-Arcade transition diagnostics", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const boot = async () => {
        await page.goto("/?platformerDiagnostics=1");
        await page.waitForFunction(() => window.__GAME_FACTORY__?.getState().ready && window.__GAME_FACTORY__.platformerDiagnostics);
    };
    await boot();
    const driver = createPlatformerDriver(spec);
    await driver.settle(page);
    const layout = await driver.details(page);
    const sourceIndex = layout.platforms.findIndex(p => Math.abs(p.y - p.height / 2 - original.before.playerBody.y - PLATFORMER_BODIES.player.height / 2) < 3
        && Math.abs(p.x - original.before.playerBody.x) < (p.width + PLATFORMER_BODIES.player.width) / 2);
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => window.__GAME_FACTORY__!.platformerDiagnostics!.startCapture());
    let navigationError: string | undefined;
    try { await driver.traverse(page); } catch (error) { navigationError = String(error); }
    const replay = { actions: driver.observations, error: navigationError,
        frames: await page.evaluate(() => window.__GAME_FACTORY__!.platformerDiagnostics!.stopCapture()) };
    expect(replay.frames.length).toBeLessThanOrEqual(240);
    const dangers = [...layout.enemies, ...layout.hazards];
    const trials: { label: string; input: PlatformerDiagnosticTrial }[] = [];
    const first = layout.platforms[0]!;
    for (const [label, options] of [
        ["vertical", { direction: 0 }], ["moving", { direction: 1 }], ["moving-start", { direction: 1, initialDirection: 1 }],
        ["delayed", { direction: 1, delayFrames: 3 }], ["early-release", { direction: 1, releaseFrame: 6 }], ["left", { direction: -1 }]
    ] as const) trials.push({ label: `envelope-${label}`, input: { sourceIndex: 0, launchX: first.x, ...options } });
    const inset = PLATFORMER_BODIES.player.width / 10;
    const source = layout.platforms[sourceIndex]!;
    const sourceTop = source.y - source.height / 2;
    const adjustedHazards = layout.hazards.filter(d => Math.abs(d.x - source.x) < source.width / 2
        && sourceTop - d.y < PLATFORMER_ENTITY_HEIGHTS.hazard && sourceTop - d.y + d.height / 2 > 0);
    for (const danger of adjustedHazards) {
        const apexTime = (spec.player.movement.jump_force - ARCADE_GRAVITY_Y / (2 * ARCADE_PHYSICS_FPS)) / ARCADE_GRAVITY_Y;
        trials.push({ label: "adjusted-hazard-crossing", input: { sourceIndex,
            launchX: danger.x - spec.player.movement.move_speed * apexTime, direction: 1 } });
    }
    trials.push({ label: "local-vertical", input: { sourceIndex, launchX: original.before.playerBody.x, direction: 0 } });
    // Previous/current/next surfaces include potential bypass and onward edges;
    // setups on unvisited surfaces are explicitly isolated, not route witnesses.
    for (const index of [sourceIndex - 1, sourceIndex, sourceIndex + 1].filter(i => layout.platforms[i])) {
        const regions = physicalRegions(layout.platforms[index]!, dangers);
        for (const region of regions) {
            const margin = Math.min(inset, (region.max - region.min) / 4);
            const launches = [region.min + margin, (region.min + region.max) / 2, region.max - margin];
            for (const launchX of launches) trials.push({ label: "supported-edge-or-center", input: { sourceIndex: index, launchX, direction: 1 } });
        }
    }
    for (const stepsPerRender of [1, 2, 3] as const) {
        for (const delayFrames of [0, 3]) trials.push({ label: "original-start-cadence", input: { sourceIndex, launchX: original.before.playerBody.x, direction: 1, delayFrames, stepsPerRender } });
    }
    const currentRegions = physicalRegions(layout.platforms[sourceIndex]!, dangers);
    const ahead = currentRegions.filter(r => r.min > original.before.playerBody.x);
    for (const region of ahead) for (const delayFrames of [0, 3]) {
        trials.push({ label: "controlled-post-danger-landing", input: { sourceIndex, launchX: original.before.playerBody.x, direction: 1,
            releaseX: region.min + Math.min(inset, (region.max - region.min) / 4), delayFrames } });
    }
    const measurements: { label: string; result: PlatformerDiagnosticResult; envelope: ReturnType<typeof empiricalEnvelope> }[] = [];
    const nearestDanger = dangers.filter(d => Math.abs(d.x - original.before.playerBody.x) < 250).sort((a, b) => Math.abs(a.x - original.before.playerBody.x) - Math.abs(b.x - original.before.playerBody.x))[0];
    const output = path.join(path.dirname(process.env.GAME_FACTORY_QA_REPORT!), "proof-report.json");
    const save = () => writeFile(output, JSON.stringify({ version: 1, spec, layout, original, sourceIndex, replay,
        graph: buildProofGraph(layout.platforms, dangers, spec.player.movement, layout.playerBody.x, layout.goal, measurements.map(m => m.result)), measurements, errors }, null, 2));
    await save();
    for (const trial of trials) {
        await boot();
        const measured = await page.evaluate(input => window.__GAME_FACTORY__!.platformerDiagnostics!.trial(input), trial.input);
        measurements.push({ label: trial.label, result: measured, envelope: empiricalEnvelope(measured, nearestDanger) });
        await save();
    }
    expect(measurements.find(m => m.label === "envelope-vertical")?.result.jumped).toBe(true);
    for (const { result: measured } of measurements) {
        expect(measured.frames.length).toBeLessThanOrEqual(240);
        expect(measured.fixedStep).toBe(true);
        expect(measured.fps).toBe(ARCADE_PHYSICS_FPS);
        for (const frame of measured.frames.filter(f => f.bounds?.after.blocked.up)) {
            expect(frame.bounds!.before.vy).toBeLessThan(0);
            expect(frame.bounds!.after.vy).toBe(0);
            expect(frame.bounds!.after.y).toBe(PLATFORMER_BODIES.player.height / 2);
        }
    }
    const vertical = measurements.find(m => m.label === "envelope-vertical")!.envelope;
    if (vertical.jumped) {
        const idealRise = spec.player.movement.jump_force ** 2 / (2 * ARCADE_GRAVITY_Y);
        expect(vertical.rise).toBeLessThanOrEqual(idealRise);
        if (!vertical.ceilingContacts) expect(vertical.rise).toBeGreaterThan(idealRise - spec.player.movement.jump_force / ARCADE_PHYSICS_FPS);
    }
    for (const measurement of measurements.filter(m => m.label === "adjusted-hazard-crossing")) {
        expect(measurement.result.supportedStart).toBe(true);
        expect(measurement.result.alive).toBe(true);
        expect(measurement.result.landingIndex).toBe(sourceIndex);
        const danger = adjustedHazards.find(d => d.x > measurement.result.trial.launchX)!;
        expect(measurement.result.frames.at(-1)!.after!.x).toBeGreaterThan(danger.x + (danger.width + PLATFORMER_BODIES.player.width) / 2);
    }
    expect(errors).toEqual([]);
    await info.attach("physics evidence", { path: output, contentType: "application/json" });
});
