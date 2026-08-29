import type {
    AssetGenerationRequirements
} from "./AssetGenerationProfile.js";

export type AssetType =
    | "sprite"
    | "image";

export type AssetOrientation =
    | "square"
    | "landscape"
    | "portrait";

export interface AssetDimensionsRequirement {
    preferredWidth?: number;
    preferredHeight?: number;

    minWidth?: number;
    minHeight?: number;

    maxWidth?: number;
    maxHeight?: number;
}

export interface AssetRequirements {
    transparent?:
        boolean;

    dimensions?:
        AssetDimensionsRequirement;

    animations?:
        string[];

    orientation?:
        AssetOrientation;

    generation?:
        AssetGenerationRequirements;
}

export interface AssetRequirement {
    type:
        AssetType;

    role:
        string;

    tags:
        string[];

    requirements:
        AssetRequirements;
}