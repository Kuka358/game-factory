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

export interface GameJobRunnerOptions {
    store:
        GameJobStore;

    outputRoot:
        string;
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
                await runPromptGenerationPipeline(
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
                            workspace.root
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

