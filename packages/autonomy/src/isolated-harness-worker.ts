import type {
    CodingHarness
} from "./harness.js";

import {
    GitWorktreeManager,
    type GitWorktreeRef
} from "./git-worktree.js";

import type {
    CodingWorker,
    WorkerInput,
    WorkerPreparationInput,
    WorkerResult,
    WorkerSettlementInput
} from "./providers.js";

import type {
    WorkerWorkspaceRef
} from "./state.js";


export interface IsolatedHarnessCodingWorkerOptions {
    repositoryRoot:
        string;

    harness:
        CodingHarness;

    worktreesDirectory?:
        string;
}


export class IsolatedHarnessCodingWorker
    implements CodingWorker
{
    private readonly worktreeManager:
        GitWorktreeManager;


    constructor(
        private readonly options:
            IsolatedHarnessCodingWorkerOptions
    ) {
        this.worktreeManager =
            new GitWorktreeManager({
                repositoryRoot:
                    options.repositoryRoot,

                worktreesDirectory:
                    options.worktreesDirectory
            });
    }


    async prepare(
        input:
            WorkerPreparationInput
    ): Promise<WorkerWorkspaceRef> {
        const worktree =
            await this.worktreeManager
                .create(
                    input.run.id,
                    input.contract.id,
                    1
                );

        return {
            id:
                worktree.id,

            root:
                worktree.path,

            baseRevision:
                worktree.headSha
        };
    }


    async execute(
        input:
            WorkerInput
    ): Promise<WorkerResult> {
        const workspace =
            input.workspace;

        if (!workspace) {
            throw new Error(
                "Isolated coding worker requires a prepared workspace"
            );
        }

        const worktree =
            toGitWorktreeRef(
                workspace
            );

        const harnessResult =
            await this.options
                .harness
                .executeIteration({
                    repositoryRoot:
                        workspace.root,

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
            harnessResult.summary
                .trim();

        if (
            summary.length ===
            0
        ) {
            throw new Error(
                "Coding harness returned an empty summary"
            );
        }

        /*
         * harnessResult.changedFiles is intentionally NOT trusted.
         * The actual Git worktree is the security source of truth.
         */
        const snapshot =
            await this.worktreeManager
                .snapshotAllowedChanges(
                    worktree,
                    input.contract.scope
                );

        return {
            summary,

            changedFiles:
                snapshot.changedFiles,

            changeSet: {
                digest:
                    snapshot.digest
            }
        };
    }


    async settle(
        input:
            WorkerSettlementInput
    ): Promise<void> {
        const worktree =
            toGitWorktreeRef(
                input.workspace
            );

        if (
            input.outcome ===
            "discard"
        ) {
            await this.worktreeManager
                .remove(
                    worktree
                );

            return;
        }

        const digest =
            input.workerResult
                ?.changeSet
                ?.digest;

        if (!digest) {
            throw new Error(
                "Cannot accept isolated workspace without a verified changeset digest"
            );
        }

        await this.worktreeManager
            .promote(
                worktree,
                input.contract.scope,
                digest
            );

        await this.worktreeManager
            .remove(
                worktree
            );
    }
}


function toGitWorktreeRef(
    workspace:
        WorkerWorkspaceRef
): GitWorktreeRef {
    return {
        id:
            workspace.id,

        path:
            workspace.root,

        headSha:
            workspace.baseRevision
    };
}