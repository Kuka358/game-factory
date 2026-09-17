import { describe, it, expect } from "vitest";
import { buildProofGraph, physicalRegions, routeVerdict, type ProofNode, type ProofEdge } from "../../qa/src/platformer-proof.js";
import type { PlatformerDiagnosticResult } from "../../runtime/src/debug/PlatformerDiagnostics.js";
import { hazardCutCertificate, supportedJumpBarrierBound } from "../../qa/src/platformer-barrier-proof.js";

describe("Platformer diagnostic proof boundaries", () => {
    const movement = { move_speed: 200, jump_force: 300 };
    const danger = { x: 200, y: 580, width: 38, height: 28 };
    it("excludes the low supported crossing even with two discrete boundary steps of slack", () => {
        const bound = supportedJumpBarrierBound(movement, 600, danger, 60);
        expect(bound.requiredRise).toBe(34);
        expect(bound.spanUpperBound).toBeCloseTo(37.22, 1);
        expect(bound.requiredSpan).toBe(78);
        expect(bound.state).toBe("proven_unreachable");
        expect(bound.scope).toContain("not globally ruled out");
    });
    it("accounts for previous surfaces being lower, and permits higher-surface alternatives", () => {
        expect(supportedJumpBarrierBound(movement, 607, danger, 60).requiredRise).toBe(41);
        expect(supportedJumpBarrierBound(movement, 607, danger, 60).state).toBe("proven_unreachable");
        expect(supportedJumpBarrierBound(movement, 560, danger, 60).state).toBe("uncertain");
    });
    it("retains optimistic partial support and hazard-separated regions", () => {
        const regions = physicalRegions({ x: 200, y: 632, width: 128, height: 64 }, [danger]);
        expect(regions).toEqual([{ min: 116, max: 161 }, { min: 239, max: 284 }]);
    });
    const surfaces = [
        { x: 50, y: 650, width: 100, height: 64 },
        { x: 220, y: 632, width: 240, height: 64 },
        { x: 500, y: 632, width: 256, height: 64 }
    ];
    const goal = { x: 500, y: 552, width: 40, height: 96 };
    it("certifies a lethal cut only after excluding above, between and below routes", () => {
        const cut = hazardCutCertificate(surfaces, danger, movement, 60, goal);
        expect(cut?.state).toBe("proven_unreachable");
        expect(cut!.underReturnTop).toBeGreaterThan(cut!.lowestSurfaceTop);
    });
    it("refuses a global certificate when a higher approach or intermediate support exists", () => {
        expect(hazardCutCertificate([{ ...surfaces[0]!, y: 580 }, ...surfaces.slice(1)], danger, movement, 60, goal)).toBeUndefined();
        expect(hazardCutCertificate([...surfaces, { x: 200, y: 500, width: 80, height: 64 }], danger, movement, 60, goal)).toBeUndefined();
    });
    it("keeps below routes and an exposed goal unresolved", () => {
        expect(hazardCutCertificate([...surfaces, { x: 350, y: 780, width: 40, height: 64 }], danger, movement, 60, goal)).toBeUndefined();
        expect(hazardCutCertificate(surfaces, danger, movement, 60, { ...goal, y: 700 })).toBeUndefined();
        expect(hazardCutCertificate(surfaces, danger, movement, 60, { ...goal, x: 390 })).toBeUndefined();
    });
    const timing: PlatformerDiagnosticResult = { trial: { sourceIndex: 0, launchX: 50, direction: 0 }, fps: 60,
        fixedStep: true, frames: [], supportedStart: false, jumped: false, alive: true, landingIndex: null, scope: "Measured step configuration fixture" };
    it("excludes every forward graph edge crossing a certified cut, including skips", () => {
        const graph = buildProofGraph(surfaces, [danger], movement, 50, goal, [timing]);
        expect(graph.cuts).toHaveLength(1);
        expect(graph.verdict).toBe("no_reachable_goal_route");
        expect(graph.edges.filter(e => e.state === "proven_unreachable").length).toBeGreaterThan(1);
    });
    it("retains a plausible graph route without measured fixed timing or with an elevated bypass", () => {
        expect(buildProofGraph(surfaces, [danger], movement, 50, goal).verdict).toBe("uncertain_goal_route");
        expect(buildProofGraph(surfaces, [danger], movement, 50, goal, [{ ...timing, fixedStep: false }]).verdict).toBe("uncertain_goal_route");
        const bypass = [surfaces[0]!, surfaces[1]!, { x: 200, y: 500, width: 80, height: 64 }, surfaces[2]!];
        expect(buildProofGraph(bypass, [danger], movement, 50, goal, [timing]).verdict).toBe("uncertain_goal_route");
    });
    const nodes: ProofNode[] = [0, 1, 2].map(id => ({ id, surface: id, min: id * 100, max: id * 100 + 50 }));
    const edge = (from: number, to: number, state: ProofEdge["state"]): ProofEdge => ({ from, to, state, reason: "test evidence" });
    it("finds a demonstrated alternative route around a rejected edge", () => {
        expect(routeVerdict(nodes, [edge(0, 2, "proven_unreachable"), edge(0, 1, "proven_reachable"), edge(1, 2, "proven_reachable")], 0, [2])).toBe("demonstrated_candidate_route");
    });
    it("requires every plausible route to be excluded before no-route classification", () => {
        expect(routeVerdict(nodes, [edge(0, 1, "proven_reachable"), edge(1, 2, "proven_unreachable")], 0, [2])).toBe("no_reachable_goal_route");
    });
    it("an uncertain edge prevents a false global impossibility claim", () => {
        expect(routeVerdict(nodes, [edge(0, 1, "proven_reachable"), edge(1, 2, "uncertain")], 0, [2])).toBe("uncertain_goal_route");
        expect(routeVerdict(nodes, [], -1, [])).toBe("uncertain_goal_route");
    });
});
