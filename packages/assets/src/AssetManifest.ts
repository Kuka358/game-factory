export type AssetSource =
    | "spritevault"
    | "generated"
    | "builtin";

export interface AssetLicense {
    type: string;

    author?: string;

    sourceUrl?: string;
}

export interface AssetManifestEntry {
    role: string;

    gamePath: string;

    source: AssetSource;

    sourceAssetId?: string;

    license:
        AssetLicense;
}

export interface AssetManifest {
    assets:
        AssetManifestEntry[];
}