export type AssetGenerationProfile =
    | "character"
    | "npc"
    | "item"
    | "obstacle"
    | "background"
    | "ui"
    | "tileset";

export type AssetUiKind =
    | "button"
    | "panel"
    | "icon"
    | "frame"
    | "bar";

export interface AssetTilesetLayoutRequirements {
    tileWidth:
        number;

    tileHeight:
        number;

    columns:
        number;

    rows:
        number;
}

export interface AssetGenerationRequirements {
    profile?:
        AssetGenerationProfile;

    /**
     * true only when a grid/sheet is actually expected.
     */
    allowSpritesheet?:
        boolean;

    /**
     * Character/item/object assets normally require one
     * visually dominant isolated subject.
     */
    singleSubject?:
        boolean;

    /**
     * Mainly for tiles and seamless backgrounds.
     */
    tileable?:
        boolean;
    
    tileset?:
        AssetTilesetLayoutRequirements;

    uiKind?:
        AssetUiKind;
}