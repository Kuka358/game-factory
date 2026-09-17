import type {
    IterationContract
} from "./contracts.js";

import type {
    CodingWorker,
    FailureAdvisor,
    Planner,
    Verifier
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

    eventJournal?:
        EventJournal;

    now?:
        () => string;
}


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
            AutonomousRun
    ): Promise<AutonomousRun> {
        await this.record(
            run,
            {
                runId:
                    run.id,

                type:
                    "run_started",

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

            if (!result) {
                return run;
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

        touchRun(
            run
        );

        return run;
    }


    private async runIteration(
        run:
            AutonomousRun,

        contract:
            IterationContract
    ): Promise<boolean> {
        const record:
            IterationRecord = {
                contract,

                attempts:
                    [],

                completed:
                    false
            };

        run.iterations.push(
            record
        );

        await this.persist(
            run
        );

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

            touchRun(
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
                const workerResult =
                    await this.dependencies
                        .worker
                        .execute({
                            run,

                            contract,

                            attempt,

                            previousVerification,

                            repairInstructions
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

                touchRun(
                    run
                );

                const verification =
                    await this.dependencies
                        .verifier
                        .verify({
                            run,

                            contract,

                            attempt,

                            workerResult
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
                    record.completed =
                        true;

                    await this.persist(
                        run
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

                    return true;
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

                touchRun(
                    run
                );

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
                        run.status =
                            "blocked";

                        run.failureReason =
                            "Escalation repair budget exhausted";

                        touchRun(
                            run
                        );

                        return false;
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

                    touchRun(
                        run
                    );

                    return false;
                }

                if (
                    escalation.type ===
                    "architecture_required"
                ) {
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

                    touchRun(
                        run
                    );

                    return false;
                }

                if (
                    escalation.type ===
                    "replan"
                ) {
                    return true;
                }

                touchRun(
                    run
                );

                return false;
            } catch (error) {
                attemptRecord.error =
                    error instanceof Error
                        ? error.message
                        : String(error);

                attemptRecord.completedAt =
                    this.now();

                run.status =
                    "failed";

                run.failureReason =
                    attemptRecord.error;

                touchRun(
                    run
                );

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

                return false;
            }
        }

        return false;
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
}


function touchRun(
    run:
        AutonomousRun
): void {
    run.updatedAt =
        new Date()
            .toISOString();
}