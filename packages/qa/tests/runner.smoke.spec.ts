import {
    expect,
    test,
    type Page
} from "@playwright/test";

import type {
    GameFactoryDebugBridge
} from "@game-factory/engine-phaser";

import type {
    GameDebugState
} from "@game-factory/runtime";

import {
    GameFactoryDriver
} from "../src/GameFactoryDriver.js";

async function getGameState(
    page: Page
): Promise<GameDebugState> {
    return page.evaluate(() => {
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

async function dispatchAction(
    page: Page,
    action: string
): Promise<void> {
    await page.evaluate((actionName) => {
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

        bridge.dispatchAction(actionName);
    }, action);
}

async function restartGame(
    page: Page
): Promise<void> {
    await page.evaluate(() => {
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

test("endless runner gameplay smoke test", async ({
    page
}) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const notFoundUrls: string[] = [];

    const game = new GameFactoryDriver(page);

    page.on("pageerror", (error) => {
        pageErrors.push(error.message);
    });

    page.on("console", (message) => {
        if (message.type() === "error") {
            consoleErrors.push(
                message.text()
            );
        }
    });

    page.on("response", (response) => {
        if (response.status() === 404) {
            notFoundUrls.push(response.url());
            console.log("404 URL:", response.url());
        }
    });

    await page.goto("/");

    await expect(
        page.locator("canvas")
    ).toBeVisible();

    await expect.poll(
        async () => {
            const state =
                await game.getState();

            return state.ready;
        },
        {
            timeout: 5_000
        }
    ).toBe(true);

    const initialState =
        await game.getState();

    expect(initialState.scene).toBe("game");

    expect(initialState.game_over).toBe(false);

    expect(initialState.player).not.toBeNull();

    expect(initialState.player?.alive).toBe(true);

    const initialY =
        initialState.player!.y;

    await game.dispatchAction("jump");

    await expect.poll(
        async () => {
            const state =
                await game.getState();

            return state.player?.y ?? initialY;
        },
        {
            timeout: 2_000
        }
    ).toBeLessThan(initialY);

    await expect.poll(
        async () => {
            const state =
                await game.getState();

            return state.game_over;
        },
        {
            timeout: 12_000
        }
    ).toBe(true);

    const gameOverState =
        await game.getState();

    expect(
        gameOverState.player?.alive
    ).toBe(false);

    expect(
        gameOverState.score
    ).toBeGreaterThan(0);

    const finalScore =
        gameOverState.score;

    await game.restart()

    await expect.poll(
        async () => {
            const state =
                await game.getState();

            return (
                state.ready &&
                !state.game_over &&
                state.score < finalScore
            );
        },
        {
            timeout: 3_000
        }
    ).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

