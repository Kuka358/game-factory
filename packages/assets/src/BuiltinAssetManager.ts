import fs from "node:fs/promises";
import path from "node:path";

import type {
    AssetManager,
    AssetResolutionResult,
    ResolveAssetsInput
} from "./AssetManager.js";

export class BuiltinAssetManager
    implements AssetManager
{
    async resolve(
        input: ResolveAssetsInput
    ): Promise<AssetResolutionResult> {
        await fs.mkdir(
            input.assetsDir,
            {
                recursive: true
            }
        );

        const assets = [];

        for (
            const requirement of
            input.requirements
        ) {
            const fileName =
                `${sanitizeRole(
                    requirement.role
                )}.svg`;

            await fs.writeFile(
                path.join(
                    input.assetsDir,
                    fileName
                ),
                createPlaceholderSvg(
                    requirement.role
                ),
                "utf8"
            );

            assets.push({
                role:
                    requirement.role,

                gamePath:
                    path.posix.join(
                        "assets",
                        fileName
                    ),

                source:
                    "builtin" as const,

                license: {
                    type:
                        "internal"
                }
            });
        }

        return {
            manifest: {
                assets
            }
        };
    }
}

function sanitizeRole(
    role: string
): string {
    return role
        .trim()
        .toLowerCase()
        .replace(
            /[^a-z0-9_-]+/g,
            "-"
        );
}

function createPlaceholderSvg(
    role: string
): string {
    switch (role) {
        case "player":
            return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="64"
     height="64"
     viewBox="0 0 64 64">
    <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="8"
        fill="#4cc9f0"
    />
</svg>
`.trim();

        case "obstacle":
            return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="64"
     height="64"
     viewBox="0 0 64 64">
    <polygon
        points="32,4 60,60 4,60"
        fill="#f72585"
    />
</svg>
`.trim();

        case "background":
            return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="1280"
     height="720"
     viewBox="0 0 1280 720">
    <rect
        width="1280"
        height="720"
        fill="#202838"
    />
</svg>
`.trim();

        default:
            return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="64"
     height="64"
     viewBox="0 0 64 64">
    <rect
        width="64"
        height="64"
        fill="#888888"
    />
</svg>
`.trim();
    }
}