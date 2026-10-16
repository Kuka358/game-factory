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
    WorkerSettlementInput,
    WorkerSettlementResult
} from "./providers.js";

import type {
    WorkerWorkspaceRef
} from "./state.js";

import {
    VerifiedCommitManager
} from "./verified-commit.js";


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

    private readonly commitManager:
        VerifiedCommitManager;


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

        this.commitManager =
            new VerifiedCommitManager({
                repositoryRoot:
                    options.repositoryRoot
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
    ): Promise<WorkerSettlementResult | void> {
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

        const acceptanceId =
            input.acceptanceId;

        if (!acceptanceId) {
            throw new Error(
                "Cannot accept isolated workspace without an acceptance id"
            );
        }

        const workerResult =
            input.workerResult;

        const digest =
            workerResult
                ?.changeSet
                ?.digest;

        if (
            !workerResult ||
            !digest
        ) {
            throw new Error(
                "Cannot accept isolated workspace without a verified changeset digest"
            );
        }

        const commitInput = {
            baseRevision:
                input.workspace
                    .baseRevision,

            changedFiles:
                workerResult
                    .changedFiles,

            message:
                `autonomy: ${input.contract.id}`,

            acceptanceId,

            digest
        };

        /*
        * No-op verified iterations do not need promotion,
        * but VerifiedCommitManager still validates HEAD.
        */
        if (
            workerResult
                .changedFiles
                .length ===
            0
        ) {
            const result =
                await this.commitManager
                    .commit(
                        commitInput
                    );

            await this.worktreeManager
                .remove(
                    worktree
                );

            return {
                acceptedRevision:
                    result.revision
            };
        }

        /*
        * Crash may have happened after commit but before run state
        * was persisted or the worktree was removed.
        */
        const alreadyAccepted =
            await this.commitManager
                .findAcceptedRevision({
                    baseRevision:
                        input.workspace
                            .baseRevision,

                    acceptanceId,

                    digest
                });

        let acceptedRevision:
            string;

        if (alreadyAccepted) {
            acceptedRevision =
                alreadyAccepted;
        } else {
            /*
            * Promotion itself is replay-safe.
            */
            await this.worktreeManager
                .promote(
                    worktree,
                    input.contract.scope,
                    digest
                );

            const result =
                await this.commitManager
                    .commit(
                        commitInput
                    );

            acceptedRevision =
                result.revision;
        }

        /*
        * Removal is replay-safe too.
        */
        await this.worktreeManager
            .remove(
                worktree
            );

        return {
            acceptedRevision
        };
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