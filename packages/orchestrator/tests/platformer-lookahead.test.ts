import { describe, expect, it } from "vitest";
import { ascentDelay, lookaheadCandidates, selectLookaheadCandidate, type LookaheadInput } from "../../qa/src/platformer-lookahead.js";
import { clearsDangers, diagnoseTransition, jumpArc, safeLandingRegions } from "../../qa/src/platformer-traversal.js";
import { classifyBrowserFailure } from "../../qa/src/benchmark/report.js";
import type { PlatformerActionObservation } from "../../qa/src/PlatformerDriver.js";

function alternativeInput(): LookaheadInput {
    return { movement: { move_speed: 200, jump_force: 300 }, sourceIndex: 0, playerX: 260, velocityX: 0, goalX: 580,
        surfaces: [{ x: 180, y: 250, width: 200, height: 64 }, { x: 370, y: 650, width: 140, height: 64 }, { x: 550, y: 650, width: 140, height: 64 }],
        dangers: [{ x: 370, y: 598, width: 38, height: 28 }] };
}

describe("bounded Platformer lookahead", () => {
    it("prefers the low-jump landing with an onward route over an equally safe dead-end region", () => {
        const input = alternativeInput();
        const candidates = lookaheadCandidates(input).filter(c => c.destinationIndex === 1 && c.usable);
        expect(candidates.some(c => c.target < 370 && !c.continuation)).toBe(true);
        expect(candidates.some(c => c.target > 370 && c.continuation)).toBe(true);
        const chosen = selectLookaheadCandidate(candidates)!;
        expect(chosen.target).toBeGreaterThan(370);
        expect(chosen.continuation?.destinationIndex).toBe(2);
    });
    it("uses vertical ascent before horizontal motion when takeoff is close to danger", () => {
        const movement = { move_speed: 420, jump_force: 640 };
        const source = { x: 150, y: 650, width: 300, height: 64 };
        const danger = { x: 170, y: 598, width: 38, height: 28 };
        const launch = 120, target = 250;
        const delay = ascentDelay(movement, source, launch, target, [danger]);
        const arc = jumpArc(movement, source, source);
        expect(delay).toBeGreaterThan(0);
        expect(clearsDangers(movement, source, launch, target, arc.flightTime, [danger])).toBe(false);
        expect(clearsDangers(movement, source, launch, target, arc.flightTime, [danger], { delay, ceiling: true })).toBe(true);
    });
    it("models velocity cancellation at the ceiling without claiming global impossibility", () => {
        const movement = { move_speed: 320, jump_force: 900 };
        const source = { x: 150, y: 270, width: 256, height: 64 };
        const destination = { x: 777, y: 272, width: 384, height: 64 };
        const diagnostic = diagnoseTransition(movement, source, 266, destination, { min: 600, max: 620 });
        expect(diagnostic.verdict).toBe("uncertain");
        expect(diagnostic.ceiling!.horizontalReach).toBeLessThan(334);
        expect(diagnostic.horizontalReach).toBeGreaterThan(334);
        const arc = jumpArc(movement, source, destination);
        expect(arc.foot(arc.contactTime!)).toBeCloseTo(56);
        expect(arc.foot(arc.contactTime! + 0.1)).toBeGreaterThan(56);
    });
    it("includes both directions of setup within a connected landing interval", () => {
        const input = alternativeInput();
        const candidates = lookaheadCandidates(input).filter(c => c.destinationIndex === 1 && c.continuation);
        // Three target samples share a region, but each retains its own next setup.
        expect(new Set(candidates.map(c => c.target)).size).toBeGreaterThan(1);
        for (const c of candidates) {
            expect(c.continuation!.launch).toBeGreaterThanOrEqual(c.landing.min);
            expect(c.continuation!.launch).toBeLessThanOrEqual(c.landing.max);
        }
    });
    it("reduces landing margin quality with residual horizontal velocity", () => {
        const stopped = lookaheadCandidates(alternativeInput());
        const moving = lookaheadCandidates({ ...alternativeInput(), velocityX: 200 });
        expect(moving[0]!.landingMargin).toBeLessThan(stopped[0]!.landingMargin);
        const chosen = selectLookaheadCandidate(stopped)!;
        expect(chosen.target).toBeGreaterThanOrEqual(chosen.landing.min);
        expect(chosen.target).toBeLessThanOrEqual(chosen.landing.max);
    });
    it("uses forward jumps and confines setup correction to connected safe ground", () => {
        const candidates = lookaheadCandidates(alternativeInput());
        for (const c of candidates.filter(c => c.continuation)) {
            expect(c.target).toBeGreaterThan(c.launch);
            expect(c.continuation!.target).toBeGreaterThan(c.continuation!.launch);
            expect(c.continuation!.launch).toBeGreaterThanOrEqual(c.landing.min);
            expect(c.continuation!.launch).toBeLessThanOrEqual(c.landing.max);
        }
    });
    it("marks intermediate underside contact uncertain instead of accepting the free arc", () => {
        const candidates = lookaheadCandidates({ movement: { move_speed: 320, jump_force: 640 }, sourceIndex: 0, playerX: 160, velocityX: 0, goalX: 500,
            surfaces: [{ x: 100, y: 650, width: 160, height: 64 }, { x: 280, y: 500, width: 80, height: 64 }, { x: 500, y: 650, width: 160, height: 64 }], dangers: [] });
        const affected = candidates.filter(c => c.destinationIndex === 2 && c.overheadRisk);
        expect(affected.length).toBeGreaterThan(0);
        expect(affected.every(c => !c.usable && c.verdict === "uncertain")).toBe(true);
    });
    it("keeps landing centers inside supported ground instead of relying on a sliver of overlap", () => {
        const surface = { x: 100, y: 650, width: 128, height: 64 };
        const region = safeLandingRegions(surface, [], 420)[0]!;
        expect(region.min).toBeGreaterThan(36);
        expect(region.max).toBeLessThan(164);
    });
    it("requires both ceiling-envelope and observed cancellation evidence for the ceiling failure code", () => {
        const surface = { x: 150, y: 270, width: 256, height: 64 };
        const destination = { x: 777, y: 272, width: 384, height: 64 };
        const before = { genre: "platformer" as const, grounded: true, completed: false, cameraX: 0, playerBody: { x: 266, y: 210, width: 40, height: 56 },
            platforms: [surface, destination], goal: destination, enemies: [], hazards: [], collectibles: [], tileVisuals: 0 };
        const diagnostic = diagnoseTransition({ move_speed: 320, jump_force: 900 }, surface, 266, destination, { min: 600, max: 620 });
        const action: PlatformerActionObservation = { before, after: { ...before, playerBody: { ...before.playerBody, x: 602, y: 928 } },
            jump: true, direction: "right", target: 600, candidates: [{ ...diagnostic, target: 600, clearsDangers: true }],
            samples: [{ x: 346, y: 28, vx: 320, vy: 0, grounded: false }] };
        expect(classifyBrowserFailure("navigation", "died", [], action)).toBe("qa_ceiling_transition_failure");
        expect(classifyBrowserFailure("navigation", "died", [], { ...action, samples: [] })).toBe("qa_driver_failure");
        expect(classifyBrowserFailure("navigation", "died", [], { ...action, candidates: [] })).toBe("qa_driver_failure");
        expect(classifyBrowserFailure("navigation", "timed out", [], action)).toBe("qa_timeout");
        expect(classifyBrowserFailure("navigation", "died", ["runtime error"], action)).toBe("runtime_failed");
    });
});
