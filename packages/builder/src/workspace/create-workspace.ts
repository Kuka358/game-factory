import path from "node:path";
import fs from "node:fs/promises";

import type { Workspace } from "./Workspace.js";

export async function createWorkspace(
    outputRoot: string,
    id: string
): Promise<Workspace> {
    const root = path.join(
        outputRoot,
        id
    );

    const workspace: Workspace = {
        root,

        specFile: path.join(
            root,
            "game-spec.json"
        ),

        projectDir: path.join(
            root,
            "project"
        ),

        buildDir: path.join(
            root,
            "build"
        ),

        qaDir: path.join(
            root,
            "qa"
        ),

        artifactsDir: path.join(
            root,
            "artifacts"
        ),

        templateFile: path.join(
            root,
            "template-manifest.json"
        ),

        engineFile:
            path.join(
                root,
                "engine-manifest.json"
            ),

        assetsDir:
            path.join(
                root,
                "assets"
            ),

        assetManifestFile:
            path.join(
                root,
                "asset-manifest.json"
            ),
    };

    await fs.mkdir(
        workspace.projectDir,
        { recursive: true }
    );

    await fs.mkdir(
        workspace.buildDir,
        { recursive: true }
    );

    await fs.mkdir(
        workspace.qaDir,
        { recursive: true }
    );

    await fs.mkdir(
        workspace.artifactsDir,
        { recursive: true }
    );

    await fs.mkdir(
        workspace.assetsDir,
        {
            recursive: true
        }
    )

    return workspace;
}