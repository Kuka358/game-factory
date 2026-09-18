import {
    describe,
    expect,
    it
} from "vitest";

import {
    AutonomyEngine,
    createAutonomousRun,
    MemoryEventJournal,
    MemoryRunStore,
    MemoryCheckpointManager,
    type CodingWorker,
    type FailureAdvisor,
    type Planner,
    type Verifier
} from "../src/index.js";


const contract = {
    id:
        "iteration-001",

    objective:
        "Make one verified change",

    rationale:
        "Test autonomous execution",

    scope: {
        allowedPaths:
            ["packages/example/**"],

        forbiddenPaths:
            []
    },

    changes: [
        {
            description:
                "Change example"
        }
    ],

    acceptanceCriteria: [
        "Verification passes"
    ],

    verification: [
        {
            id:
                "typecheck",

            command:
                "pnpm typecheck",

            required:
                true
        }
    ],

    architecturalConstraints:
        [],

    maxLocalAttempts:
        2,

    escalation: {
        onRepeatedFailure:
            true,

        onArchitectureConflict:
            true,

        maxRepairRounds:
            1
    }
} as const;


describe(
    "AutonomyEngine",
    () => {
        it(
            "executes an iteration and completes the run",
            async () => {
                let planningCalls =
                    0;

                const planner:
                    Planner = {
                        async plan() {
                            planningCalls +=
                                1;

                            if (
                                planningCalls ===
                                1
                            ) {
                                return {
                                    type:
                                        "iteration",

                                    contract
                                };
                            }

                            return {
                                type:
                                    "complete",

                                reason:
                                    "Goal reached"
                            };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            return {
                                summary:
                                    "Implemented",

                                changedFiles:
                                    [
                                        "packages/example/file.ts"
                                    ]
                            };
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify() {
                            return {
                                passed:
                                    true,

                                checks: [
                                    {
                                        id:
                                            "typecheck",

                                        command:
                                            "pnpm typecheck",

                                        passed:
                                            true,

                                        exitCode:
                                            0
                                    }
                                ]
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Failure advisor should not be called"
                            );
                        }
                    };

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor
                    });

                const run =
                    createAutonomousRun({
                        id:
                            "run-001",

                        goal:
                            "Test autonomous engine",

                        maxIterations:
                            3,

                        now:
                            "2026-09-17T00:00:00.000Z"
                    });

                const result =
                    await engine.run(
                        run
                    );

                expect(
                    result.status
                ).toBe(
                    "completed"
                );

                expect(
                    result.currentIteration
                ).toBe(
                    1
                );

                expect(
                    result.iterations
                ).toHaveLength(
                    1
                );

                expect(
                    result.iterations[0]
                        ?.completed
                ).toBe(
                    true
                );

                expect(
                    result.completionReason
                ).toBe(
                    "Goal reached"
                );
            }
        );

        it(
            "restores a checkpoint when worker execution fails",
            async () => {
                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "iteration",

                                contract
                            };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            throw new Error(
                                "Worker crashed"
                            );
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify() {
                            throw new Error(
                                "Verifier should not run"
                            );
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Advisor should not run"
                            );
                        }
                    };

                const checkpointManager =
                    new MemoryCheckpointManager();

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,
                        checkpointManager
                    });

                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "checkpoint-failure",

                            goal:
                                "Rollback test",

                            maxIterations:
                                2
                        })
                    );

                expect(
                    result.status
                ).toBe(
                    "failed"
                );

                expect(
                    checkpointManager.createdIds
                ).toHaveLength(
                    1
                );

                expect(
                    checkpointManager.restoredIds
                ).toEqual(
                    checkpointManager.createdIds
                );

                expect(
                    checkpointManager.releasedIds
                ).toEqual(
                    checkpointManager.createdIds
                );
            }
        );

        it(
            "creates and releases a checkpoint for a successful iteration",
            async () => {
                let planningCalls =
                    0;

                const planner:
                    Planner = {
                        async plan() {
                            planningCalls +=
                                1;

                            return planningCalls ===
                                1
                                ? {
                                    type:
                                        "iteration",

                                    contract
                                }
                                : {
                                    type:
                                        "complete",

                                    reason:
                                        "Done"
                                };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            return {
                                summary:
                                    "Changed",

                                changedFiles:
                                    []
                            };
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify() {
                            return {
                                passed:
                                    true,

                                checks:
                                    []
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Should not escalate"
                            );
                        }
                    };

                const checkpointManager =
                    new MemoryCheckpointManager();

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,
                        checkpointManager
                    });

                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "checkpoint-success",

                            goal:
                                "Checkpoint test",

                            maxIterations:
                                2
                        })
                    );

                expect(
                    result.status
                ).toBe(
                    "completed"
                );

                expect(
                    checkpointManager.createdIds
                ).toHaveLength(
                    1
                );

                expect(
                    checkpointManager.restoredIds
                ).toHaveLength(
                    0
                );

                expect(
                    checkpointManager.releasedIds
                ).toEqual(
                    checkpointManager.createdIds
                );

                expect(
                    result.iterations[0]
                        ?.checkpointId
                ).toBeUndefined();
            }
        );

        it(
            "persists run state and writes lifecycle events",
            async () => {
                let planningCalls =
                    0;

                const planner:
                    Planner = {
                        async plan() {
                            planningCalls +=
                                1;

                            return planningCalls ===
                                1
                                ? {
                                    type:
                                        "iteration",

                                    contract
                                }
                                : {
                                    type:
                                        "complete",

                                    reason:
                                        "Persisted"
                                };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            return {
                                summary:
                                    "Changed one file",

                                changedFiles: [
                                    "packages/example/file.ts"
                                ]
                            };
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify() {
                            return {
                                passed:
                                    true,

                                checks:
                                    []
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Should not escalate"
                            );
                        }
                    };

                const runStore =
                    new MemoryRunStore();

                const eventJournal =
                    new MemoryEventJournal();

                let clock =
                    0;

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,
                        runStore,
                        eventJournal,

                        now: () =>
                            `2026-09-17T00:00:${String(
                                clock++
                            ).padStart(
                                2,
                                "0"
                            )}.000Z`
                    });

                const run =
                    createAutonomousRun({
                        id:
                            "run-persisted",

                        goal:
                            "Persist execution",

                        maxIterations:
                            3,

                        now:
                            "2026-09-17T00:00:00.000Z"
                    });

                const result =
                    await engine.run(
                        run
                    );

                const saved =
                    await runStore.load(
                        run.id
                    );

                expect(
                    saved
                ).toEqual(
                    result
                );

                const events =
                    await eventJournal.read(
                        run.id
                    );

                expect(
                    events.map(
                        event =>
                            event.type
                    )
                ).toEqual([
                    "run_started",
                    "iteration_planned",
                    "worker_attempt_started",
                    "worker_attempt_completed",
                    "verification_completed",
                    "iteration_completed",
                    "run_completed"
                ]);
            }
        );


        it(
            "retries locally after failed verification",
            async () => {
                let workerAttempts =
                    0;

                let planningCalls =
                    0;

                const planner:
                    Planner = {
                        async plan() {
                            planningCalls +=
                                1;

                            return planningCalls ===
                                1
                                ? {
                                    type:
                                        "iteration",

                                    contract
                                }
                                : {
                                    type:
                                        "complete",

                                    reason:
                                        "Repaired"
                                };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            workerAttempts +=
                                1;

                            return {
                                summary:
                                    "Attempt",

                                changedFiles:
                                    []
                            };
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify(
                            input
                        ) {
                            return {
                                passed:
                                    input.attempt ===
                                    2,

                                checks:
                                    []
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Failure advisor should not be called"
                            );
                        }
                    };

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor
                    });

                const run =
                    createAutonomousRun({
                        id:
                            "run-002",

                        goal:
                            "Repair failure",

                        maxIterations:
                            3
                    });

                const result =
                    await engine.run(
                        run
                    );

                expect(
                    result.status
                ).toBe(
                    "completed"
                );

                expect(
                    workerAttempts
                ).toBe(
                    2
                );

                expect(
                    result.iterations[0]
                        ?.attempts
                ).toHaveLength(
                    2
                );

                expect(
                    result.iterations[0]
                        ?.attempts[0]
                        ?.verification
                        ?.passed
                ).toBe(
                    false
                );

                expect(
                    result.iterations[0]
                        ?.attempts[1]
                        ?.verification
                        ?.passed
                ).toBe(
                    true
                );
            }
        );

        it(
            "performs a bounded repair after escalation",
            async () => {
                let planningCalls =
                    0;

                let workerCalls =
                    0;

                let advisorCalls =
                    0;

                const planner:
                    Planner = {
                        async plan() {
                            planningCalls +=
                                1;

                            return planningCalls ===
                                1
                                ? {
                                    type:
                                        "iteration",

                                    contract
                                }
                                : {
                                    type:
                                        "complete",

                                    reason:
                                        "Escalation repair succeeded"
                                };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute(
                            input
                        ) {
                            workerCalls +=
                                1;

                            if (
                                input.attempt ===
                                3
                            ) {
                                expect(
                                    input.repairInstructions
                                ).toEqual([
                                    "Apply cloud repair"
                                ]);
                            }

                            return {
                                summary:
                                    "Attempt",

                                changedFiles:
                                    []
                            };
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify(
                            input
                        ) {
                            return {
                                passed:
                                    input.attempt ===
                                    3,

                                checks:
                                    []
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            advisorCalls +=
                                1;

                            return {
                                type:
                                    "repair",

                                instructions: [
                                    "Apply cloud repair"
                                ]
                            };
                        }
                    };

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor
                    });

                const run =
                    createAutonomousRun({
                        id:
                            "run-003",

                        goal:
                            "Repair after escalation",

                        maxIterations:
                            3
                    });

                const result =
                    await engine.run(
                        run
                    );

                expect(
                    result.status
                ).toBe(
                    "completed"
                );

                expect(
                    workerCalls
                ).toBe(
                    3
                );

                expect(
                    advisorCalls
                ).toBe(
                    1
                );

                expect(
                    result.iterations[0]
                        ?.attempts
                ).toHaveLength(
                    3
                );
            }
        );
    }
);