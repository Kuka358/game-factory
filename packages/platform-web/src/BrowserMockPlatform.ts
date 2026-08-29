import type {
    AdResult,
    PlatformService,
    PlayerInfo,
    RewardedResult
} from "@game-factory/platform-core";

export interface BrowserMockPlatformOptions {
    language?:
        string;

    player?:
        PlayerInfo | null;

    initialSaveData?:
        unknown;
}

export class BrowserMockPlatform
    implements PlatformService
{
    readonly id =
        "browser";

    private initialized =
        false;

    private ready =
        false;

    private savedData:
        unknown;

    private readonly language:
        string;

    private readonly player:
        PlayerInfo | null;

    constructor(
        options:
            BrowserMockPlatformOptions = {}
    ) {
        this.language =
            normalizeLanguage(
                options.language
            );

        this.player =
            options.player
                ? cloneValue(
                    options.player
                )
                : null;

        this.savedData =
            options.initialSaveData ===
                undefined
                ? null
                : cloneValue(
                    options.initialSaveData
                );
    }

    async init():
        Promise<void>
    {
        this.initialized =
            true;
    }

    async gameReady():
        Promise<void>
    {
        this.requireInitialized();

        this.ready =
            true;
    }

    async showInterstitial():
        Promise<AdResult>
    {
        this.requireInitialized();

        return {
            shown:
                true,

            reason:
                "completed"
        };
    }

    async showRewarded():
        Promise<RewardedResult>
    {
        this.requireInitialized();

        return {
            shown:
                true,

            rewarded:
                true,

            reason:
                "completed"
        };
    }

    async save(
        data:
            unknown
    ):
        Promise<void>
    {
        this.requireInitialized();

        this.savedData =
            cloneValue(
                data
            );
    }

    async load<T>():
        Promise<T | null>
    {
        this.requireInitialized();

        if (
            this.savedData ===
            null ||
            this.savedData ===
            undefined
        ) {
            return null;
        }

        return cloneValue(
            this.savedData
        ) as T;
    }

    getLanguage():
        string
    {
        return this.language;
    }

    async getPlayer():
        Promise<PlayerInfo | null>
    {
        if (!this.player) {
            return null;
        }

        return cloneValue(
            this.player
        );
    }

    get isInitialized():
        boolean
    {
        return this.initialized;
    }

    get isGameReady():
        boolean
    {
        return this.ready;
    }

    private requireInitialized():
        void
    {
        if (
            !this.initialized
        ) {
            throw new Error(
                "BrowserMockPlatform.init() must be called first"
            );
        }
    }
}

function normalizeLanguage(
    value:
        string | undefined
): string {
    const normalized =
        value?.trim();

    if (normalized) {
        return normalized;
    }

    if (
        typeof navigator !==
            "undefined" &&
        navigator.language
    ) {
        return navigator.language;
    }

    return "en";
}

function cloneValue<T>(
    value:
        T
): T {
    return structuredClone(
        value
    );
}