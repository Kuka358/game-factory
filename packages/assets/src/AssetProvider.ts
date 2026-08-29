import type {
    AssetLicense,
    AssetSource
} from "./AssetManifest.js";

import type {
    AssetRequirement
} from "./AssetRequirement.js";
import type {
    AssetOrientation
} from "./AssetRequirement.js";

export interface AssetCandidate {
    id: string;
    score: number;
    tags: string[];

    license:
        AssetLicense;

    sourceUrl?: string;
}

export interface AssetProvider {
    readonly source:
        AssetSource;

    search(
        requirement:
            AssetRequirement
    ): Promise<AssetCandidate[]>;

    download(
        candidate:
            AssetCandidate
    ): Promise<Uint8Array>;
}

export interface AssetCandidateDimensions {
    width: number;
    height: number;
}

export interface AssetCandidateAnimation {
    name: string;
}

export interface AssetCandidate {
    id: string;

    score: number;

    tags: string[];

    dimensions?:
        AssetCandidateDimensions;

    animations?:
        AssetCandidateAnimation[];

    orientation?:
        AssetOrientation;

    license:
        AssetLicense;

    sourceUrl?:
        string;
}