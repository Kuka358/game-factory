export type AssetResolutionStrategy =
    | "spritevault_first"
    | "generated_first"
    | "generated_only"
    | "spritevault_only";

export type AssetSourceKind =
    | "spritevault"
    | "generated";

export const DEFAULT_ASSET_RESOLUTION_STRATEGY:
    AssetResolutionStrategy =
    "spritevault_first";

export function getAssetResolutionOrder(
    strategy:
        AssetResolutionStrategy
): readonly AssetSourceKind[] {
    switch (strategy) {
        case "spritevault_first":
            return [
                "spritevault",
                "generated"
            ];

        case "generated_first":
            return [
                "generated",
                "spritevault"
            ];

        case "generated_only":
            return [
                "generated"
            ];

        case "spritevault_only":
            return [
                "spritevault"
            ];
    }
}