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


export interface AutonomyEngineDependencies {
    planner:
        Planner;

    worker:
        CodingWorker;

    verifier:
        Verifier;

    failureAdvisor:
        FailureAdvisor;
}


export class AutonomyEngine {
    constructor(
        private readonly dependencies:
            AutonomyEngineDependencies
    ) {
    }


    async run(
        run:
            AutonomousRun
    ): Promise<AutonomousRun> {
        while (
            run.currentIteration <
            run.maxIterations
        ) {
            run.status =
                "planning";

            touchRun(
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

                touchRun(
                    run
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

                touchRun(
                    run
                );

                return run;
            }

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

            touchRun(
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

        let previousVerification:
            VerificationReport |
            undefined;

        let repairInstructions:
            readonly string[] |
            undefined;

        for (
            let attempt = 1;
            attempt <=
                contract.maxLocalAttempts;
            attempt += 1
        ) {
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
                        new Date()
                            .toISOString()
                };

            record.attempts.push(
                attemptRecord
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

                run.status =
                    "verifying";

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

                attemptRecord.verification =
                    verification;

                attemptRecord.completedAt =
                    new Date()
                        .toISOString();

                if (
                    verification.passed
                ) {
                    record.completed =
                        true;

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
                    continue;
                }

                run.status =
                    "escalating";

                touchRun(
                    run
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
                    "abort"
                ) {
                    run.status =
                        "failed";

                    run.failureReason =
                        escalation.reason;

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

                run.status =
                    "blocked";

                run.failureReason =
                    "Repair requested after local retry budget was exhausted";

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
                    new Date()
                        .toISOString();

                run.status =
                    "failed";

                run.failureReason =
                    attemptRecord.error;

                touchRun(
                    run
                );

                return false;
            }
        }

        return false;
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