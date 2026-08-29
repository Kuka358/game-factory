import Phaser from "phaser";

import type {
    DebugError,
    GameContext,
    GameDebugState
} from "@game-factory/runtime";

import type {
    PhaserInputService
} from "../input/PhaserInputService.js";

export interface GameFactoryDebugBridge {
    getState(): GameDebugState;

    getScene(): string | null;

    dispatchAction(action: string): void;

    restart(): void;

    pause(): void;

    resume(): void;

    getErrors(): readonly DebugError[];
}

declare global {
    interface Window {
        __GAME_FACTORY__?: GameFactoryDebugBridge;
    }
}

export function installGameFactoryDebugBridge(
    game: Phaser.Game,
    ctx: GameContext,
    input: PhaserInputService
): void {
    const getGameScene = (): Phaser.Scene | null => {
        try {
            return game.scene.getScene("game");
        } catch {
            return null;
        }
    };

    window.__GAME_FACTORY__ = {
        getState(): GameDebugState {
            return ctx.debug.getState();
        },

        getScene(): string | null {
            return ctx.debug.getState().scene;
        },

        dispatchAction(action: string): void {
            input.dispatchAction(action);
        },

        restart(): void {
            const scene = getGameScene();

            scene?.scene.restart();
        },

        pause(): void {
            const scene = getGameScene();

            scene?.scene.pause();
        },

        resume(): void {
            const scene = getGameScene();

            scene?.scene.resume();
        },

        getErrors(): readonly DebugError[] {
            return ctx.debug.getErrors();
        }
    };
}