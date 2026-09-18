import type {
    EventJournal
} from "./events.js";

import type {
    RunStore
} from "./persistence.js";

import type {
    CheckpointManager,
    CodingWorker
} from "./providers.js";

import type {
    AutonomousRun,
    IterationRecord
} from "./state.js";


export type RecoveryResult =
    | {
        type:
            "not_found";

        runId:
            string;
    }
    | {
        type:
            "terminal";

        run:
            AutonomousRun;
    }
    | {
        type:
            "ready";

        run:
            AutonomousRun;

        recoveredIterationId?:
            string;
    };


export interface RecoveryManagerDependencies {
    runStore:
        RunStore;

    checkpointManager?:
        CheckpointManager;

    eventJournal?:
        EventJournal;

    worker?:
        CodingWorker;

    now?:
        () => string;
}


export class RecoveryManager {
    private readonly now:
        () => string;


    constructor(
        private readonly dependencies:
            RecoveryManagerDependencies
    ) {
        this.now =
            dependencies.now ??
            (() =>
                new Date()
                    .toISOString());
    }


    async recover(
        runId:
            string
    ): Promise<RecoveryResult> {
        const run =
            await this.dependencies
                .runStore
                .load(
                    runId
                );

        if (!run) {
            return {
                type:
                    "not_found",

                runId
            };
        }

        if (
            isTerminalStatus(
                run.status
            )
        ) {
            return {
                type:
                    "terminal",

                run
            };
        }

        const incompleteIndexes:
            number[] = [];

        for (
            let index = 0;
            index <
                run.iterations.length;
            index += 1
        ) {
            if (
                !run.iterations[index]
                    ?.completed
            ) {
                incompleteIndexes.push(
                    index
                );
            }
        }

        if (
            incompleteIndexes.length >
            1
        ) {
            throw new Error(
                `Cannot safely recover run ${run.id}: multiple incomplete iterations`
            );
        }

        const incompleteIndex =
            incompleteIndexes[0];

        let recoveredIterationId:
            string |
            undefined;

        let checkpointId:
            string |
            undefined;

        if (
            incompleteIndex !==
            undefined
        ) {
            if (
                incompleteIndex !==
                run.iterations.length -
                    1
            ) {
                throw new Error(
                    `Cannot safely recover run ${run.id}: incomplete iteration is not the latest iteration`
                );
            }

            const record =
                run.iterations[
                    incompleteIndex
                ];

            if (!record) {
                throw new Error(
                    `Cannot safely recover run ${run.id}: incomplete iteration is missing`
                );
            }

            recoveredIterationId =
                record.contract.id;

            if (
                record.acceptance
            ) {
                await this.recoverAcceptance(
                    run,
                    record
                );
            } else {

                if (
                    record.workspace
                ) {
                    const worker =
                        this.dependencies
                            .worker;

                    if (
                        !worker?.settle
                    ) {
                        throw new Error(
                            `Cannot safely recover run ${run.id}: active worker workspace requires worker settlement support`
                        );
                    }

                    const workspace =
                        record.workspace;

                    await worker.settle({
                        run,

                        contract:
                            record.contract,

                        workspace,

                        outcome:
                            "discard"
                    });

                    delete record.workspace;

                    run.updatedAt =
                        this.now();

                    /*
                    * Persist immediately after successful disposal.
                    * If recovery crashes afterwards, it won't lose workspace state.
                    */
                    await this.dependencies
                        .runStore
                        .save(
                            run
                        );

                    await this.appendEvent({
                        runId:
                            run.id,

                        type:
                            "worker_workspace_settled",

                        timestamp:
                            this.now(),

                        iterationId:
                            record.contract.id,

                        details: {
                            workspaceId:
                                workspace.id,

                            outcome:
                                "discard",

                            recovery:
                                true
                        }
                    });
                }

                recoveredIterationId =
                    record.contract.id;

                checkpointId =
                    record.checkpointId;

                if (
                    record.attempts.length >
                        0 &&
                    !checkpointId
                ) {
                    throw new Error(
                        `Cannot safely recover run ${run.id}: incomplete iteration has worker attempts but no checkpoint`
                    );
                }

                if (checkpointId) {
                    const manager =
                        this.dependencies
                            .checkpointManager;

                    if (!manager) {
                        throw new Error(
                            `Cannot safely recover run ${run.id}: checkpoint manager is required`
                        );
                    }

                    await manager.restore({
                        id:
                            checkpointId
                    });

                    await this.appendEvent({
                        runId:
                            run.id,

                        type:
                            "checkpoint_restored",

                        timestamp:
                            this.now(),

                        iterationId:
                            record.contract.id,

                        details: {
                            checkpointId,

                            recovery:
                                true
                        }
                    });
                }

                run.iterations.splice(
                    incompleteIndex,
                    1
                );
            }
        }

        run.currentIteration =
            run.iterations.filter(
                record =>
                    record.completed
            ).length;

        run.status =
            "planning";

        delete run.failureReason;
        delete run.completionReason;

        run.updatedAt =
            this.now();

        await this.dependencies
            .runStore
            .save(
                run
            );

        if (checkpointId) {
            await this.dependencies
                .checkpointManager
                ?.release({
                    id:
                        checkpointId
                });

            await this.appendEvent({
                runId:
                    run.id,

                type:
                    "checkpoint_released",

                timestamp:
                    this.now(),

                iterationId:
                    recoveredIterationId,

                details: {
                    checkpointId,

                    recovery:
                        true
                }
            });
        }

        await this.appendEvent({
            runId:
                run.id,

            type:
                "run_recovered",

            timestamp:
                this.now(),

            iterationId:
                recoveredIterationId,

            details: {
                currentIteration:
                    run.currentIteration
            }
        });

        return {
            type:
                "ready",

            run,

            recoveredIterationId
        };
    }


