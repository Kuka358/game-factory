import { ARCADE_GRAVITY_Y, PLATFORMER_BODIES, type DebugRectangle, type PlatformerDiagnosticResult } from "@game-factory/runtime";
import type { PlatformerGameSpec } from "@game-factory/game-spec";
import { surfaceTop, type Region } from "./platformer-traversal.js";
import { hazardCutCertificate } from "./platformer-barrier-proof.js";

export type ProofState = "proven_reachable" | "proven_unreachable" | "uncertain";
export interface ProofNode extends Region { id: number; surface: number }
export interface ProofEdge { from: number; to: number; state: ProofState; reason: string }
// Optimistic support including contact limits, not the driver's control margins.
// Endpoints may have zero overlap: retaining them prevents false impossibility.
export function physicalRegions(p: DebugRectangle, dangers: DebugRectangle[]): Region[] {
    const half = PLATFORMER_BODIES.player.width / 2;
    const top = surfaceTop(p);
    let regions = [{ min: p.x - p.width / 2 - half, max: p.x + p.width / 2 + half }];
    for (const d of dangers.filter(d => d.y + d.height / 2 > top - PLATFORMER_BODIES.player.height && d.y - d.height / 2 < top)) {
        const min = d.x - d.width / 2 - half, max = d.x + d.width / 2 + half;
        regions = regions.flatMap(r => min >= r.max || max <= r.min ? [r] : [{ min: r.min, max: Math.min(min, r.max) }, { min: Math.max(max, r.min), max: r.max }]).filter(r => r.max > r.min);
    }
    return regions;
}
export function routeVerdict(nodes: ProofNode[], edges: ProofEdge[], start: number, goals: number[]): "demonstrated_candidate_route" | "uncertain_goal_route" | "no_reachable_goal_route" {
    const reaches = (uncertain: boolean) => {
        const seen = new Set([start]), queue = [start];
        while (queue.length) {
            const id = queue.shift()!;
            if (goals.includes(id)) return true;
            for (const e of edges.filter(e => e.from === id && (e.state === "proven_reachable" || (uncertain && e.state === "uncertain")))) {
                if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
            }
        }
        return false;
    };
    if (!nodes.some(n => n.id === start) || !goals.length) return "uncertain_goal_route";
    return reaches(false) ? "demonstrated_candidate_route" : reaches(true) ? "uncertain_goal_route" : "no_reachable_goal_route";
}
export function buildProofGraph(surfaces: DebugRectangle[], dangers: DebugRectangle[], movement: PlatformerGameSpec["player"]["movement"], spawnX: number, goal: DebugRectangle, trials: PlatformerDiagnosticResult[] = []) {
    const nodes: ProofNode[] = [];
    surfaces.forEach((p, surface) => physicalRegions(p, dangers).forEach(r => nodes.push({ ...r, surface, id: nodes.length })));
    const edges: ProofEdge[] = [];
    const fps = trials[0]?.fps;
    const cuts = fps && trials.every(t => t.fixedStep && t.fps === fps)
        ? dangers.flatMap(d => { const c = hazardCutCertificate(surfaces, d, movement, fps, goal); return c ? [c] : []; }) : [];
    for (const a of nodes) for (const b of nodes) {
        if (a.id === b.id) continue;
        const delta = surfaceTop(surfaces[b.surface]!) - surfaceTop(surfaces[a.surface]!);
        const discriminant = movement.jump_force ** 2 + 2 * ARCADE_GRAVITY_Y * delta;
        const distance = Math.max(b.min - a.max, a.min - b.max, 0);
        const ideal = discriminant < 0 ? 0 : movement.move_speed * (movement.jump_force + Math.sqrt(discriminant)) / ARCADE_GRAVITY_Y;
        // No finite-step contact schedule is assumed exhausted. Even an ideal
        // envelope exclusion is only a fixed-launch bound, not a global edge proof.
        const cut = cuts.find(c => a.max <= c.left && b.min >= c.right);
        edges.push({ from: a.id, to: b.id, state: cut ? "proven_unreachable" : "uncertain", reason: cut ? "Certified lethal vertical cut: above, between and below alternatives excluded" : discriminant < 0 || distance > ideal
            ? "Outside ideal supported-jump envelope; render catch-up/edge-launch schedules not exhausted"
            : "Inside optimistic envelope; hazard/ceiling/contact or setup feasibility unproved" });
    }
    for (const [index, trial] of trials.entries()) {
        if (!trial.supportedStart || !trial.jumped || !trial.alive || trial.landingIndex === null) continue;
        const startX = trial.frames.find(f => f.before.vy < 0)?.before.x;
        const endX = trial.frames.at(-1)?.after?.x;
        const from = nodes.find(n => n.surface === trial.trial.sourceIndex && startX !== undefined && startX >= n.min && startX <= n.max);
        const to = nodes.find(n => n.surface === trial.landingIndex && endX !== undefined && endX >= n.min && endX <= n.max);
        const edge = edges.find(e => e.from === from?.id && e.to === to?.id);
        if (edge?.state === "proven_unreachable") throw new Error("Runtime witness contradicts cut certificate");
        if (edge) { edge.state = "proven_reachable"; edge.reason = `Isolated supported runtime witness ${index}; connected-region setup assumed, not an end-to-end control script`; }
    }
    const start = nodes.find(n => n.surface === 0 && spawnX >= n.min && spawnX <= n.max)?.id ?? -1;
    const goals = nodes.filter(n => n.surface === surfaces.length - 1 && goal.x >= n.min && goal.x <= n.max).map(n => n.id);
    return { nodes, edges, cuts, start, goals, verdict: routeVerdict(nodes, edges, start, goals),
        scope: "Optimistic support-region graph; unresolved contact schedules stay uncertain. An unmeasured edge is never made unreachable because a candidate failed." };
}
export function empiricalEnvelope(result: PlatformerDiagnosticResult, danger?: DebugRectangle) {
    const launch = result.frames.find(f => f.before.vy < 0)?.before;
    if (!launch) return { jumped: false as const };
    const states = result.frames.flatMap(f => f.after ? [f.after] : []);
    const clearance = danger ? states.filter(s => s.y + PLATFORMER_BODIES.player.height / 2 < danger.y - danger.height / 2) : [];
    return { jumped: true as const, rise: launch.y - Math.min(...states.map(s => s.y)),
        elapsed: result.frames.reduce((sum, f) => sum + f.dt, 0), horizontalDisplacement: states.at(-1)!.x - launch.x,
        clearanceFrames: clearance.length, clearanceSpan: clearance.length ? Math.max(...clearance.map(s => s.x)) - Math.min(...clearance.map(s => s.x)) : 0,
        ceilingContacts: result.frames.filter(f => f.bounds?.after.blocked.up).length,
        scope: "Observed envelope for this trial only; maxima over finite trials are not universal upper bounds" };
}
