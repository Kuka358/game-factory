import type { PlatformerGameSpec } from "@game-factory/game-spec";
import { ARCADE_GRAVITY_Y, PLATFORMER_BODIES, type DebugRectangle } from "@game-factory/runtime";

export interface Region { min: number; max: number }
export interface TransitionDiagnostic {
    verdict: "reachable" | "unreachable" | "uncertain";
    reason: string;
    flightTime: number;
    horizontalReach: number;
    landing: Region;
    ceiling?: { contactTime: number; flightTime: number; horizontalReach: number };
}
type Movement = PlatformerGameSpec["player"]["movement"];
export const surfaceTop = (p: DebugRectangle) => p.y - p.height / 2;

// World top is y=0; Arcade cancels upward velocity at the player's head contact.
// Continuous estimates remain approximate near finite-step contacts.
export function jumpArc(movement: Movement, source: DebugRectangle, destination: DebugRectangle) {
    const start = surfaceTop(source);
    const destinationTop = surfaceTop(destination);
    const headroom = Math.max(0, start - PLATFORMER_BODIES.player.height);
    const v = movement.jump_force;
    const discriminant = v * v + 2 * ARCADE_GRAVITY_Y * (destinationTop - start);
    const nominalTime = discriminant < 0 ? 0 : (v + Math.sqrt(discriminant)) / ARCADE_GRAVITY_Y;
    const hitsCeiling = v * v / (2 * ARCADE_GRAVITY_Y) > headroom;
    const contactTime = hitsCeiling ? (v - Math.sqrt(v * v - 2 * ARCADE_GRAVITY_Y * headroom)) / ARCADE_GRAVITY_Y : undefined;
    const flightTime = contactTime === undefined ? nominalTime : contactTime + Math.sqrt(Math.max(0, 2 * (destinationTop - PLATFORMER_BODIES.player.height) / ARCADE_GRAVITY_Y));
    const foot = (t: number) => contactTime !== undefined && t >= contactTime
        ? PLATFORMER_BODIES.player.height + ARCADE_GRAVITY_Y * (t - contactTime) ** 2 / 2
        : start - v * t + ARCADE_GRAVITY_Y * t * t / 2;
    return { nominalTime, flightTime, contactTime, foot };
}

// The body center stays inside the surface with a two-frame control margin.
// Arcade supports partial edge overlap; requiring the entire body on the surface
// would incorrectly discard narrow but usable landing regions before a hazard.
export function safeLandingRegions(platform: DebugRectangle, dangers: DebugRectangle[], speed: number): Region[] {
    const margin = PLATFORMER_BODIES.player.width / 2 + speed / 30 + 2;
    const edgeMargin = speed / 30 + 2;
    let regions = [{ min: platform.x - platform.width / 2 + edgeMargin, max: platform.x + platform.width / 2 - edgeMargin }];
    for (const danger of dangers.filter(d => Math.abs(d.y - surfaceTop(platform)) <= d.height + PLATFORMER_BODIES.player.height)) {
        const min = danger.x - danger.width / 2 - margin;
        const max = danger.x + danger.width / 2 + margin;
        regions = regions.flatMap(r => max <= r.min || min >= r.max ? [r] : [
            { min: r.min, max: Math.min(r.max, min) }, { min: Math.max(r.min, max), max: r.max }
        ]).filter(r => r.max >= r.min);
    }
    return regions.filter(r => r.max >= r.min);
}

export function diagnoseTransition(movement: Movement, source: DebugRectangle, launchX: number, destination: DebugRectangle, landing: Region): TransitionDiagnostic {
    const v = movement.jump_force;
    const delta = surfaceTop(destination) - surfaceTop(source);
    const discriminant = v * v + 2 * ARCADE_GRAVITY_Y * delta;
    const flightTime = discriminant < 0 ? 0 : (v + Math.sqrt(discriminant)) / ARCADE_GRAVITY_Y;
    const horizontalReach = flightTime * movement.move_speed;
    const distance = Math.max(landing.min - launchX, launchX - landing.max, 0);
    const arc = jumpArc(movement, source, destination);
    const ceiling = arc.contactTime === undefined ? undefined : { contactTime: arc.contactTime, flightTime: arc.flightTime, horizontalReach: arc.flightTime * movement.move_speed };
    const base = { flightTime, horizontalReach, landing, ...(ceiling ? { ceiling } : {}) };
    if (discriminant < 0 || distance > horizontalReach) return { ...base, verdict: "unreachable", reason: "Outside the ideal ballistic envelope for this launch and region (not a whole-level proof)" };
    if (surfaceTop(source) - PLATFORMER_BODIES.player.height < v * v / (2 * ARCADE_GRAVITY_Y)) return { ...base, verdict: "uncertain", reason: "Jump intersects the world ceiling; free-flight timing is not authoritative" };
    if (horizontalReach - distance < movement.move_speed / 30) return { ...base, verdict: "uncertain", reason: "Less than two physics frames of reach margin" };
    return { ...base, verdict: "reachable", reason: "Inside the ideal envelope; obstacle and runtime checks still required" };
}

