import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    TemplateManifest
} from "@game-factory/templates";

import type {
    AssetManifest
} from "@game-factory/assets";

export type EngineId =
    GameSpec["generation"]["engine"];

export interface EngineManifest {
    id: EngineId;
    version: string;
}

export interface EngineBuildContext {
    spec: GameSpec;

    template:
        TemplateManifest;

    assetManifest:
        AssetManifest;

    assetsDir:
        string;

    projectDir:
        string;

    buildDir:
        string;
}

export interface EngineBackend {
    manifest:
        EngineManifest;

    generateProject(
        context:
            EngineBuildContext
    ): Promise<void>;

    buildProject(
        context:
            EngineBuildContext
    ): Promise<void>;
}