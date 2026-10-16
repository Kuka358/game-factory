import {
    resolve
} from "node:path";

import type {
    CodingHarness
} from "./harness.js";

import type {
    CodingWorker,
    WorkerInput,
    WorkerResult,
    WorkspaceManager
} from "./providers.js";

import {
    normalizeRepositoryPath
} from "./workspace.js";


export interface HarnessCodingWorkerOptions {
    repositoryRoot:
        string;

    harness:
        CodingHarness;

    workspace:
        WorkspaceManager;
}


export class HarnessCodingWorker
    implements CodingWorker
{
    private readonly repositoryRoot:
        string;


    constructor(
        private readonly options:
            HarnessCodingWorkerOptions
    ) {
        this.repositoryRoot =
            resolve(
                options.repositoryRoot
            );
    }


    async execute(
        input:
            WorkerInput
    ): Promise<WorkerResult> {
        const result =
            await this.options
                .harness
                .executeIteration({
                    repositoryRoot:
                        this.repositoryRoot,

                    runId:
                        input.run.id,

                    goal:
                        input.run.goal,

                    contract:
                        input.contract,

                    attempt:
                        input.attempt,

                    previousVerification:
                        input.previousVerification,

                    repairInstructions:
                        input.repairInstructions
                });

        const summary =
            result.summary.trim();

        if (
            summary.length ===
            0
        ) {
            throw new Error(
                "Coding harness returned an empty summary"
            );
        }

        const changedFiles:
            string[] = [];

        const seen =
            new Set<string>();

        for (
            const rawPath of
            result.changedFiles
        ) {
            const path =
                normalizeRepositoryPath(
                    rawPath
                );

            await this.options
                .workspace
                .assertPathAllowed(
                    path,
                    input.contract.scope
                );

            if (
                seen.has(
                    path
                )
            ) {
                continue;
            }

            seen.add(
                path
            );

            changedFiles.push(
                path
            );
        }

        return {
            summary,
            changedFiles
        };
    }
}