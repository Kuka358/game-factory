import { isPlatformerGameSpec, type GameSpecValidationError } from "@game-factory/game-spec";
import { ARCADE_GRAVITY_Y, PLATFORMER_BODIES, PLATFORMER_ENTITY_HEIGHTS, PLATFORMER_FINISH_MARGIN, PLATFORMER_WORLD_EDGE_MARGIN } from "@game-factory/runtime";
import type { ReviewGameInput } from "./GameReviewer.js";

// Preconditions: authoritative schema and template capability validation passed.
// This is part of Reviewer, not a level generator or a seed/playability solver.
export function reviewPlatformerSemantics(input: ReviewGameInput) {
    const errors: GameSpecValidationError[] = [];
    const warnings: string[] = [];
    const { spec, platform } = input;
    if (!isPlatformerGameSpec(spec)) return { errors, warnings };

    if (!platform.keyboardInput) {
        errors.push({ path: "/controls/move_right", message: "Platformer movement requires keyboard input; the current template has no touch movement controls. Enable keyboard input on the target platform." });
    }
    // Pointer includes mouse: touchInput=false alone does not disable it in a browser.
    const canJump = spec.controls.jump.some(binding => binding === "pointer" || platform.keyboardInput);
    if (!canJump) {
        errors.push({ path: "/controls/jump", message: "No configured jump/restart binding is available on the target platform. Use an available keyboard binding or enable pointer input." });
    }

    const settings = spec.platformer;
    const maximumRise = spec.player.movement.jump_force ** 2 / (2 * ARCADE_GRAVITY_Y);
    const flatContinuousGround = settings.platform_height_variation === 0 && settings.platform_gap_max === 0;
    // Sufficient (not necessary) bound: four platforms fit and the generator must
    // continue past three. Thus index 2 is neither a protected start nor the goal.
    // No concrete layout or random stream is evaluated here.
    const hasInteriorPlatform = settings.level_length > 4 * settings.platform_width_max + Math.max(PLATFORMER_FINISH_MARGIN, PLATFORMER_WORLD_EDGE_MARGIN);
    const guaranteedEnemy = settings.enemy_density === 1;
    const guaranteedDanger = guaranteedEnemy || settings.hazard_density === 1;
    const minimumDangerTop = guaranteedEnemy
        ? PLATFORMER_ENTITY_HEIGHTS.enemy + PLATFORMER_BODIES.enemy.height / 2
        : Math.min(PLATFORMER_ENTITY_HEIGHTS.enemy + PLATFORMER_BODIES.enemy.height / 2, PLATFORMER_ENTITY_HEIGHTS.hazard + PLATFORMER_BODIES.hazard.height / 2);
    if (flatContinuousGround && hasInteriorPlatform && guaranteedDanger && maximumRise < minimumDangerTop) {
        errors.push({ path: "/player/movement/jump_force", message: `Maximum jump rise (${maximumRise.toFixed(2)}) is below the guaranteed lethal obstacle top (${minimumDangerTop}) on flat continuous ground. Increase jump_force or remove the guaranteed danger configuration; there is no combat or alternate route.` });
    }
    const collectibleClearance = PLATFORMER_ENTITY_HEIGHTS.collectible - PLATFORMER_BODIES.collectible.height / 2 - PLATFORMER_BODIES.player.height;
    if (flatContinuousGround && hasInteriorPlatform && settings.collectible_density > 0 && maximumRise < collectibleClearance) {
        warnings.push("/platformer/collectible_density: Standing jumps cannot reach collectible height on this flat level. Increase jump_force if collecting is intended. Score is optional; the goal does not require collectibles.");
    }
    if (settings.enemy_density === 1 && settings.hazard_density > 0) {
        warnings.push("/platformer/hazard_density: Enemies take priority on every eligible platform, so no hazards will spawn. Lower enemy_density if both categories are intended.");
    }
    return { errors, warnings };
}
