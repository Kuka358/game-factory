export type AssetSource =
    | "spritevault"
    | "generated"
    | "builtin";

export interface AssetLicense {
    type: string;

    author?: string;

    sourceUrl?: string;
}

export interface AssetSpriteSheet {
    frameWidth:
        number;

    frameHeight:
        number;

    columns:
        number;

    rows:
        number;
}

export interface AssetManifestEntry {
    role: string;

    gamePath: string;

    source: AssetSource;

    sourceAssetId?: string;

    spritesheet?:
        AssetSpriteSheet;

    license:
        AssetLicense;
}

export interface AssetManifest {
    assets:
        AssetManifestEntry[];
}