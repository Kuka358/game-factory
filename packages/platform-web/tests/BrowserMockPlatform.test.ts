import {
    describe,
    expect,
    it
} from "vitest";

import {
    BrowserMockPlatform
} from "../src/index.js";

describe(
    "BrowserMockPlatform",
    () => {
        it(
            "initializes and reports game ready",
            async () => {
                const platform =
                    new BrowserMockPlatform({
                        language:
                            "ru"
                    });

                expect(
                    platform.isInitialized
                ).toBe(
                    false
                );

                await platform.init();

                expect(
                    platform.isInitialized
                ).toBe(
                    true
                );

                await platform.gameReady();

                expect(
                    platform.isGameReady
                ).toBe(
                    true
                );

                expect(
                    platform.getLanguage()
                ).toBe(
                    "ru"
                );
            }
        );

        it(
            "mock ads immediately succeed",
            async () => {
                const platform =
                    new BrowserMockPlatform();

                await platform.init();

                await expect(
                    platform.showInterstitial()
                ).resolves.toEqual({
                    shown:
                        true,

                    reason:
                        "completed"
                });

                await expect(
                    platform.showRewarded()
                ).resolves.toEqual({
                    shown:
                        true,

                    rewarded:
                        true,

                    reason:
                        "completed"
                });
            }
        );

        it(
            "saves and loads data",
            async () => {
                const platform =
                    new BrowserMockPlatform();

                await platform.init();

                const original = {
                    score:
                        120,

                    upgrades: [
                        "speed"
                    ]
                };

                await platform.save(
                    original
                );

                /*
                 * Mutating the original value
                 * must not mutate platform storage.
                 */
                original.score =
                    999;

                const loaded =
                    await platform.load<{
                        score:
                            number;

                        upgrades:
                            string[];
                    }>();

                expect(
                    loaded
                ).toEqual({
                    score:
                        120,

                    upgrades: [
                        "speed"
                    ]
                });
            }
        );

        it(
            "returns mock player",
            async () => {
                const platform =
                    new BrowserMockPlatform({
                        player: {
                            id:
                                "local-player",

                            name:
                                "Local Player"
                        }
                    });

                await platform.init();

                await expect(
                    platform.getPlayer()
                ).resolves.toEqual({
                    id:
                        "local-player",

                    name:
                        "Local Player"
                });
            }
        );

        it(
            "requires initialization before platform operations",
            async () => {
                const platform =
                    new BrowserMockPlatform();

                await expect(
                    platform.showRewarded()
                ).rejects.toThrow(
                    /init\(\) must be called first/
                );

                await expect(
                    platform.save({
                        score:
                            1
                    })
                ).rejects.toThrow(
                    /init\(\) must be called first/
                );
            }
        );
    }
);