    private async appendEvent(
        event:
            Parameters<
                EventJournal["append"]
            >[0]
    ): Promise<void> {
        await this.dependencies
            .eventJournal
            ?.append(
                event
            );
    }

    private async recoverAcceptance(
        run:
            AutonomousRun,

        record:
            IterationRecord
    ): Promise<void> {
        const acceptance =
            record.acceptance;

        if (!acceptance) {
            throw new Error(
                "Recovery acceptance state is missing"
            );
        }

        const worker =
            this.dependencies
                .worker;

        if (
            acceptance.status ===
            "pending"
        ) {
            const workspace =
                record.workspace;

            if (
                !workspace ||
                !worker?.settle
            ) {
                throw new Error(
                    `Cannot recover pending acceptance for run ${run.id}: worker workspace settlement is unavailable`
                );
            }

            const result =
                await worker.settle({
                    run,

                    contract:
                        record.contract,

                    workspace,

                    outcome:
                        "accept",

                    acceptanceId:
                        acceptance.id,

                    workerResult: {
                        summary:
                            "Recovered verified acceptance",

                        changedFiles: [
                            ...acceptance.changedFiles
                        ],

                        changeSet: {
                            digest:
                                acceptance.digest
                        }
                    }
                });

            if (
                !result?.acceptedRevision
            ) {
                throw new Error(
                    `Cannot recover pending acceptance for run ${run.id}: accepted revision was not returned`
                );
            }

            acceptance.status =
                "accepted";

            acceptance.acceptedRevision =
                result.acceptedRevision;

            acceptance.acceptedAt =
                this.now();

            await this.dependencies
                .runStore
                .save(
                    run
                );

            await this.appendEvent({
                runId:
                    run.id,

                type:
                    "iteration_acceptance_accepted",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    acceptanceId:
                        acceptance.id,

                    acceptedRevision:
                        result.acceptedRevision,

                    recovery:
                        true
                }
            });

            const workspaceId =
                workspace.id;

            delete record.workspace;

            await this.dependencies
                .runStore
                .save(
                    run
                );

            await this.appendEvent({
                runId:
                    run.id,

                type:
                    "worker_workspace_settled",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    workspaceId,

                    outcome:
                        "accept",

                    recovery:
                        true
                }
            });
        } else {
            if (
                !acceptance.acceptedRevision
            ) {
                throw new Error(
                    `Cannot recover accepted iteration for run ${run.id}: accepted revision is missing`
                );
            }

            /*
            * Acceptance was already persisted but process may have
            * died before workspace cleanup state was saved.
            */
            if (
                record.workspace
            ) {
                if (
                    !worker?.settle
                ) {
                    throw new Error(
                        `Cannot recover accepted iteration for run ${run.id}: workspace cleanup is unavailable`
                    );
                }

                const workspace =
                    record.workspace;

                await worker.settle({
                    run,

                    contract:
                        record.contract,

                    workspace,

                    outcome:
                        "discard"
                });

                delete record.workspace;

                await this.dependencies
                    .runStore
                    .save(
                        run
                    );

                await this.appendEvent({
                    runId:
                        run.id,

                    type:
                        "worker_workspace_settled",

                    timestamp:
                        this.now(),

                    iterationId:
                        record.contract.id,

                    details: {
                        workspaceId:
                            workspace.id,

                        outcome:
                            "discard",

                        recovery:
                            true,

                        cleanupOnly:
                            true
                    }
                });
            }
        }

        /*
        * Accepted iterations must NEVER restore their old checkpoint:
        * HEAD now contains the verified autonomous commit.
        */
        if (
            record.checkpointId
        ) {
            const manager =
                this.dependencies
                    .checkpointManager;

            if (!manager) {
                throw new Error(
                    `Cannot recover accepted iteration for run ${run.id}: checkpoint manager is required`
                );
            }

            const checkpointId =
                record.checkpointId;

            await manager.release({
                id:
                    checkpointId
            });

            delete record.checkpointId;

            await this.dependencies
                .runStore
                .save(
                    run
                );

            await this.appendEvent({
                runId:
                    run.id,

                type:
                    "checkpoint_released",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    checkpointId,

                    recovery:
                        true,

                    accepted:
                        true
                }
            });
        }

        record.completed =
            true;

        await this.dependencies
            .runStore
            .save(
                run
            );
    }
}


function isTerminalStatus(
    status:
        AutonomousRun["status"]
): boolean {
    return (
        status ===
            "completed" ||
        status ===
            "blocked" ||
        status ===
            "failed"
    );
}