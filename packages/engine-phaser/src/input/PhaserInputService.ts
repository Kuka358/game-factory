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

    private readonly heldActions =
        new Set<string>();

    private readonly cleanupCallbacks:
        Array<() => void> =
        [];


    constructor(
        private readonly controls:
            ControlsSpec
    ) {}


    attach(
        scene:
            Phaser.Scene
    ): void {
        this.detach();

        this.attachKeyboard(
            scene
        );

        this.attachPointer(
            scene
        );
    }


    justPressed(
        action:
            string
    ): boolean {
        if (
            !this.pressedActions.has(
                action
            )
        ) {
            return false;
        }


        this.pressedActions.delete(
            action
        );

        return true;
    }


    isPressed(
        action:
            string
    ): boolean {
        return this.heldActions.has(
            action
        );
    }


    dispatchAction(
        action:
            string
    ): void {
        this.pressedActions.add(
            action
        );
    }


    detach(): void {
        for (
            const cleanup of
            this.cleanupCallbacks
        ) {
            cleanup();
        }


        this.cleanupCallbacks.length =
            0;

        this.pressedActions.clear();
        this.heldActions.clear();
    }


    private attachKeyboard(
        scene:
            Phaser.Scene
    ): void {
        for (
            const control of
            this.controls.jump
        ) {
            switch (
                control
            ) {
                case "keyboard_space":
                    this.attachKey(
                        scene,
                        "jump",
                        Phaser.Input.Keyboard
                            .KeyCodes
                            .SPACE
                    );

                    break;

                case "keyboard_up":
                    this.attachKey(
                        scene,
                        "jump",
                        Phaser.Input.Keyboard
                            .KeyCodes
                            .UP
                    );

                    break;
            }
        }


        if (
            "move_left" in
            this.controls
        ) {
            for (
                const control of
                this.controls
                    .move_left
            ) {
                switch (
                    control
                ) {
                    case "keyboard_a":
                        this.attachKey(
                            scene,
                            "move_left",
                            Phaser.Input.Keyboard
                                .KeyCodes
                                .A
                        );

                        break;

                    case "keyboard_left":
                        this.attachKey(
                            scene,
                            "move_left",
                            Phaser.Input.Keyboard
                                .KeyCodes
                                .LEFT
                        );

                        break;
                }
            }
        }


        if (
            "move_right" in
            this.controls
        ) {
            for (
                const control of
                this.controls
                    .move_right
            ) {
                switch (
                    control
                ) {
                    case "keyboard_d":
                        this.attachKey(
                            scene,
                            "move_right",
                            Phaser.Input.Keyboard
                                .KeyCodes
                                .D
                        );

                        break;

                    case "keyboard_right":
                        this.attachKey(
                            scene,
                            "move_right",
                            Phaser.Input.Keyboard
                                .KeyCodes
                                .RIGHT
                        );

                        break;
                }
            }
        }
    }


    private attachPointer(
        scene:
            Phaser.Scene
    ): void {
        if (
            !this.controls.jump.includes(
                "pointer"
            )
        ) {
            return;
        }


        const handlePointerDown =
            (): void => {
                this.pressedActions.add(
                    "jump"
                );
            };


        scene.input.on(
            "pointerdown",
            handlePointerDown
        );


        this.cleanupCallbacks.push(
            () => {
                scene.input.off(
                    "pointerdown",
                    handlePointerDown
                );
            }
        );
    }


    private attachKey(
        scene:
            Phaser.Scene,

        action:
            string,

        keyCode:
            number
    ): void {
        const key =
            scene.input.keyboard
                ?.addKey(
                    keyCode
                );


        if (
            !key
        ) {
            return;
        }


        const handleDown =
            (): void => {
                if (
                    !this.heldActions.has(
                        action
                    )
                ) {
                    this.pressedActions.add(
                        action
                    );
                }


                this.heldActions.add(
                    action
                );
            };


        const handleUp =
            (): void => {
                this.heldActions.delete(
                    action
                );
            };


        key.on(
            "down",
            handleDown
        );

        key.on(
            "up",
            handleUp
        );


        this.cleanupCallbacks.push(
            () => {
                key.off(
                    "down",
                    handleDown
                );

                key.off(
                    "up",
                    handleUp
                );
            }
        );
    }
}