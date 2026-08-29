import Phaser from "phaser";

import type {
    ControlsSpec
} from "@game-factory/game-spec";

import type {
    InputService
} from "@game-factory/runtime";

export class PhaserInputService
    implements InputService
{
    private readonly pressedActions =
        new Set<string>();

    private readonly cleanupCallbacks:
        Array<() => void> = [];

    constructor(
        private readonly controls: ControlsSpec
    ) {}

    attach(scene: Phaser.Scene): void {
        this.detach();

        this.attachKeyboard(scene);
        this.attachPointer(scene);
    }

    justPressed(action: string): boolean {
        if (!this.pressedActions.has(action)) {
            return false;
        }

        this.pressedActions.delete(action);

        return true;
    }

    detach(): void {
        for (
            const cleanup of
            this.cleanupCallbacks
        ) {
            cleanup();
        }

        this.cleanupCallbacks.length = 0;
        this.pressedActions.clear();
    }

    private attachKeyboard(
        scene: Phaser.Scene
    ): void {
        if (
            !this.controls.jump.includes(
                "keyboard_space"
            )
        ) {
            return;
        }

        const key =
            scene.input.keyboard?.addKey(
                Phaser.Input.Keyboard.KeyCodes.SPACE
            );

        if (!key) {
            return;
        }

        const handleDown = (): void => {
            this.pressedActions.add("jump");
        };

        key.on("down", handleDown);

        this.cleanupCallbacks.push(() => {
            key.off("down", handleDown);
        });
    }

    private attachPointer(
        scene: Phaser.Scene
    ): void {
        if (
            !this.controls.jump.includes(
                "pointer"
            )
        ) {
            return;
        }

        const handlePointerDown = (): void => {
            this.pressedActions.add("jump");
        };

        scene.input.on(
            "pointerdown",
            handlePointerDown
        );

        this.cleanupCallbacks.push(() => {
            scene.input.off(
                "pointerdown",
                handlePointerDown
            );
        });
    }

    dispatchAction(action: string): void {
        this.pressedActions.add(action);
    }
}