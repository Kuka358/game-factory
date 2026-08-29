import type {
    AdResult,
    PlatformService,
    PlayerInfo,
    RewardedResult
} from "@game-factory/platform-core";

const DEFAULT_SAVE_KEY =
    "game_factory_save_v1";

export interface YandexPlayerLike {
    setData(
        data:
            Record<string, unknown>,

        flush?:
            boolean
    ):
        Promise<void>;

    getData(
        keys?:
            string[]
    ):
        Promise<
            Record<string, unknown>
        >;

    getUniqueID():
        string;

    getName():
        string;

    getPhoto(
        size:
            "small" |
            "medium" |
            "large"
    ):
        string;
}

export interface YandexSdkLike {
    environment: {
        i18n: {
            lang:
                string;
        };
    };

    features: {
        LoadingAPI?: {
            ready():
                void |
                Promise<void>;
        };
    };

    adv: {
        showFullscreenAdv(
            options: {
                callbacks?: {
                    onOpen?:
                        () => void;

                    onClose?:
                        (
                            wasShown:
                                boolean
                        ) => void;

                    onError?:
                        (
                            error:
                                unknown
                        ) => void;
                };
            }
        ):
            void;

        showRewardedVideo(
            options: {
                callbacks?: {
                    onOpen?:
                        () => void;

                    onRewarded?:
                        () => void;

                    onClose?:
                        (
                            wasShown:
                                boolean
                        ) => void;

                    onError?:
                        (
                            error:
                                unknown
                        ) => void;
                };
            }
        ):
            void;
    };

    getPlayer():
        Promise<
            YandexPlayerLike
        >;
}

export type YandexSdkLoader =
    () =>
        Promise<
            YandexSdkLike
        >;

export interface YandexPlatformOptions {
    sdkLoader?:
        YandexSdkLoader;

    saveKey?:
        string;

    flushSaves?:
        boolean;
}

