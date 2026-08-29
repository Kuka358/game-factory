import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    GameAssetProfile,
    GameAssetUiKind
} from "@game-factory/game-spec";


export interface TemplateAdditionalAssetCapability {
    /*
     * Exact runtime role expected by the template.
     */
    role:
        string;

    /*
     * Asset Generation v2 profile.
     */
    profile:
        GameAssetProfile;

    /*
     * Human/AI-readable explanation of how the template
     * uses this asset.
     */
    description:
        string;

    /*
     * If true, every GameSpec using this template must
     * request this additional asset.
     */
    required?:
        boolean;

    /*
     * Only meaningful for profile="ui".
     */
    uiKinds?:
        readonly GameAssetUiKind[];
}

export type TemplateId =
    | "endless_runner";

export interface TemplateManifest {
    id:
        TemplateId;

    version:
        string;

    genre:
        string;

    supportedModes:
        readonly string[];

    assetRoles:
        readonly string[];

    additionalAssetCapabilities?:
        readonly TemplateAdditionalAssetCapability[];
}

export interface TemplateSupportResult {
    supported: boolean;
    reasons: string[];
}

export interface GameTemplate {
    manifest: TemplateManifest;

    supports(
        spec: GameSpec
    ): TemplateSupportResult;
}