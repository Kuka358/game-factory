import type { Page } from "@playwright/test";

import type {
    GameFactoryDebugBridge
} from "@game-factory/engine-phaser";

import type {
    GameDebugState
} from "@game-factory/runtime";

export class GameFactoryDriver {
    constructor(
        private readonly page: Page
    ) {}

    async getState(): Promise<GameDebugState> {
        return this.page.evaluate(() => {
            const bridge = (
                window as Window & {
                    __GAME_FACTORY__?:
                        GameFactoryDebugBridge;
                }
            ).__GAME_FACTORY__;

            if (!bridge) {
                throw new Error(
                    "Game Factory debug bridge is not installed"
                );
            }

            return bridge.getState();
        });
    }

    async dispatchAction(
        action: string
    ): Promise<void> {
        await this.page.evaluate(
            (actionName) => {
                const bridge = (
                    window as Window & {
                        __GAME_FACTORY__?:
                            GameFactoryDebugBridge;
                    }
                ).__GAME_FACTORY__;

                if (!bridge) {
                    throw new Error(
                        "Game Factory debug bridge is not installed"
                    );
                }

                bridge.dispatchAction(
                    actionName
                );
            },
            action
        );
    }

    async restart(): Promise<void> {
        await this.page.evaluate(() => {
            const bridge = (
                window as Window & {
                    __GAME_FACTORY__?:
                        GameFactoryDebugBridge;
                }
            ).__GAME_FACTORY__;

            if (!bridge) {
                throw new Error(
                    "Game Factory debug bridge is not installed"
                );
            }

            bridge.restart();
        });
    }
}