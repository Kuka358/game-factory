import type {
    IterationContract
} from "./contracts.js";

import type {
    CheckpointManager,
    CodingWorker,
    FailureAdvisor,
    Planner,
    Verifier,
    WorkerResult
} from "./providers.js";

import type {
    AutonomousRun,
    IterationAttempt,
    IterationRecord,
    VerificationReport
} from "./state.js";

import type {
    AutonomyEvent,
    EventJournal
} from "./events.js";

import type {
    RunStore
} from "./persistence.js";

import {
    RecoveryManager
} from "./recovery.js";

export interface AutonomyEngineDependencies {
    planner:
        Planner;

    worker:
        CodingWorker;

    verifier:
        Verifier;

    failureAdvisor:
        FailureAdvisor;

    runStore?:
        RunStore;

    checkpointManager?:
        CheckpointManager;

    eventJournal?:
        EventJournal;

    now?:
        () => string;
}

export interface RunExecutionOptions {
    resumed?:
        boolean;
}


type IterationExecutionResult =
    | "completed"
    | "replan"
    | "stopped";


export class AutonomyEngine {
    private readonly now:
        () => string;

    constructor(
        private readonly dependencies:
            AutonomyEngineDependencies
    ) {
        this.now =
            dependencies.now ??
            (() =>
                new Date()
                    .toISOString());
    }


