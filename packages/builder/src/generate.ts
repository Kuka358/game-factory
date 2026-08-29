import fs from "node:fs/promises";

import type {
    EngineBackend,
    EngineBuildContext
} from "@game-factory/engine-core";

import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    TemplateManifest
} from "@game-factory/templates";

import {
    createWorkspace
} from "./workspace/create-workspace.js";

import type {
    Workspace
} from "./workspace/Workspace.js";

import type {
    AssetManager,
    AssetRequirement
} from "@game-factory/assets";

export interface GenerateInput {
    spec: GameSpec;

    template:
        TemplateManifest;

    backend:
        EngineBackend;

    assetManager:
        AssetManager;

    assetRequirements:
        readonly AssetRequirement[];

    outputRoot:
        string;
}

export interface GenerateResult {
    spec: GameSpec;

    template:
        TemplateManifest;

    workspace:
        Workspace;
}

export async function generate(
    input: GenerateInput
): Promise<GenerateResult> {
    const {
        spec,
        template,
        backend,
        assetManager,
        assetRequirements,
        outputRoot
    } = input;

    const id =
        createGameId(
            spec.metadata.title
        );

    if (!id) {
        throw new Error(
            "Unable to create game id from title"
        );
    }

    const workspace =
        await createWorkspace(
            outputRoot,
            id
        );

    await fs.writeFile(
        workspace.specFile,
        JSON.stringify(
            spec,
            null,
            2
        ),
        "utf8"
    );

    await fs.writeFile(
        workspace.templateFile,
        JSON.stringify(
            template,
            null,
            2
        ),
        "utf8"
    );

    await fs.writeFile(
        workspace.engineFile,
        JSON.stringify(
            backend.manifest,
            null,
            2
        ),
        "utf8"
    );

    const assetResolution =
        await assetManager.resolve({
            requirements:
                assetRequirements,

            assetsDir:
                workspace.assetsDir
        });

    await fs.writeFile(
        workspace.assetManifestFile,

        JSON.stringify(
            assetResolution.manifest,
            null,
            2
        ),

        "utf8"
    );

    const engineContext:
        EngineBuildContext = {

        spec,
        template,

        assetManifest:
            assetResolution.manifest,

        assetsDir:
            workspace.assetsDir,

        projectDir:
            workspace.projectDir,

        buildDir:
            workspace.buildDir
    };

    await backend.generateProject(
        engineContext
    );

    await backend.buildProject(
        engineContext
    );

    return {
        spec,
        template,
        workspace
    };
}

function createGameId(
    title: string
): string {
    return title
        .trim()
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        );
}