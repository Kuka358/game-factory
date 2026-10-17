
import { access } from "node:fs/promises";

import type {
    CodingWorker,
    WorkerPreparationInput,
    WorkerInput,
    WorkerResult,
    WorkerSettlementInput,
    WorkerSettlementResult,
    WorkerWorkspaceRef
} from "@game-factory/autonomy";

import type {
    FreeformDependencyProvisioner
} from "../workspace/FreeformDependencyProvisioner.js";

export type TransactionalCodingWorker =
    CodingWorker &
    Required<Pick<CodingWorker, "prepare" | "settle">>;

export interface ProvisionedCodingWorkerOptions {
    worker: TransactionalCodingWorker;

    provisioner: Pick<
        FreeformDependencyProvisioner,
        "prepare" | "cleanup"
    >;
}

/**
 * Adds Linux dependency lifecycle management around an
 * existing transactional coding worker.
 *
 * Dependencies stay installed throughout coding, verification
 * and local repair attempts, then are removed before Git
 * worktree settlement.
 */
export class ProvisionedCodingWorker implements CodingWorker {
    constructor(
        private readonly options: ProvisionedCodingWorkerOptions
    ) {}

    async prepare(
        input: WorkerPreparationInput
    ): Promise<WorkerWorkspaceRef> {
        const workspace =
            await this.options.worker.prepare(input);

        if (!workspace) {
            throw new Error(
                "Transactional worker returned no workspace"
            );
        }

        try {
            await this.options.provisioner.prepare(
                workspace.root
            );

            return workspace;
        } catch (error) {
            try {
                await this.options.provisioner.cleanup(
                    workspace.root
                );
            } catch (cleanupError) {
                // Never attempt Git removal while Linux files
                // may still be present on a Windows mount.
                throw new AggregateError(
                    [error, cleanupError],
                    `Dependency preparation and cleanup failed: ${workspace.root}`
                );
            }

            try {
                await this.options.worker.settle({
                    run: input.run,
                    contract: input.contract,
                    workspace,
                    outcome: "discard"
                });
            } catch (settlementError) {
                throw new AggregateError(
                    [error, settlementError],
                    `Dependency preparation and workspace discard failed: ${workspace.root}`
                );
            }

            throw error;
        }
    }

    async execute(
        input: WorkerInput
    ): Promise<WorkerResult> {
        return this.options.worker.execute(input);
    }

    async settle(
        input: WorkerSettlementInput
    ): Promise<WorkerSettlementResult | void> {
        // Settlement can be replayed during crash recovery.
        // The underlying transactional worker handles this.
        //
        // If the worktree was already removed after a previous
        // successful settlement, skip Linux cleanup.
        let workspaceExists = true;

        try {
            await access(input.workspace.root);
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code !==
                "ENOENT"
            ) {
                throw error;
            }

            workspaceExists = false;
        }

        if (workspaceExists) {
            // Must happen BEFORE Git worktree removal.
            // A cleanup failure prevents settlement so the
            // remaining workspace can be inspected/retried.
            await this.options.provisioner.cleanup(
                input.workspace.root
            );
        }

        return this.options.worker.settle(input);
    }
}
