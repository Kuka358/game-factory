import { runPlatformerInput } from "./platformer-input.js";
import { expect, type Page } from "@playwright/test";
import type { PlatformerGameSpec } from "@game-factory/game-spec";
import type { DebugRectangle, PlatformerDebugDetails } from "@game-factory/runtime";
import { GameFactoryDriver } from "./GameFactoryDriver.js";
import { dangerJump, landingCandidates, type TransitionDiagnostic } from "./platformer-traversal.js";
import { lookaheadCandidates, selectLookaheadCandidate, type LookaheadCandidate } from "./platformer-lookahead.js";

export interface PlatformerActionObservation {
    target: number;
    jump: boolean;
    horizontalDelay?: number;
    direction: "left" | "right" | "stationary";
    before: PlatformerDebugDetails;
    after?: PlatformerDebugDetails;
    candidates?: (TransitionDiagnostic & { target: number; clearsDangers: boolean })[];
    samples?: { x: number; y: number; vx: number; vy: number; grounded: boolean }[];
}

// Shared by guaranteed regressions and the diagnostic benchmark. No seed overrides.
export function createPlatformerDriver(spec: PlatformerGameSpec) {
const observations: PlatformerActionObservation[] = [];
const keys = {
    left: spec.controls.move_left.includes("keyboard_left") ? "ArrowLeft" : "a",
    right: spec.controls.move_right.includes("keyboard_right") ? "ArrowRight" : "d"
};

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
async function act(page: Page, target: number, jump: boolean, horizontalDelay = 0): Promise<void> {
    const before = await details(page);
    const observation: PlatformerActionObservation = { target, jump, horizontalDelay, before, direction: target > before.playerBody.x + 4 ? "right" : target < before.playerBody.x - 4 ? "left" : "stationary" };
    observations.push(observation);
    try {
    observation.samples = await page.evaluate(runPlatformerInput, {
        targetX: target, jumping: jump, delay: horizontalDelay,
        leftCode: keys.left === "ArrowLeft" ? 37 : 65,
        rightCode: keys.right === "ArrowRight" ? 39 : 68,
        jumpCode: spec.controls.jump.includes("keyboard_space") ? 32 : spec.controls.jump.includes("keyboard_up") ? 38 : 0
    });
    } finally {
        observation.after = await details(page);
    }
}

async function moveTo(page: Page, target: number): Promise<void> {
    await act(page, target, false);
}

async function jumpTo(page: Page, target: number, delay = 0): Promise<void> {
    await settle(page);
    await act(page, target, true, delay);
    await settle(page);
}

function plan(state: PlatformerDebugDetails, platform: DebugRectangle, sameSurface: boolean): LookaheadCandidate[] {
    const sourceIndex = state.platforms.findIndex(p => p.x === platform.x && p.y === platform.y);
    if (sourceIndex < 0) return [];
    return lookaheadCandidates({ movement: spec.player.movement, surfaces: state.platforms, sourceIndex, playerX: state.playerBody.x,
        velocityX: state.playerVelocity?.x ?? 0, dangers: [...state.enemies, ...state.hazards], goalX: state.goal.x, sameSurface });
}

async function plannedJump(page: Page, selected: LookaheadCandidate, candidates: LookaheadCandidate[]): Promise<void> {
    try { await jumpTo(page, selected.target, selected.delay); }
    finally { const action = observations[observations.length - 1]; if (action) action.candidates = candidates; }
}

async function advance(page: Page, platform: DebugRectangle, target: number): Promise<void> {
    const state = await details(page);
    const top = platform.y - platform.height / 2;
    const dangers = [...state.enemies, ...state.hazards]
        .filter(danger => Math.abs(danger.y - top) < 64 && danger.x > state.playerBody.x && danger.x < target + 42)
        .sort((a, b) => a.x - b.x);
    for (const danger of dangers) {
        const current = await details(page);
        const candidates = plan(current, platform, true);
        const selected = selectLookaheadCandidate(candidates);
        if (selected) {
            await plannedJump(page, selected, candidates);
            if ((await details(page)).playerBody.x > platform.x + platform.width / 2) return;
            continue;
        }
        const planned = dangerJump(spec.player.movement, platform, danger);
        const currentX = (await details(page)).playerBody.x;
        if (!planned) {
            // A danger can occupy the rest of a narrow platform. Clamping the
            // landing to that platform's edge would land inside its hitbox.
            const next = state.platforms.find(p => p.x - p.width / 2 >= platform.x + platform.width / 2);
            if (next) {
                const candidates = landingCandidates(spec.player.movement, platform, currentX, next, [...state.enemies, ...state.hazards]);
                const candidate = candidates.find(c => c.verdict === "reachable" && c.clearsDangers);
                if (candidate) {
                    try { await jumpTo(page, candidate.target); }
                    finally { const action = observations[observations.length - 1]; if (action) action.candidates = candidates; }
                    return;
                }
            }
        }
        await moveTo(page, Math.max(currentX, planned?.launch ?? danger.x - 112));
        await jumpTo(page, planned?.target ?? Math.min(platform.x + platform.width / 2 - 25, danger.x + 76));
    }
    // This traversal advances rightward. A jump can stop just past its waypoint;
    // do not walk back toward the danger we have already cleared to correct it.
    if ((await details(page)).playerBody.x < target) await moveTo(page, target);
    expect((await new GameFactoryDriver(page).getState()).player?.alive).toBe(true);
}

async function traverse(page: Page, dieAt?: "enemies" | "hazards"): Promise<void> {
    const layout = await details(page);
    for (let index = 0; index < layout.platforms.length; index += 1) {
        const platform = layout.platforms[index]!;
        const left = platform.x - platform.width / 2;
        const right = platform.x + platform.width / 2;
        const state = await details(page);
        if (state.playerBody.x > right) continue;
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
            if ((await details(page)).playerBody.x > right) break;
            const before = (await new GameFactoryDriver(page).getState()).score;
            // A safe forward landing may already have passed this optional coin.
            // Jump vertically instead of crossing a cleared danger backwards.
            await jumpTo(page, Math.max(coin.x, (await details(page)).playerBody.x));
            expect((await new GameFactoryDriver(page).getState()).score).toBeGreaterThanOrEqual(before);
        }
        const next = layout.platforms[index + 1];
        if ((await details(page)).playerBody.x > right) continue;
        if (!next) {
            await advance(page, platform, layout.goal.x);
            break;
        }
        await advance(page, platform, right - 25);
        if ((await details(page)).playerBody.x > right) continue;
        const launch = await details(page);
        const withLookahead = plan(launch, platform, false);
        const selected = selectLookaheadCandidate(withLookahead);
        if (selected) {
            await plannedJump(page, selected, withLookahead);
            continue;
        }
        const candidates = landingCandidates(spec.player.movement, platform, launch.playerBody.x, next, [...launch.enemies, ...launch.hazards]);
        const chosen = candidates.filter(candidate => candidate.verdict === "reachable" && candidate.clearsDangers).sort((a, b) => b.target - a.target)[0];
        try {
            await jumpTo(page, chosen?.target ?? next.x - next.width / 2 + 25);
        } finally {
            const observation = observations[observations.length - 1];
            if (observation) observation.candidates = candidates;
        }
    }
    if (dieAt) throw new Error(`Did not encounter ${dieAt}`);
}


return { details, settle, moveTo, jumpTo, traverse, observations };
}