    async run(
        run:
            AutonomousRun,

        options:
            RunExecutionOptions = {}
    ): Promise<AutonomousRun> {
        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    options.resumed
                        ? "run_resumed"
                        : "run_started",

                timestamp:
                    this.now(),

                details: {
                    goal:
                        run.goal
                }
            }
        );

        while (
            run.currentIteration <
            run.maxIterations
        ) {
            run.status =
                "planning";

            await this.persist(
                run
            );

            const decision =
                await this.dependencies
                    .planner
                    .plan({
                        run
                    });

            if (
                decision.type ===
                "complete"
            ) {
                run.status =
                    "completed";

                run.completionReason =
                    decision.reason;

                await this.persist(
                    run
                );

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "run_completed",

                        timestamp:
                            this.now(),

                        details: {
                            reason:
                                decision.reason
                        }
                    }
                );

                return run;
            }

            if (
                decision.type ===
                "blocked"
            ) {
                run.status =
                    "blocked";

                run.failureReason =
                    decision.reason;

                await this.persist(
                    run
                );

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "run_blocked",

                        timestamp:
                            this.now(),

                        details: {
                            reason:
                                run.failureReason
                        }
                    }
                );

                return run;
            }

            await this.record(
                run,
                {
                    runId:
                        run.id,

                    type:
                        "iteration_planned",

                    timestamp:
                        this.now(),

                    iterationId:
                        decision.contract.id,

                    details: {
                        objective:
                            decision.contract.objective
                    }
                }
            );

            const result =
                await this.runIteration(
                    run,
                    decision.contract
                );

            if (
                result ===
                "stopped"
            ) {
                return run;
            }

            if (
                result ===
                "replan"
            ) {
                continue;
            }

            run.currentIteration +=
                1;

            await this.persist(
                run
            );
        }

        run.status =
            "blocked";

        run.failureReason =
            "Maximum autonomous iteration count reached";

        await this.persist(
            run
        );

        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    "run_blocked",

                timestamp:
                    this.now(),

                details: {
                    reason:
                        run.failureReason
                }
            }
        );

        return run;
    }

    async resume(
        runId:
            string
    ): Promise<AutonomousRun | null> {
        const runStore =
            this.dependencies
                .runStore;

        if (!runStore) {
            throw new Error(
                "AutonomyEngine resume requires a RunStore"
            );
        }

        const recoveryManager =
            new RecoveryManager({
                runStore,

                checkpointManager:
                    this.dependencies
                        .checkpointManager,

                eventJournal:
                    this.dependencies
                        .eventJournal,

                worker:
                    this.dependencies
                        .worker,

                now:
                    this.now
            });

        const recovery =
            await recoveryManager
                .recover(
                    runId
                );

        if (
            recovery.type ===
            "not_found"
        ) {
            return null;
        }

        if (
            recovery.type ===
            "terminal"
        ) {
            return recovery.run;
        }

        return this.run(
            recovery.run,
            {
                resumed:
                    true
            }
        );
    }


    private async runIteration(
        run:
            AutonomousRun,

        contract:
            IterationContract
    ): Promise<IterationExecutionResult> {
        const record:
            IterationRecord = {
                contract,

                attempts:
                    [],

                completed:
                    false,
            };

        run.iterations.push(
            record
        );

        await this.persist(
            run
        );

        if (
            this.dependencies
                .checkpointManager
        ) {
            const checkpoint =
                await this.dependencies
                    .checkpointManager
                    .create(
                        run.id,
                        contract.id,
                        contract.scope
                    );

            record.checkpointId =
                checkpoint.id;

            await this.record(
                run,
                {
                    runId:
                        run.id,

                    type:
                        "checkpoint_created",

                    timestamp:
                        this.now(),

                    iterationId:
                        contract.id,

                    details: {
                        checkpointId:
                            checkpoint.id
                    }
                }
            );
        }

        let previousVerification:
            VerificationReport |
            undefined;

        let repairInstructions:
            readonly string[] |
            undefined;

        let escalationRepairRounds =
            0;

        let attempt =
            1;

        while (true) {
            run.status =
                attempt === 1
                    ? "implementing"
                    : "repairing";

            await this.persist(
                run
            );

            const attemptRecord:
                IterationAttempt = {
                    attempt,

                    startedAt:
                        this.now()
                };

            record.attempts.push(
                attemptRecord
            );

            await this.record(
                run,
                {
                    runId:
                        run.id,

                    type:
                        "worker_attempt_started",

                    timestamp:
                        this.now(),

                    iterationId:
                        contract.id,

                    attempt
                }
            );

            try {
                await this.prepareWorkerWorkspace(
                    run,
                    record
                );

                const workerResult =
                    await this.dependencies
                        .worker
                        .execute({
                            run,

                            contract,

                            attempt,

                            previousVerification,

                            repairInstructions,

                            workspace:
                                record.workspace
                        });

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "worker_attempt_completed",

                        timestamp:
                            this.now(),

                        iterationId:
                            contract.id,

                        attempt,

                        details: {
                            summary:
                                workerResult.summary,

                            changedFiles:
                                workerResult.changedFiles
                        }
                    }
                );

                run.status =
                    "verifying";

                await this.persist(
                    run
                );

                const verification =
                    await this.dependencies
                        .verifier
                        .verify({
                            run,

                            contract,

                            attempt,

                            workerResult,

                            workspace:
                                record.workspace
                        });

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "verification_completed",

                        timestamp:
                            this.now(),

                        iterationId:
                            contract.id,

                        attempt,

                        details: {
                            passed:
                                verification.passed
                        }
                    }
                );

                attemptRecord.verification =
                    verification;

                attemptRecord.completedAt =
                    this.now();

                if (
                    verification.passed
                ) {
                    await this.settleWorkerWorkspace(
                        run,
                        record,
                        "accept",
                        workerResult
                    );

                    record.completed =
                        true;

                    await this.persist(
                        run
                    );

                    await this.releaseCheckpoint(
                        run,
                        record
                    );

                    await this.record(
                        run,
                        {
                            runId:
                                run.id,

                            type:
                                "iteration_completed",

                            timestamp:
                                this.now(),

                            iterationId:
                                contract.id,

                            attempt
                        }
                    );

                    return "completed";
                }

                previousVerification =
                    verification;

                repairInstructions =
                    undefined;

                if (
                    attempt <
                    contract.maxLocalAttempts
                ) {
                    attempt +=
                        1;
                    continue;
                }

                run.status =
                    "escalating";

                await this.persist(
                    run
                );

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "escalation_requested",

                        timestamp:
                            this.now(),

                        iterationId:
                            contract.id,

                        attempt
                    }
                );

                const escalation =
                    await this.dependencies
                        .failureAdvisor
                        .advise({
                            run,

                            contract,

                            attempts:
                                attempt,

                            verification,

                            workerResult
                        });

                if (
                    escalation.type ===
                    "repair"
                ) {
                    if (
                        escalationRepairRounds >=
                        contract.escalation
                            .maxRepairRounds
                    ) {
                        await this.settleWorkerWorkspace(
                            run,
                            record,
                            "discard",
                            workerResult
                        );

                        await this.restoreCheckpoint(
                            run,
                            record
                        );

                        run.status =
                            "blocked";

                        run.failureReason =
                            "Escalation repair budget exhausted";

                        await this.persist(
                            run
                        );

                        return "stopped";
                    }

                    escalationRepairRounds +=
                        1;

                    repairInstructions =
                        escalation.instructions;

                    previousVerification =
                        verification;

                    attempt +=
                        1;

                    await this.record(
                        run,
                        {
                            runId:
                                run.id,

                            type:
                                "repair_requested",

                            timestamp:
                                this.now(),

                            iterationId:
                                contract.id,

                            attempt,

                            details: {
                                instructions:
                                    escalation.instructions
                            }
                        }
                    );

                    continue;
                }

                if (
                    escalation.type ===
                    "abort"
                ) {
                    await this.settleWorkerWorkspace(
                        run,
                        record,
                        "discard",
                        workerResult
                    );

                    await this.restoreCheckpoint(
                        run,
                        record
                    );

                    run.status =
                        "failed";

                    run.failureReason =
                        escalation.reason;

                    await this.persist(
                        run
                    );

                    await this.record(
                        run,
                        {
                            runId:
                                run.id,

                            type:
                                "run_failed",

                            timestamp:
                                this.now(),

                            details: {
                                reason:
                                    escalation.reason
                            }
                        }
                    );

                    return "stopped";
                }

                if (
                    escalation.type ===
                    "architecture_required"
                ) {
                    await this.settleWorkerWorkspace(
                        run,
                        record,
                        "discard",
                        workerResult
                    );

                    await this.restoreCheckpoint(
                        run,
                        record
                    );

                    run.status =
                        "blocked";

                    run.failureReason =
                        escalation.question;

                    await this.persist(
                        run
                    );

                    await this.record(
                        run,
                        {
                            runId:
                                run.id,

                            type:
                                "run_blocked",

                            timestamp:
                                this.now(),

                            details: {
                                reason:
                                    escalation.question
                            }
                        }
                    );

                    return "stopped";
                }

                if (
                    escalation.type ===
                    "replan"
                ) {
                    await this.settleWorkerWorkspace(
                        run,
                        record,
                        "discard",
                        workerResult
                    );

                    await this.restoreCheckpoint(
                        run,
                        record
                    );

                    const recordIndex =
                        run.iterations.indexOf(
                            record
                        );

                    if (
                        recordIndex >=
                        0
                    ) {
                        run.iterations.splice(
                            recordIndex,
                            1
                        );
                    }

                    await this.persist(
                        run
                    );

                    await this.record(
                        run,
                        {
                            runId:
                                run.id,

                            type:
                                "iteration_replanned",

                            timestamp:
                                this.now(),

                            iterationId:
                                contract.id,

                            details: {
                                reason:
                                    escalation.reason
                            }
                        }
                    );

                    return "replan";
                }

                return "stopped";
            } catch (error) {
                const failureMessages: string[] = [
                    getErrorMessage(
                        error
                    )
                ];

                try {
                    await this.settleWorkerWorkspace(
                        run,
                        record,
                        "discard"
                    );
                } catch (cleanupError) {
                    failureMessages.push(
                        `Worker workspace cleanup failed: ${getErrorMessage(
                            cleanupError
                        )}`
                    );
                }

                try {
                    await this.restoreCheckpoint(
                        run,
                        record
                    );
                } catch (restoreError) {
                    failureMessages.push(
                        `Checkpoint restore failed: ${getErrorMessage(
                            restoreError
                        )}`
                    );
                }

                attemptRecord.error =
                    failureMessages.join(
                        "; "
                    );

                attemptRecord.completedAt =
                    this.now();

                run.status =
                    "failed";

                run.failureReason =
                    attemptRecord.error;

                await this.persist(
                    run
                );

                await this.record(
                    run,
                    {
                        runId:
                            run.id,

                        type:
                            "run_failed",

                        timestamp:
                            this.now(),

                        details: {
                            reason:
                                attemptRecord.error
                        }
                    }
                );

                return "stopped";
            }
        }
    }

    private async releaseCheckpoint(
        run:
            AutonomousRun,

        record:
            IterationRecord
    ): Promise<void> {
        const checkpointId =
            record.checkpointId;

        const manager =
            this.dependencies
                .checkpointManager;

        if (
            !checkpointId ||
            !manager
        ) {
            return;
        }

        record.checkpointId =
            undefined;

        await this.persist(
            run
        );

        await manager.release({
            id:
                checkpointId
        });

        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    "checkpoint_released",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    checkpointId
                }
            }
        );
    }


    private async restoreCheckpoint(
        run:
            AutonomousRun,

        record:
            IterationRecord
    ): Promise<void> {
        const checkpointId =
            record.checkpointId;

        const manager =
            this.dependencies
                .checkpointManager;

        if (
            !checkpointId ||
            !manager
        ) {
            return;
        }

        await manager.restore({
            id:
                checkpointId
        });

        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    "checkpoint_restored",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    checkpointId
                }
            }
        );

        await this.releaseCheckpoint(
            run,
            record
        );
    }

    private async persist(
        run:
            AutonomousRun
    ): Promise<void> {
        run.updatedAt =
            this.now();

        if (
            this.dependencies
                .runStore
        ) {
            await this.dependencies
                .runStore
                .save(
                    run
                );
        }
    }


    private async record(
        run:
            AutonomousRun,

        event:
            AutonomyEvent
    ): Promise<void> {
        if (
            this.dependencies
                .eventJournal
        ) {
            await this.dependencies
                .eventJournal
                .append(
                    event
                );
        }

        await this.persist(
            run
        );
    }

    private async prepareWorkerWorkspace(
        run:
            AutonomousRun,

        record:
            IterationRecord
    ): Promise<void> {
        if (
            record.workspace
        ) {
            return;
        }

        const worker =
            this.dependencies
                .worker;

        if (
            !worker.prepare
        ) {
            return;
        }

        if (
            !worker.settle
        ) {
            throw new Error(
                "Coding worker with prepare() must also implement settle()"
            );
        }

        const workspace =
            await worker.prepare({
                run,

                contract:
                    record.contract
            });

        if (!workspace) {
            return;
        }

        record.workspace =
            workspace;

        /*
        * Persist before doing any coding in the workspace.
        * Recovery must know that the workspace exists.
        */
        await this.persist(
            run
        );

        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    "worker_workspace_prepared",

                timestamp:
                    this.now(),

                iterationId:
                    record.contract.id,

                details: {
                    workspaceId:
                        workspace.id,

                    baseRevision:
                        workspace.baseRevision
                }
            }
        );
    }


    private async settleWorkerWorkspace(
        run:
            AutonomousRun,

        record:
            IterationRecord,

        outcome:
            "accept" | "discard",

        workerResult?:
            WorkerResult
    ): Promise<void> {
        const workspace =
            record.workspace;

        if (!workspace) {
            return;
        }

        const settle =
            this.dependencies
                .worker
                .settle;

        if (!settle) {
            throw new Error(
                "Active worker workspace cannot be settled because worker.settle() is unavailable"
            );
        }

        await settle({
            run,

            contract:
                record.contract,

            workspace,

            outcome,

            workerResult
        });

        /*
        * Clear only AFTER settlement succeeds.
        * If the process dies during settlement, recovery can retry it.
        */
        delete record.workspace;

        await this.persist(
            run
        );

        await this.record(
            run,
            {
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

                    outcome
                }
            }
        );
    }
}

function getErrorMessage(
    error:
        unknown
): string {
    return error instanceof
        Error
        ? error.message
        : String(
            error
        );
}