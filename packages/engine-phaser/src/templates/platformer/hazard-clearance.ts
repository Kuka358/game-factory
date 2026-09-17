import { ARCADE_GRAVITY_Y, ARCADE_PHYSICS_FPS, PLATFORMER_BODIES, PLATFORMER_ENTITY_HEIGHTS } from "@game-factory/runtime";
import type { PlatformerGameSpec } from "@game-factory/game-spec";

// Preserve the full lethal body and random placement. Only lower its exposed
// top when a height-reachable hazard is too wide for the supported jump.
export function hazardHeightAboveSurface(movement: PlatformerGameSpec["player"]["movement"]): number {
    const normal = PLATFORMER_ENTITY_HEIGHTS.hazard;
    const exposure = normal + PLATFORMER_BODIES.hazard.height / 2;
    const { jump_force: force, move_speed: speed } = movement;
    const idealRise = force ** 2 / (2 * ARCADE_GRAVITY_Y);
    // Height-impossible configurations remain the existing Reviewer's concern.
    if (idealRise < exposure || speed <= 0) return normal;
    // Semi-implicit Arcade samples lie on this parabola. Allow one horizontal
    // step at each crossing boundary; round exposure down to a whole pixel.
    const effectiveForce = force - ARCADE_GRAVITY_Y / (2 * ARCADE_PHYSICS_FPS);
    const crossingTime = (PLATFORMER_BODIES.hazard.width + PLATFORMER_BODIES.player.width) / speed + 2 / ARCADE_PHYSICS_FPS;
    const permittedExposure = Math.floor(effectiveForce ** 2 / (2 * ARCADE_GRAVITY_Y) - ARCADE_GRAVITY_Y * crossingTime ** 2 / 8);
    // Do not hide/remove hazards when even a positive exposure cannot fit.
    if (permittedExposure <= 0 || permittedExposure >= exposure) return normal;
    return permittedExposure - PLATFORMER_BODIES.hazard.height / 2;
}
