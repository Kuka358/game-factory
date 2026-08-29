import type {
    AssetManifest
} from "./AssetManifest.js";

import type {
    AssetRequirement
} from "./AssetRequirement.js";

export interface ResolveAssetsInput {
    requirements:
        readonly AssetRequirement[];

    assetsDir:
        string;
}

export interface AssetResolutionResult {
    manifest:
        AssetManifest;
}

export interface AssetManager {
    resolve(
        input:
            ResolveAssetsInput
    ): Promise<AssetResolutionResult>;
}