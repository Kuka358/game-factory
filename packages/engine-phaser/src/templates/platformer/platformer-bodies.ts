import type Phaser from "phaser";

// World-space dimensions are gameplay constants, never image measurements.
export const PLATFORMER_BODIES = {
    player: { width: 40, height: 56 },
    enemy: { width: 40, height: 56 },
    hazard: { width: 38, height: 28 },
    collectible: { width: 30, height: 30 },
    goal: { width: 40, height: 96 }
} as const;

export function setPlatformerBody(
    image: Phaser.Physics.Arcade.Image,
    size: { width: number; height: number }
): void {
    const body = image.body as Phaser.Physics.Arcade.Body;
    // Arcade's dynamic setSize accepts unscaled dimensions and scales them itself.
    body.setSize(size.width / Math.abs(image.scaleX), size.height / Math.abs(image.scaleY), true);
    body.updateFromGameObject();
}
