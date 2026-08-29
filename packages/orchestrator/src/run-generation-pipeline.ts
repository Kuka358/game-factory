import fs from "node:fs/promises";

import {
    generate,
    type GenerateResult
} from "@game-factory/builder";

import {
    runQa,
    type QaReport
} from "@game-factory/qa";

import {
    resolveTemplate
} from "@game-factory/templates";

import {
    loadGameSpec
} from "./load-game-spec.js";

import {
    resolveEngine
} from "./engines/resolve-engine.js";

import {
    loadGameFactoryConfig
} from "@game-factory/config";

import {
    describeAssetResolution,
    resolveAssetManager
} from "./assets/resolve-asset-manager.js";

import type {
    GameSpec
} from "@game-factory/game-spec";

import type {
    PipelineProgressListener
} from "./PipelineProgress.js";

export interface GenerationPipelineResult {
    generation: GenerateResult;

    qa: QaReport;

    success: boolean;
}

import {
    BuiltinAssetManager,
    createAssetRequirements
} from "@game-factory/assets";

export interface RunGenerationPipelineOptions {
    onProgress?:
        PipelineProgressListener;
}


export async function runGenerationPipeline(
    input:
        string | GameSpec,

    outputRoot:
        string,

    options:
        RunGenerationPipelineOptions = {}
): Promise<GenerationPipelineResult> {

    const emit =
        options.onProgress ??
        (() => {});

    const config =
        loadGameFactoryConfig();

    console.log(
        "[1/6] Loading GameSpec..."
    );

    const spec =
        typeof input ===
            "string"
            ? await loadGameSpec(
                input
            )
            : input;

    console.log(
        "[2/6] Selecting template..."
    );

    const template =
        resolveTemplate(spec);

    console.log(
        `Template: ${template.manifest.id}@${template.manifest.version}`
    );

    emit({
        stage:
            "template_selected",

        message:
            `Template: ${template.manifest.id}@${template.manifest.version}`
    });

    emit({
        stage:
            "assets_resolving",

        message:
            "Resolving game assets"
    });

    console.log(
        "[3/6] Resolving assets..."
    );

    const assetRequirements =
        createAssetRequirements(
            spec
        );

    const assetManager =
        resolveAssetManager(
            config,
            spec
        );

    console.log(
        `Assets: ${describeAssetResolution(
            config
        )}`
    );

    console.log(
        "[4/6] Selecting engine..."
    );

    const backend =
        resolveEngine(
            spec.generation.engine
        );

    console.log(
        `Engine: ${backend.manifest.id}@${backend.manifest.version}`
    );

    emit({
        stage:
            "project_generating",

        message:
            "Generating and building game project"
    });

    console.log(
        "[5/6] Generating game..."
    );

    const generation =
        await generate({
            spec,

            template:
                template.manifest,

            backend,

            assetManager,
            assetRequirements,

            outputRoot
        });

    emit({
        stage:
            "testing",

        message:
            "Running automated QA"
    });

    console.log(
        "[6/6] Running QA..."
    );


    const qaResult =
        await runQa({
            buildDir:
                generation.workspace
                    .buildDir
        });

    const qa =
        await readQaReport(
            qaResult.reportPath
        );

    return {
        generation,
        qa,

        success:
            qaResult.exitCode === 0 &&
            qa.result === "passed"
    };
}

async function readQaReport(
    reportPath: string
): Promise<QaReport> {
    const content =
        await fs.readFile(
            reportPath,
            "utf8"
        );

    return JSON.parse(
        content
    ) as QaReport;
}