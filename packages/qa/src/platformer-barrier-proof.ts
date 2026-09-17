import { ARCADE_GRAVITY_Y, PLATFORMER_BODIES, type DebugRectangle } from "@game-factory/runtime";
import type { PlatformerGameSpec } from "@game-factory/game-spec";

// Necessary bound, not an empirical maximum promoted into a universal claim.
// Arcade's fixed-step gravity integration cannot exceed the continuous apex.
// Two complete steps of horizontal slack cover entry/exit sampling boundaries.
export function supportedJumpBarrierBound(movement: PlatformerGameSpec["player"]["movement"], sourceTop: number, danger: DebugRectangle, fps: number) {
    if (!(Number.isFinite(fps) && fps > 0)) throw new Error("A measured physics step rate is required");
    const requiredRise = sourceTop - (danger.y - danger.height / 2);
    const maximumRise = movement.jump_force ** 2 / (2 * ARCADE_GRAVITY_Y);
    const discriminant = movement.jump_force ** 2 - 2 * ARCADE_GRAVITY_Y * requiredRise;
    const duration = discriminant < 0 ? 0 : 2 * Math.sqrt(discriminant) / ARCADE_GRAVITY_Y;
    const spanUpperBound = duration * movement.move_speed + 2 * movement.move_speed / fps;
    const requiredSpan = danger.width + PLATFORMER_BODIES.player.width;
    return { requiredRise, maximumRise, spanUpperBound, requiredSpan,
        state: discriminant < 0 || spanUpperBound < requiredSpan ? "proven_unreachable" as const : "uncertain" as const,
        scope: "Single above-danger jump from this supported height with no intervening safe support. Delayed/reversed input cannot exceed the speed bound. Below-platform routes and render-catch-up takeoff states are separate graph alternatives, not globally ruled out." };
}

// A sufficient vertical cut certificate for the current static rectangular
// runtime. It deliberately refuses layouts with intermediate/overlapping support.
export function hazardCutCertificate(surfaces: DebugRectangle[], danger: DebugRectangle,
    movement: PlatformerGameSpec["player"]["movement"], fps: number, goal: DebugRectangle) {
    const half = PLATFORMER_BODIES.player.width / 2;
    const left = danger.x - danger.width / 2 - half, right = danger.x + danger.width / 2 + half;
    const support = surfaces.find(p => p.x - p.width / 2 <= left && p.x + p.width / 2 >= right
        && danger.y + danger.height / 2 <= p.y - p.height / 2);
    if (!support) return undefined;
    const top = support.y - support.height / 2;
    // A 56px body cannot fit through the gap under this lethal rectangle.
    if (top - (danger.y + danger.height / 2) >= PLATFORMER_BODIES.player.height) return undefined;
    const otherSupportsCrossing = surfaces.some(p => p !== support && p.x + p.width / 2 + half > left && p.x - p.width / 2 - half < right);
    if (otherSupportsCrossing) return undefined;
    const leftSupports = surfaces.filter(p => p.x - p.width / 2 < left);
    const highestLaunchTop = Math.min(...leftSupports.map(p => p.y - p.height / 2));
    const above = supportedJumpBarrierBound(movement, highestLaunchTop, danger, fps);
    if (above.requiredRise <= 0 || above.state !== "proven_unreachable") return undefined;
    const underFoot = support.y + support.height / 2 + PLATFORMER_BODIES.player.height;
    // Even granting one otherwise unsupported jump below the solid platform,
    // the body cannot return to any surface top. There are no lower supports.
    const underReturnTop = underFoot - above.maximumRise;
    const lowestSurfaceTop = Math.max(...surfaces.map(p => p.y - p.height / 2));
    if (underReturnTop <= lowestSurfaceTop) return undefined;
    const finish = surfaces.at(-1)!;
    const goalProtectedByFinish = goal.x - goal.width / 2 > finish.x - finish.width / 2 + half
        && goal.x + goal.width / 2 < finish.x + finish.width / 2 - half
        && goal.y + goal.height / 2 <= finish.y - finish.height / 2;
    if (!goalProtectedByFinish || goal.x <= right) return undefined;
    return { left, right, highestLaunchTop, above, underFoot, underReturnTop, lowestSurfaceTop,
        state: "proven_unreachable" as const,
        assumptions: "Current static solids, lethal danger contact, direct bounded horizontal velocity, one grounded jump, fixed-step gravity, no usable lower floor/wall jump/combat (fall death precedes the world bottom). Above crossing excluded including two boundary steps; between danger/solid cannot fit; below cannot recover onto support or enter the goal through its solid platform." };
}
