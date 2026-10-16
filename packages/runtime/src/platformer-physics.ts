// Shared gameplay constants: these never depend on artwork or LLM output.
export const ARCADE_GRAVITY_Y = 1200;
// Existing Arcade default, now explicit so generation uses the runtime step rate.
export const ARCADE_PHYSICS_FPS = 60;
export function calculateArcadeJumpHeight(jumpForce: number): number {
    return (jumpForce * jumpForce) / (2 * ARCADE_GRAVITY_Y);
}
export const PLATFORMER_BODIES = {
    player: { width: 40, height: 56 },
    enemy: { width: 40, height: 56 },
    hazard: { width: 38, height: 28 },
    collectible: { width: 30, height: 30 },
    goal: { width: 40, height: 96 }
} as const;
export const PLATFORMER_ENTITY_HEIGHTS = { enemy: 32, hazard: 20, collectible: 76 } as const;
export const PLATFORMER_FINISH_MARGIN = 220;
export const PLATFORMER_WORLD_EDGE_MARGIN = 40;
