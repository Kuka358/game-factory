import {
    describe,
    expect,
    it
} from "vitest";

import {
    YandexPlatform,

    type YandexPlayerLike,
    type YandexSdkLike
} from "../src/index.js";

interface MockState {
    readyCalls:
        number;

    savedData:
        Record<
            string,
            unknown
        >;

    saveFlush?:
        boolean;
}

function createMockSdk() {
    const state:
        MockState = {
        readyCalls:
            0,

        savedData:
            {}
    };

    const player:
        YandexPlayerLike = {
        async setData(
            data,
            flush
        ) {
            state.savedData = {
                ...state.savedData,
                ...data
            };

            state.saveFlush =
                flush;
        },

        async getData(
            keys
        ) {
            if (!keys) {
                return {
                    ...state.savedData
                };
            }

            const result:
                Record<
                    string,
                    unknown
                > = {};

            for (
                const key of
                keys
            ) {
                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            state.savedData,
                            key
                        )
                ) {
                    result[key] =
                        state.savedData[
                            key
                        ];
                }
            }

            return result;
        },

        getUniqueID() {
            return "player-123";
        },

        getName() {
            return "Test Player";
        },

        getPhoto() {
            return "https://example.com/avatar.png";
        }
    };

    const sdk:
        YandexSdkLike = {
        environment: {
            i18n: {
                lang:
                    "ru"
            }
        },

        features: {
            LoadingAPI: {
                ready() {
                    state.readyCalls +=
                        1;
                }
            }
        },

        adv: {
            showFullscreenAdv(
                options
            ) {
                options.callbacks
                    ?.onOpen?.();

                options.callbacks
                    ?.onClose?.(
                        true
                    );
            },

            showRewardedVideo(
                options
            ) {
                options.callbacks
                    ?.onOpen?.();

                options.callbacks
                    ?.onRewarded?.();

                options.callbacks
                    ?.onClose?.(
                        true
                    );
            }
        },

        async getPlayer() {
            return player;
        }
    };

    return {
        sdk,
        state
    };
}

describe(
    "YandexPlatform",
    () => {
        it(
            "initializes SDK and exposes language and player",
            async () => {
                const {
                    sdk
                } =
                    createMockSdk();

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

                expect(
                    platform.getLanguage()
                ).toBe(
                    "ru"
                );

                await expect(
                    platform.getPlayer()
                ).resolves.toEqual({
                    id:
                        "player-123",

                    name:
                        "Test Player",

                    avatarUrl:
                        "https://example.com/avatar.png"
                });
            }
        );

        it(
            "sends gameReady only once",
            async () => {
                const {
                    sdk,
                    state
                } =
                    createMockSdk();

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

                await platform.gameReady();
                await platform.gameReady();

                expect(
                    state.readyCalls
                ).toBe(
                    1
                );
            }
        );

        it(
            "saves and loads game data",
            async () => {
                const {
                    sdk,
                    state
                } =
                    createMockSdk();

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

                await platform.save({
                    score:
                        150,

                    level:
                        3
                });

                const loaded =
                    await platform.load<{
                        score:
                            number;

                        level:
                            number;
                    }>();

                expect(
                    loaded
                ).toEqual({
                    score:
                        150,

                    level:
                        3
                });

                expect(
                    state.saveFlush
                ).toBe(
                    true
                );
            }
        );

        it(
            "maps fullscreen advertisement result",
            async () => {
                const {
                    sdk
                } =
                    createMockSdk();

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

                await expect(
                    platform.showInterstitial()
                ).resolves.toEqual({
                    shown:
                        true,

                    reason:
                        "completed"
                });
            }
        );

        it(
            "maps rewarded advertisement result",
            async () => {
                const {
                    sdk
                } =
                    createMockSdk();

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

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
            "maps advertisement errors without throwing",
            async () => {
                const {
                    sdk
                } =
                    createMockSdk();

                sdk.adv
                    .showFullscreenAdv =
                    (
                        options
                    ) => {
                        options
                            .callbacks
                            ?.onError?.(
                                new Error(
                                    "ad failed"
                                )
                            );
                    };

                const platform =
                    new YandexPlatform({
                        sdkLoader:
                            async () =>
                                sdk
                    });

                await platform.init();

                await expect(
                    platform.showInterstitial()
                ).resolves.toEqual({
                    shown:
                        false,

                    reason:
                        "error"
                });
            }
        );
    }
);