// Continuous rectangle clearance for a constant-speed jump followed by release at
// target X. No enemies move in the current runtime. It does not simulate Arcade
// collision resolution, side contacts, ceiling contacts or arbitrary routes.
export function clearsDangers(movement: Movement, source: DebugRectangle, launchX: number, targetX: number, flightTime: number, dangers: DebugRectangle[], options: { delay?: number; ceiling?: boolean } = {}): boolean {
    const speed = movement.move_speed;
    const direction = Math.sign(targetX - launchX) || 1;
    const travelTime = Math.abs(targetX - launchX) / speed;
    const delay = options.delay ?? 0;
    const arc = jumpArc(movement, source, source);
    const foot = options.ceiling ? arc.foot : (t: number) => surfaceTop(source) - movement.jump_force * t + ARCADE_GRAVITY_Y * t * t / 2;
    for (const d of dangers) {
        const half = (d.width + PLATFORMER_BODIES.player.width) / 2 + 2;
        const a = (d.x - half - launchX) * direction / speed;
        const b = (d.x + half - launchX) * direction / speed;
        if (Math.max(a, b) < 0) continue;
        const start = Math.min(a, b) <= 0 ? 0 : delay + Math.min(a, b);
        let end = Math.min(flightTime, delay + Math.max(a, b));
        if (Math.abs(targetX - d.x) <= half) end = flightTime;
        else end = Math.min(end, delay + travelTime);
        if (start <= end && start <= delay + travelTime && Math.max(foot(start), foot(end)) >= d.y - d.height / 2 - 2) return false;
    }
    return true;
}

export function landingCandidates(movement: Movement, source: DebugRectangle, launchX: number, destination: DebugRectangle, dangers: DebugRectangle[]) {
    return safeLandingRegions(destination, dangers, movement.move_speed).map(region => {
        const target = Math.max(region.min, Math.min(region.max, launchX));
        const diagnostic = diagnoseTransition(movement, source, launchX, destination, region);
        return { target, region, ...diagnostic, clearsDangers: clearsDangers(movement, source, launchX, target, diagnostic.flightTime, dangers) };
    });
}

export function hazardClearance(movement: Movement, platform: DebugRectangle, danger: DebugRectangle) {
    const height = surfaceTop(platform) - (danger.y - danger.height / 2);
    const discriminant = movement.jump_force ** 2 - 2 * ARCADE_GRAVITY_Y * height;
    const available = discriminant < 0 ? 0 : 2 * Math.sqrt(discriminant) / ARCADE_GRAVITY_Y * movement.move_speed;
    const required = danger.width + PLATFORMER_BODIES.player.width;
    return { height, available, required, verdict: available < required ? "unreachable" as const : "uncertain" as const,
        scope: "Single jump across this danger from the same platform height; other launch surfaces/routes are not ruled out" };
}

export function dangerJump(movement: Movement, platform: DebugRectangle, danger: DebugRectangle) {
    if (hazardClearance(movement, platform, danger).verdict === "unreachable") return undefined;
    const clearance = surfaceTop(platform) - (danger.y - danger.height / 2) + 2;
    const discriminant = movement.jump_force ** 2 - 2 * ARCADE_GRAVITY_Y * clearance;
    if (discriminant <= 0) return undefined;
    const riseTime = (movement.jump_force - Math.sqrt(discriminant)) / ARCADE_GRAVITY_Y;
    const buffer = movement.move_speed / 30 + 2;
    const half = (danger.width + PLATFORMER_BODIES.player.width) / 2;
    const launch = danger.x - half - movement.move_speed * riseTime - buffer;
    const target = danger.x + half + buffer;
    const region = safeLandingRegions(platform, [danger], movement.move_speed).find(r => target >= r.min && target <= r.max);
    if (!region) return undefined;
    return { launch, target, region };
}
