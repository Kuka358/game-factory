import type Phaser from "phaser";

// World-space dimensions are gameplay constants, never image measurements.
export { PLATFORMER_BODIES } from "@game-factory/runtime";

export function setPlatformerBody(
    image: Phaser.Physics.Arcade.Image,
    size: { width: number; height: number }
): void {
    const body = image.body as Phaser.Physics.Arcade.Body;
    // Arcade's dynamic setSize accepts unscaled dimensions and scales them itself.
    body.setSize(size.width / Math.abs(image.scaleX), size.height / Math.abs(image.scaleY), true);
    body.updateFromGameObject();
}
