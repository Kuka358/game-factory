import type { PlatformerGameSpec } from "@game-factory/game-spec";
import { ARCADE_GRAVITY_Y, PLATFORMER_BODIES, type DebugRectangle } from "@game-factory/runtime";
import { clearsDangers, diagnoseTransition, jumpArc, safeLandingRegions, surfaceTop, type Region, type TransitionDiagnostic } from "./platformer-traversal.js";

type Movement = PlatformerGameSpec["player"]["movement"];
export interface LookaheadCandidate extends TransitionDiagnostic {
    target: number;
    launch: number;
    destinationIndex: number;
    delay: number;
    clearsDangers: boolean;
    overheadRisk: boolean;
    usable: boolean;
    continuation?: { launch: number; target: number; destinationIndex: number; delay: number };
    landingMargin: number;
}
export interface LookaheadInput {
    movement: Movement;
    surfaces: DebugRectangle[];
    sourceIndex: number;
    playerX: number;
    velocityX: number;
    dangers: DebugRectangle[];
    goalX: number;
    sameSurface?: boolean;
}
const points = (r: Region) => [...new Set([r.min, (r.min + r.max) / 2, r.max])];
const contains = (r: Region, x: number) => x >= r.min && x <= r.max;

// Minimum ascent lead, derived from body geometry. Only zero and this one delay
// are considered; there is no timing search or seed-dependent policy.
export function ascentDelay(movement: Movement, source: DebugRectangle, launch: number, target: number, dangers: DebugRectangle[]): number {
    let delay = 0;
    for (const d of dangers) {
        const entry = d.x - (d.width + PLATFORMER_BODIES.player.width) / 2 - 2;
        if (entry < launch || entry > target) continue;
        const height = surfaceTop(source) - (d.y - d.height / 2) + 2;
        if (height <= 0) continue;
        const disc = movement.jump_force ** 2 - 2 * ARCADE_GRAVITY_Y * height;
        if (disc < 0) continue; // Clearance check will reject; delay cannot fix height.
        const riseTime = (movement.jump_force - Math.sqrt(disc)) / ARCADE_GRAVITY_Y;
        delay = Math.max(delay, riseTime - (entry - launch) / movement.move_speed + 1 / 30);
    }
    return Math.max(0, delay);
}

function overheadRisk(input: LookaheadInput, source: DebugRectangle, destinationIndex: number, launch: number, target: number, delay: number, flightTime: number): boolean {
    const arc = jumpArc(input.movement, source, input.surfaces[destinationIndex]!);
    // Relevant rectangle boundary crossing times, not a general physics simulator.
    return input.surfaces.some((p, index) => {
        if (index === input.sourceIndex || index === destinationIndex) return false;
        const entry = delay + (p.x - p.width / 2 - PLATFORMER_BODIES.player.width / 2 - launch) / input.movement.move_speed;
        const exit = delay + (p.x + p.width / 2 + PLATFORMER_BODIES.player.width / 2 - launch) / input.movement.move_speed;
        if (entry > flightTime || exit < 0 || p.x - p.width / 2 > target + PLATFORMER_BODIES.player.width / 2) return false;
        return [Math.max(0, entry), Math.min(flightTime, exit), Math.max(0, Math.min(flightTime, (entry + exit) / 2))].some(t => {
            const foot = arc.foot(t);
            return foot > surfaceTop(p) && foot - PLATFORMER_BODIES.player.height < p.y + p.height / 2;
        });
    });
}

function candidatesAt(input: LookaheadInput, launch: number): LookaheadCandidate[] {
    const source = input.surfaces[input.sourceIndex]!;
    const sourceRegions = safeLandingRegions(source, input.dangers, input.movement.move_speed);
    // Key release may stop just outside the conservative interval while the body
    // is still supported. Do not invent another region and jump within it.
    const currentRegion = sourceRegions.find(r => contains(r, launch)) ?? [...sourceRegions]
        .sort((a, b) => Math.min(Math.abs(a.min - launch), Math.abs(a.max - launch)) - Math.min(Math.abs(b.min - launch), Math.abs(b.max - launch)))[0];
    const destinationIndices = [input.sourceIndex, input.sourceIndex + 1, input.sourceIndex + 2]
        .filter(index => input.surfaces[index] && (index !== input.sourceIndex || input.sameSurface));
    return destinationIndices.flatMap(destinationIndex => {
        const destination = input.surfaces[destinationIndex]!;
        return safeLandingRegions(destination, input.dangers, input.movement.move_speed).flatMap(region => {
            if (destinationIndex === input.sourceIndex && (region.max <= launch || region === currentRegion || (currentRegion && region.min === currentRegion.min))) return [];
            return points(region).filter(target => target > launch + 4).flatMap(target => {
                const diagnostic = diagnoseTransition(input.movement, source, launch, destination, { min: target, max: target });
                const arc = jumpArc(input.movement, source, destination);
                return [...new Set([0, ascentDelay(input.movement, source, launch, target, input.dangers)])].map(delay => {
                    const reach = Math.max(0, arc.flightTime - delay) * input.movement.move_speed;
                    const clear = clearsDangers(input.movement, source, launch, target, arc.flightTime, input.dangers, { delay, ceiling: true });
                    const overhead = overheadRisk(input, source, destinationIndex, launch, target, delay, arc.flightTime);
                    const usable = diagnostic.verdict !== "unreachable" && reach - (target - launch) >= input.movement.move_speed / 30 && clear && !overhead;
                    return { ...diagnostic, ...(overhead ? { verdict: "uncertain" as const, reason: "Possible intermediate platform underside/side contact; runtime verification required" } : {}), landing: region, launch, target, destinationIndex, delay, clearsDangers: clear, overheadRisk: overhead, usable,
                        landingMargin: Math.min(target - region.min, region.max - target) - Math.abs(input.velocityX) / 30 };
                });
            });
        });
    });
}

// Exactly one onward jump. Connected safe ground permits setup movement in either
// direction; danger-separated regions require a jump and are never walked across.
export function lookaheadCandidates(input: LookaheadInput): LookaheadCandidate[] {
    return candidatesAt(input, input.playerX).map(candidate => {
        if (!candidate.usable) return candidate;
        if (candidate.destinationIndex === input.surfaces.length - 1 && contains(candidate.landing, input.goalX)) {
            return { ...candidate, continuation: { launch: candidate.target, target: input.goalX, destinationIndex: candidate.destinationIndex, delay: 0 } };
        }
        const nextInput = { ...input, sourceIndex: candidate.destinationIndex, velocityX: 0, sameSurface: true };
        const launches = [...new Set([candidate.target, ...points(candidate.landing)])];
        const onward = launches.flatMap(launch => candidatesAt(nextInput, launch)).filter(c => c.usable)
            .sort((a, b) => a.destinationIndex - b.destinationIndex || a.delay - b.delay || b.landingMargin - a.landingMargin)[0];
        return { ...candidate, ...(onward ? { continuation: { launch: onward.launch, target: onward.target, destinationIndex: onward.destinationIndex, delay: onward.delay } } : {}) };
    });
}

export function selectLookaheadCandidate(candidates: LookaheadCandidate[]): LookaheadCandidate | undefined {
    return candidates.filter(c => c.usable).sort((a, b) => Number(Boolean(b.continuation)) - Number(Boolean(a.continuation))
        || a.destinationIndex - b.destinationIndex || b.landingMargin - a.landingMargin || a.delay - b.delay || b.target - a.target)[0];
}
