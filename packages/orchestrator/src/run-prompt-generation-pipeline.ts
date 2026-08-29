import {
    writeFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import {
    loadGameFactoryConfig
} from "@game-factory/config";

import {
    generateSpecFromPrompt
} from "./ai/generate-spec-from-prompt.js";

import {
    resolveAIProvider
} from "./ai/resolve-ai-provider.js";

import {
    runGenerationPipeline
} from "./run-generation-pipeline.js";

import type {
    PipelineProgressListener
} from "./PipelineProgress.js";

import {
    exportYandexBuild
} from "@game-factory/platform-yandex/exporter";

export type PromptGenerationTarget =
    | "web"
    | "yandex";

export type PromptGenerationOrientation =
    | "auto"
    | "portrait"
    | "landscape";

export interface RunPromptGenerationPipelineOptions {
    orientation?:
        PromptGenerationOrientation;

    target?:
        PromptGenerationTarget;

    onProgress?:
        PipelineProgressListener;
}

export async function runPromptGenerationPipeline(
    prompt:
        string,

    outputRoot:
        string,

    options:
        RunPromptGenerationPipelineOptions = {}
) {
    const config =
        loadGameFactoryConfig();

    const {
        provider,
        model
    } =
        resolveAIProvider(
            config
        );

    options.onProgress?.({
        stage:
            "game_design",

        message:
            "Generating and reviewing GameSpec"
    });

    console.log(
        "[AI 1/3] Generating GameSpec..."
    );

    const generated =
        await generateSpecFromPrompt({
            prompt,
            provider,
            model,

            ...(
                options.orientation &&
                options.orientation !==
                    "auto"
                    ? {
                        orientation:
                            options.orientation
                    }
                    : {}
            )
        });
    
    options.onProgress?.({
        stage:
            "spec_generated",

        message:
            generated.spec.metadata.title
    });

    console.log(
        `[AI 2/3] GameSpec: ${generated.spec.metadata.title}`
    );

    console.log(
        "[AI 3/3] Review: PASS"
    );

    for (
        const warning of
        generated.review.warnings
    ) {
        console.warn(
            `AI Review warning: ${warning}`
        );
    }

    const result =
        await runGenerationPipeline(
            generated.spec,
            outputRoot,

            {
                onProgress:
                    options.onProgress
            }
        );

    const target =
        options.target ??
        "web";

    if (
        target ===
        "yandex"
    ) {
        options.onProgress?.({
            stage:
                "platform_export",

            message:
                "Creating Yandex Games build"
        });

        await exportYandexBuild({
            sourceBuildDir:
                result.generation
                    .workspace
                    .buildDir,

            outputDir:
                join(
                    result.generation
                        .workspace
                        .root,

                    "yandex"
                )
        });
    }

    await writeFile(
        join(
            result.generation.workspace.root,
            "ai-metadata.json"
        ),

        JSON.stringify(
            {
                inputPrompt:
                    prompt,

                generationOptions: {
                    orientation:
                        options.orientation ??
                        "auto",
                    
                        target
                },

                designer:
                    generated.ai.designer,

                reviewer:
                    generated.ai.reviewer
            },
            null,
            2
        ),

        "utf8"
    );

    await writeFile(
        join(
            result.generation.workspace.root,
            "game-review.json"
        ),

        JSON.stringify(
            generated.review,
            null,
            2
        ),

        "utf8"
    );

    options.onProgress?.({
        stage:
            "completed",

        message:
            "Game generation completed"
    });

    return result;
}