export class YandexPlatform
    implements PlatformService
{
    readonly id =
        "yandex";

    private readonly sdkLoader:
        YandexSdkLoader;

    private readonly saveKey:
        string;

    private readonly flushSaves:
        boolean;

    private sdk:
        YandexSdkLike |
        null =
        null;

    private player:
        YandexPlayerLike |
        null =
        null;

    private readySent =
        false;

    constructor(
        options:
            YandexPlatformOptions = {}
    ) {
        this.sdkLoader =
            options.sdkLoader ??
            loadGlobalYandexSdk;

        this.saveKey =
            options.saveKey ??
            DEFAULT_SAVE_KEY;

        this.flushSaves =
            options.flushSaves ??
            true;

        if (
            !this.saveKey.trim()
        ) {
            throw new Error(
                "YandexPlatform saveKey cannot be empty"
            );
        }
    }

    async init():
        Promise<void>
    {
        if (this.sdk) {
            return;
        }

        const sdk =
            await this.sdkLoader();

        this.sdk =
            sdk;

        /*
         * Player initialization must not
         * prevent the game itself from
         * starting.
         *
         * save/load/getPlayer will simply
         * be unavailable if this failed.
         */
        try {
            this.player =
                await sdk.getPlayer();
        } catch {
            this.player =
                null;
        }
    }

    async gameReady():
        Promise<void>
    {
        const sdk =
            this.requireSdk();

        if (this.readySent) {
            return;
        }

        await sdk
            .features
            .LoadingAPI
            ?.ready();

        this.readySent =
            true;
    }

    async showInterstitial():
        Promise<AdResult>
    {
        const sdk =
            this.requireSdk();

        return new Promise<
            AdResult
        >(
            (
                resolve
            ) => {
                let settled =
                    false;

                let opened =
                    false;

                const finish =
                    (
                        result:
                            AdResult
                    ) => {
                        if (settled) {
                            return;
                        }

                        settled =
                            true;

                        resolve(
                            result
                        );
                    };

                try {
                    sdk.adv
                        .showFullscreenAdv({
                            callbacks: {
                                onOpen:
                                    () => {
                                        opened =
                                            true;
                                    },

                                onClose:
                                    (
                                        wasShown
                                    ) => {
                                        const shown =
                                            wasShown ||
                                            opened;

                                        finish({
                                            shown,

                                            reason:
                                                shown
                                                    ? "completed"
                                                    : "unavailable"
                                        });
                                    },

                                onError:
                                    () => {
                                        finish({
                                            shown:
                                                opened,

                                            reason:
                                                "error"
                                        });
                                    }
                            }
                        });
                } catch {
                    finish({
                        shown:
                            false,

                        reason:
                            "error"
                    });
                }
            }
        );
    }

    async showRewarded():
        Promise<RewardedResult>
    {
        const sdk =
            this.requireSdk();

        return new Promise<
            RewardedResult
        >(
            (
                resolve
            ) => {
                let settled =
                    false;

                let opened =
                    false;

                let rewarded =
                    false;

                const finish =
                    (
                        result:
                            RewardedResult
                    ) => {
                        if (settled) {
                            return;
                        }

                        settled =
                            true;

                        resolve(
                            result
                        );
                    };

                try {
                    sdk.adv
                        .showRewardedVideo({
                            callbacks: {
                                onOpen:
                                    () => {
                                        opened =
                                            true;
                                    },

                                onRewarded:
                                    () => {
                                        rewarded =
                                            true;
                                    },

                                onClose:
                                    (
                                        wasShown
                                    ) => {
                                        const shown =
                                            wasShown ||
                                            opened ||
                                            rewarded;

                                        finish({
                                            shown,

                                            rewarded,

                                            reason:
                                                shown
                                                    ? "completed"
                                                    : "unavailable"
                                        });
                                    },

                                onError:
                                    () => {
                                        finish({
                                            shown:
                                                opened,

                                            rewarded:
                                                false,

                                            reason:
                                                "error"
                                        });
                                    }
                            }
                        });
                } catch {
                    finish({
                        shown:
                            false,

                        rewarded:
                            false,

                        reason:
                            "error"
                    });
                }
            }
        );
    }

    async save(
        data:
            unknown
    ):
        Promise<void>
    {
        const player =
            this.requirePlayer();

        await player.setData(
            {
                [this.saveKey]:
                    data
            },

            this.flushSaves
        );
    }

    async load<T>():
        Promise<T | null>
    {
        const player =
            this.requirePlayer();

        const data =
            await player.getData([
                this.saveKey
            ]);

        if (
            !Object.prototype
                .hasOwnProperty
                .call(
                    data,
                    this.saveKey
                )
        ) {
            return null;
        }

        return data[
            this.saveKey
        ] as T;
    }

    getLanguage():
        string
    {
        const sdk =
            this.requireSdk();

        const language =
            sdk.environment
                .i18n
                .lang
                .trim();

        return language ||
            "en";
    }

    async getPlayer():
        Promise<PlayerInfo | null>
    {
        if (!this.player) {
            return null;
        }

        const id =
            normalizeOptionalString(
                this.player
                    .getUniqueID()
            );

        const name =
            normalizeOptionalString(
                this.player
                    .getName()
            );

        const avatarUrl =
            normalizeOptionalString(
                this.player
                    .getPhoto(
                        "medium"
                    )
            );

        return {
            id,
            name,
            avatarUrl
        };
    }

    private requireSdk():
        YandexSdkLike
    {
        if (!this.sdk) {
            throw new Error(
                "YandexPlatform.init() must be called first"
            );
        }

        return this.sdk;
    }

    private requirePlayer():
        YandexPlayerLike
    {
        this.requireSdk();

        if (!this.player) {
            throw new Error(
                "Yandex player is unavailable"
            );
        }

        return this.player;
    }
}

async function loadGlobalYandexSdk():
    Promise<YandexSdkLike>
{
    const globalValue =
        globalThis as {
            YaGames?: {
                init():
                    Promise<
                        YandexSdkLike
                    >;
            };
        };

    const yaGames =
        globalValue.YaGames;

    if (!yaGames) {
        throw new Error(
            [
                "Yandex Games SDK is not loaded.",
                "Load /sdk.js before YandexPlatform.init()."
            ].join(
                " "
            )
        );
    }

    return yaGames.init();
}

function normalizeOptionalString(
    value:
        string
): string | undefined {
    const normalized =
        value.trim();

    return normalized ||
        undefined;
}