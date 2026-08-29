export type AdCompletionReason =
    | "completed"
    | "unavailable"
    | "error";

export interface AdResult {
    shown:
        boolean;

    reason:
        AdCompletionReason;
}

export interface RewardedResult
    extends AdResult
{
    rewarded:
        boolean;
}

export interface PlayerInfo {
    id?:
        string;

    name?:
        string;

    avatarUrl?:
        string;
}

export interface PlatformService {
    readonly id:
        string;

    init():
        Promise<void>;

    gameReady():
        Promise<void>;

    showInterstitial():
        Promise<AdResult>;

    showRewarded():
        Promise<RewardedResult>;

    save(
        data:
            unknown
    ):
        Promise<void>;

    load<T>():
        Promise<T | null>;

    getLanguage():
        string;

    getPlayer():
        Promise<PlayerInfo | null>;
}