import fs from "node:fs/promises";
import path from "node:path";

import type {
    AssetManager,
    AssetResolutionResult,
    ResolveAssetsInput
} from "./AssetManager.js";

import type {
    AssetCandidate,
    AssetProvider
} from "./AssetProvider.js";

import type {
    AssetManifestEntry
} from "./AssetManifest.js";

import type {
    AssetRequirement
} from "./AssetRequirement.js";

import {
    scoreCandidate
} from "./score-candidate.js";

export interface ProviderAssetManagerOptions {
    provider:
        AssetProvider;

    minimumScore?:
        number;
}

export class ProviderAssetManager
    implements AssetManager
{
    private readonly provider:
        AssetProvider;

    private readonly minimumScore:
        number;

    constructor(
        options:
            ProviderAssetManagerOptions
    ) {
        this.provider =
            options.provider;

        this.minimumScore =
            options.minimumScore ??
            0.5;
    }

    async resolve(
        input:
            ResolveAssetsInput
    ): Promise<AssetResolutionResult> {
        await fs.mkdir(
            input.assetsDir,
            {
                recursive: true
            }
        );

        const assets:
            AssetManifestEntry[] = [];

        for (
            const requirement of
            input.requirements
        ) {
            const entry =
                await this.resolveRequirement(
                    requirement,
                    input.assetsDir
                );

            assets.push(
                entry
            );
        }

        return {
            manifest: {
                assets
            }
        };
    }

    private async resolveRequirement(
        requirement:
            AssetRequirement,

        assetsDir:
            string
    ): Promise<AssetManifestEntry> {
        const candidates =
            await this.provider.search(
                requirement
            );

        const selected =
            selectCandidate(
                requirement,
                candidates,
                this.minimumScore
            );

        if (!selected) {
            throw new Error(
                `No suitable asset found for role "${requirement.role}"`
            );
        }

        const data =
            await this.provider.download(
                selected
            );

        const extension =
            getAssetExtension(
                selected
            );

        const fileName =
            `${sanitizeRole(
                requirement.role
            )}${extension}`;

        const filePath =
            path.join(
                assetsDir,
                fileName
            );

        await fs.writeFile(
            filePath,
            data
        );

        return {
            role:
                requirement.role,

            gamePath:
                path.posix.join(
                    "assets",
                    fileName
                ),

            source:
                this.provider.source,

            sourceAssetId:
                selected.id,

            license:
                selected.license
        };
    }
}

function getAssetExtension(
    candidate:
        AssetCandidate
): string {
    if (!candidate.sourceUrl) {
        throw new Error(
            `Asset ${candidate.id} has no source URL`
        );
    }

    const url =
        new URL(
            candidate.sourceUrl,
            "http://asset.local"
        );

    const extension =
        path.posix
            .extname(
                url.pathname
            )
            .toLowerCase();

    const supported =
        new Set([
            ".png",
            ".jpg",
            ".jpeg",
            ".webp"
        ]);

    if (
        !supported.has(
            extension
        )
    ) {
        throw new Error(
            `Unsupported asset extension "${extension}" for asset ${candidate.id}`
        );
    }

    return extension;
}

function sanitizeRole(
    role: string
): string {
    const result =
        role
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9_-]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );

    if (!result) {
        throw new Error(
            `Invalid asset role: "${role}"`
        );
    }

    return result;
}

function selectCandidate(
    requirement:
        AssetRequirement,

    candidates:
        readonly AssetCandidate[],

    minimumScore:
        number
): AssetCandidate | undefined {
    return [...candidates]
        .filter(
            (candidate) =>
                candidate.score >=
                minimumScore
        )
        .sort(
            (a, b) => {
                const aScore =
                    scoreCandidate(
                        requirement,
                        a
                    );

                const bScore =
                    scoreCandidate(
                        requirement,
                        b
                    );

                const difference =
                    bScore -
                    aScore;

                if (
                    difference !== 0
                ) {
                    return difference;
                }

                return a.id.localeCompare(
                    b.id
                );
            }
        )[0];
}