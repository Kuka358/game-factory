import type {
    AssetCandidate,
    AssetProvider,
    AssetRequirement
} from "@game-factory/assets";

import type {
    SpriteVaultAssetDto,
    SpriteVaultSearchResponseDto
} from "./SpriteVaultTypes.js";

export interface HttpSpriteVaultClientOptions {
    baseUrl: string;

    searchPath: string;

    apiKey?: string;

    timeoutMs?: number;
}

export class HttpSpriteVaultClient
    implements AssetProvider
{
    readonly source =
        "spritevault" as const;

    private readonly baseUrl:
        string;

    private readonly searchPath:
        string;

    private readonly apiKey?:
        string;

    private readonly timeoutMs:
        number;

    constructor(
        options:
            HttpSpriteVaultClientOptions
    ) {
        this.baseUrl =
            ensureTrailingSlash(
                options.baseUrl
            );

        this.searchPath =
            options.searchPath;

        this.apiKey =
            options.apiKey;

        this.timeoutMs =
            options.timeoutMs ??
            10_000;
    }

    async search(
        requirement:
            AssetRequirement
    ): Promise<AssetCandidate[]> {
        const url =
            this.createUrl(
                this.searchPath
            );

        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () =>
                    controller.abort(),
                this.timeoutMs
            );

        try {
            const response =
                await fetch(
                    url,
                    {
                        method: "POST",

                        headers:
                            this.createHeaders(),

                        body:
                            JSON.stringify(
                                requirement
                            ),

                        signal:
                            controller.signal
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `SpriteVault search failed: HTTP ${response.status}`
                );
            }

            const data: unknown =
                await response.json();

            const result =
                parseSearchResponse(
                    data
                );

            return result.assets.map(
                mapCandidate
            );
        } finally {
            clearTimeout(
                timeout
            );
        }
    }

    async download(
        candidate:
            AssetCandidate
    ): Promise<Uint8Array> {
        if (!candidate.sourceUrl) {
            throw new Error(
                `SpriteVault candidate ${candidate.id} has no source URL`
            );
        }

        const url =
            this.createUrl(
                candidate.sourceUrl
            );

        const response =
            await fetch(
                url,
                {
                    headers:
                        this.createHeaders()
                }
            );

        if (!response.ok) {
            throw new Error(
                `SpriteVault asset download failed: HTTP ${response.status}`
            );
        }

        const buffer =
            await response.arrayBuffer();

        return new Uint8Array(
            buffer
        );
    }

    private createHeaders():
        Record<string, string> {
        const headers:
            Record<string, string> = {
            "content-type":
                "application/json",
            accept:
                "application/json"
        };

        if (this.apiKey) {
            headers.authorization =
                `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    private createUrl(
        pathOrUrl: string
    ): string {
        return new URL(
            pathOrUrl,
            this.baseUrl
        ).toString();
    }
}

function mapCandidate(
    asset:
        SpriteVaultAssetDto
): AssetCandidate {
    return {
        id:
            asset.id,

        score:
            asset.score,

        tags:
            [...asset.tags],

        dimensions:
            asset.dimensions
                ? {
                    width:
                        asset.dimensions.width,

                    height:
                        asset.dimensions.height
                }
                : undefined,

        animations:
            asset.animations?.map(
                (animation) => ({
                    name:
                        animation.name
                })
            ),

        orientation:
            asset.orientation,

        sourceUrl:
            asset.files.source,

        license: {
            type:
                asset.license.type,

            author:
                asset.license.author,

            sourceUrl:
                asset.license.source_url
        }
    };
}

function parseSearchResponse(
    data: unknown
): SpriteVaultSearchResponseDto {
    if (
        !isRecord(data) ||
        !Array.isArray(data.assets)
    ) {
        throw new Error(
            "Invalid SpriteVault search response"
        );
    }

    const assets =
        data.assets.map(
            parseAsset
        );

    return {
        assets
    };
}

function parseAsset(
    value: unknown
): SpriteVaultAssetDto {
    if (!isRecord(value)) {
        throw new Error(
            "Invalid SpriteVault asset"
        );
    }

    const id =
        value.id;

    if (
        typeof id !== "string"
    ) {
        throw new Error(
            "SpriteVault asset.id must be a string"
        );
    }

    const score =
        value.score;

    if (
        typeof score !== "number" ||
        !Number.isFinite(score)
    ) {
        throw new Error(
            "SpriteVault asset.score must be a number"
        );
    }

    const rawTags =
        value.tags;

    if (
        !Array.isArray(rawTags) ||
        !rawTags.every(
            (tag) =>
                typeof tag === "string"
        )
    ) {
        throw new Error(
            "SpriteVault asset.tags must be an array of strings"
        );
    }

    const tags =
        rawTags as string[];

    const license =
        value.license;

    if (!isRecord(license)) {
        throw new Error(
            "SpriteVault asset.license must be an object"
        );
    }

    const licenseType =
        license.type;

    if (
        typeof licenseType !==
        "string"
    ) {
        throw new Error(
            "SpriteVault asset.license.type must be a string"
        );
    }

    const author =
        parseOptionalString(
            license.author,
            "license.author"
        );

    const sourceUrl =
        parseOptionalString(
            license.source_url,
            "license.source_url"
        );

    const files =
        value.files;

    if (!isRecord(files)) {
        throw new Error(
            "SpriteVault asset.files must be an object"
        );
    }

    const fileSource =
        files.source;

    if (
        typeof fileSource !==
        "string"
    ) {
        throw new Error(
            "SpriteVault asset.files.source must be a string"
        );
    }

    const dimensions =
        parseOptionalDimensions(
            value.dimensions
        );

    const animations =
        parseOptionalAnimations(
            value.animations
        );

    const orientation =
        parseOptionalOrientation(
            value.orientation
        );

    return {
        id,
        score,
        tags,

        dimensions,
        animations,
        orientation,

        license: {
            type:
                licenseType,

            author,

            source_url:
                sourceUrl
        },

        files: {
            source:
                fileSource
        }
    };
}


function ensureTrailingSlash(
    value: string
): string {
    return value.endsWith("/")
        ? value
        : `${value}/`;
}

function isRecord(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function parseOptionalString(
    value: unknown,
    fieldName: string
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (
        typeof value !== "string"
    ) {
        throw new Error(
            `${fieldName} must be a string`
        );
    }

    return value;
}

function parseOptionalOrientation(
    value: unknown
):
    | "square"
    | "landscape"
    | "portrait"
    | undefined
{
    if (value === undefined) {
        return undefined;
    }

    if (
        value !== "square" &&
        value !== "landscape" &&
        value !== "portrait"
    ) {
        throw new Error(
            "orientation must be square, landscape or portrait"
        );
    }

    return value;
}

function parseOptionalDimensions(
    value: unknown
):
    | {
          width: number;
          height: number;
      }
    | undefined
{
    if (value === undefined) {
        return undefined;
    }

    if (!isRecord(value)) {
        throw new Error(
            "dimensions must be an object"
        );
    }

    const width =
        value.width;

    const height =
        value.height;

    if (
        typeof width !== "number" ||
        !Number.isFinite(width)
    ) {
        throw new Error(
            "dimensions.width must be a number"
        );
    }

    if (
        typeof height !== "number" ||
        !Number.isFinite(height)
    ) {
        throw new Error(
            "dimensions.height must be a number"
        );
    }

    return {
        width,
        height
    };
}

function parseOptionalAnimations(
    value: unknown
):
    | Array<{
          name: string;
      }>
    | undefined
{
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(
            "animations must be an array"
        );
    }

    return value.map(
        (
            animation,
            index
        ) => {
            if (
                !isRecord(
                    animation
                )
            ) {
                throw new Error(
                    `animations[${index}] must be an object`
                );
            }

            const name =
                animation.name;

            if (
                typeof name !==
                "string"
            ) {
                throw new Error(
                    `animations[${index}].name must be a string`
                );
            }

            return {
                name
            };
        }
    );
}