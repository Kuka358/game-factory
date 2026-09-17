import { describe, expect, it } from "vitest";
import { dangerJump, diagnoseTransition, safeLandingRegions, hazardClearance, landingCandidates } from "../../qa/src/platformer-traversal.js";
import { classifyBrowserFailure } from "../../qa/src/benchmark/report.js";
import type { PlatformerActionObservation } from "../../qa/src/PlatformerDriver.js";
const movement = { move_speed: 420, jump_force: 640 };
const source = { x: 379, y: 637, width: 192, height: 64 };
const destination = { x: 711, y: 602, width: 192, height: 64 };
const enemy = { x: 703.4489433538914, y: 538, width: 40, height: 56 };

describe("Platformer traversal diagnostics", () => {
    it("finds a safe alternative to the narrow-fast/2026 near-enemy landing", () => {
        const candidates = landingCandidates(movement, source, 440, destination, [enemy]);
        expect(candidates.some(c => c.target > enemy.x && c.verdict === "reachable" && c.clearsDangers)).toBe(true);
        for (const region of safeLandingRegions(destination, [enemy], movement.move_speed)) {
            expect(region.max < enemy.x - 40 || region.min > enemy.x + 40).toBe(true);
        }
    });
    it("bounds low-jump hazard clearance without claiming the entire level impossible", () => {
        const result = hazardClearance({ move_speed: 200, jump_force: 300 }, { x: 662, y: 640, width: 256, height: 64 }, { x: 623.2324287891388, y: 588, width: 38, height: 28 });
        expect(result.required).toBe(78);
        expect(result.available).toBeCloseTo(30.55, 1);
        expect(result.verdict).toBe("unreachable");
        expect(result.scope).toContain("other launch surfaces");
    });
    it("marks ceiling-sensitive high jumps uncertain and distant regions unreachable", () => {
        const high = { x: 2761, y: 180, width: 256, height: 64 };
        expect(diagnoseTransition({ move_speed: 320, jump_force: 900 }, high, 2700, high, { min: 2800, max: 2820 }).verdict).toBe("uncertain");
        expect(diagnoseTransition(movement, source, 440, destination, { min: 2000, max: 2100 }).verdict).toBe("unreachable");
    });
    it("retains a safe pointer-profile landing before an early hazard when jumping beyond it is too far", () => {
        const platform = { x: 922, y: 594, width: 320, height: 64 };
        const hazard = { x: 835.860382604599, y: 542, width: 38, height: 28 };
        const candidates = landingCandidates({ move_speed: 180, jump_force: 600 }, { x: 509, y: 611, width: 320, height: 64 }, 644, platform, [hazard]);
        expect(candidates.some(c => c.target < hazard.x - 39 && c.clearsDangers && c.verdict === "reachable")).toBe(true);
    });
    it("does not clamp a jump target into a danger at the platform end", () => {
        const narrow = { x: 988, y: 509, width: 128, height: 64 };
        const danger = { x: 1021.7644955539704, y: 457, width: 38, height: 28 };
        expect(dangerJump(movement, narrow, danger)).toBeUndefined();
        const wide = { x: 1280, y: 580, width: 256, height: 64 };
        const hazard = { x: 1347.5289911079408, y: 528, width: 38, height: 28 };
        const plan = dangerJump({ move_speed: 180, jump_force: 600 }, wide, hazard);
        expect(plan?.target).toBeGreaterThan(hazard.x + 39);
        expect(plan!.target).toBeLessThan(1408);
    });
    it("requires a safe candidate and observed region overshoot for a stronger failure code", () => {
        const state = { genre: "platformer" as const, grounded: true, completed: false, cameraX: 0, playerBody: { x: 440, y: 570, width: 40, height: 56 }, platforms: [source, destination], goal: destination, enemies: [enemy], hazards: [], collectibles: [], tileVisuals: 0 };
        const candidate = landingCandidates(movement, source, 440, destination, [enemy]).find(c => c.verdict === "reachable" && c.clearsDangers)!;
        const action: PlatformerActionObservation = { target: candidate.target, jump: true, direction: "right", before: state, after: { ...state, playerBody: { ...state.playerBody, x: candidate.landing.max + 1 } }, candidates: [candidate] };
        expect(classifyBrowserFailure("navigation", "died", [], action)).toBe("qa_overshoot");
        expect(classifyBrowserFailure("navigation", "died", [], { ...action, target: enemy.x })).toBe("qa_target_selection_failure");
        expect(classifyBrowserFailure("navigation", "died", [], { ...action, candidates: [] })).toBe("qa_driver_failure");
        expect(classifyBrowserFailure("navigation", "timed out", [], action)).toBe("qa_timeout");
    });
});
