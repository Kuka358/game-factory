import {
    resolve
} from "node:path";

import {
    runPromptGenerationPipeline
} from "@game-factory/orchestrator";

import {
    GameJobStore
} from "./GameJobStore.js";

import type {
    PipelineProgress
} from "@game-factory/orchestrator";

export type GameJobPipeline = (
    prompt: string,
    outputRoot: string,
    options: Parameters<
        typeof runPromptGenerationPipeline
    >[2]
) => Promise<{
    success: boolean;
    qa: {
        result: string;
    };
    generation: {
        spec: {
            metadata: {
                title: string;
            };
        };
        workspace: {
            root: string;
        };
    };
}>;

export interface GameJobRunnerOptions {
    store:
        GameJobStore;

    outputRoot:
        string;

    pipeline?: GameJobPipeline;
}

export class GameJobRunner {
    constructor(
        private readonly options:
            GameJobRunnerOptions
    ) {}

    enqueue(
        jobId:
            string
    ): void {
        /*
         * HTTP request must not wait
         * for the entire generation.
         */
        void this.run(
            jobId
        );
    }

    private async run(
        jobId:
            string
    ): Promise<void> {
        const job =
            this.options
                .store
                .get(
                    jobId
                );

        if (!job) {
            return;
        }

        try {
            this.options
                .store
                .update(
                    jobId,
                    {
                        status:
                            "game_design",

                        statusMessage:
                            "Starting AI Game Designer",

                        error:
                            undefined
                    }
                );

            const result =
                await (
                    this.options.pipeline ??
                    runPromptGenerationPipeline
                )(
                    job.prompt,

                    resolve(
                        this.options.outputRoot
                    ),

                    {
                        orientation:
                            job.orientation,

                        target:
                            job.target,

                        onProgress:
                            (progress) => {
                                this.handleProgress(
                                    jobId,
                                    progress
                                );
                            }
                    }
                );

            if (!result.success) {
                this.options.store.update(jobId, {
                    status: "failed",
                    statusMessage: "Game QA failed",
                    error: `QA result: ${result.qa.result}`
                });

                return;
            }

            const spec =
                result.generation
                    .spec;

            const workspace =
                result.generation
                    .workspace;

            this.options
                .store
                .update(
                    jobId,
                    {
                        status:
                            "completed",

                        title:
                            spec.metadata
                                .title,

                        /*
                         * For our local MVP the
                         * workspace directory name
                         * acts as game id.
                         */
                        gameId:
                            getDirectoryName(
                                workspace.root
                            ),

                        workspacePath:
                            workspace.root,

                        statusMessage: "Game generation completed"
                    }
                );
        } catch (
            error
        ) {
            this.options
                .store
                .update(
                    jobId,
                    {
                        status:
                            "failed",

                        statusMessage:
                            "Generation failed",

                        error:
                            error instanceof
                                Error
                                ? error.message
                                : String(
                                    error
                                )
                    }
                );
        }
    }

    private handleProgress(
        jobId:
            string,

        progress:
            PipelineProgress
    ): void {
        if (progress.stage === "completed") {
            return;
        }

        this.options
            .store
            .update(
                jobId,
                {
                    status:
                        progress.stage,

                    statusMessage:
                        progress.message
                }
            );
    }
}

function getDirectoryName(
    path:
        string
): string {
    const normalized =
        path.replace(
            /[\\/]+$/,
            ""
        );

    const parts =
        normalized.split(
            /[\\/]/
        );

    return (
        parts[
            parts.length - 1
        ] ??
        normalized
    );
}

