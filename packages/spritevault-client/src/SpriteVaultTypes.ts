export interface SpriteVaultLicenseDto {
    type: string;

    author?: string;

    source_url?: string;
}

export interface SpriteVaultFilesDto {
    source: string;
}

export interface SpriteVaultAssetDto {
    id: string;

    score: number;

    tags: string[];

    license:
        SpriteVaultLicenseDto;

    files:
        SpriteVaultFilesDto;
}

export interface SpriteVaultSearchResponseDto {
    assets:
        SpriteVaultAssetDto[];
}

export interface SpriteVaultDimensionsDto {
    width: number;
    height: number;
}

export interface SpriteVaultAnimationDto {
    name: string;
}

export interface SpriteVaultAssetDto {
    id: string;

    score: number;

    tags: string[];

    dimensions?:
        SpriteVaultDimensionsDto;

    animations?:
        SpriteVaultAnimationDto[];

    orientation?:
        | "square"
        | "landscape"
        | "portrait";

    license:
        SpriteVaultLicenseDto;

    files:
        SpriteVaultFilesDto;
}