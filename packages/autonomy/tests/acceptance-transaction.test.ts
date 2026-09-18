import {
    describe,
    expect,
    it
} from "vitest";

import {
    AutonomyEngine,
    MemoryCheckpointManager,
    MemoryRunStore,
    RecoveryManager,
    createAutonomousRun,
    type CodingWorker,
    type FailureAdvisor,
    type IterationContract,
    type Planner,
    type Verifier,
    type WorkerWorkspaceRef
} from "../src/index.js";


const contract:
    IterationContract = {
        id:
            "acceptance-iteration",

        objective:
            "Accept verified change",

        rationale:
            "Test durable acceptance transaction",

        scope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    "Change source"
            }
        ],

        acceptanceCriteria: [
            "Verification passes"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

        maxLocalAttempts:
            1,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                1
        }
    };


const workspace:
    WorkerWorkspaceRef = {
        id:
            "workspace-001",

        root:
            "C:/isolated/workspace-001",

        baseRevision:
            "revision-a"
    };


describe(
    "durable acceptance transaction",
    () => {
        it(
            "persists accepted revision and releases checkpoint after successful acceptance",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

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
                                    "Done"
                            };
                        }
                    };

                const settlementOutcomes:
                    string[] = [];

                const worker:
                    CodingWorker = {
                        async prepare() {
                            return workspace;
                        },

                        async execute() {
                            return {
                                summary:
                                    "Implemented verified change",

                                changedFiles: [
                                    "src/index.ts"
                                ],

                                changeSet: {
                                    digest:
                                        "a".repeat(
                                            64
                                        )
                                }
                            };
                        },

                        async settle(
                            input
                        ) {
                            settlementOutcomes.push(
                                input.outcome
                            );

                            expect(
                                input.acceptanceId
                            ).toBeDefined();

                            return {
                                acceptedRevision:
                                    "revision-b"
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
                                "Failure advisor should not execute"
                            );
                        }
                    };

                const run =
                    createAutonomousRun({
                        id:
                            "successful-acceptance",

                        goal:
                            "Accept verified change",

                        maxIterations:
                            2
                    });

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,

                        runStore:
                            store,

                        checkpointManager:
                            checkpoints
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
                    settlementOutcomes
                ).toEqual([
                    "accept"
                ]);

                expect(
                    result.iterations
                ).toHaveLength(
                    1
                );

                const record =
                    result.iterations[0];

                expect(
                    record
                        ?.completed
                ).toBe(
                    true
                );

                expect(
                    record
                        ?.acceptance
                        ?.status
                ).toBe(
                    "accepted"
                );

                expect(
                    record
                        ?.acceptance
                        ?.acceptedRevision
                ).toBe(
                    "revision-b"
                );

                expect(
                    record
                        ?.workspace
                ).toBeUndefined();

                expect(
                    record
                        ?.checkpointId
                ).toBeUndefined();

                expect(
                    checkpoints.createdIds
                ).toHaveLength(
                    1
                );

                expect(
                    checkpoints.restoredIds
                ).toEqual([]);

                expect(
                    checkpoints.releasedIds
                ).toEqual(
                    checkpoints.createdIds
                );
            }
        );


        it(
            "keeps pending acceptance durable when settlement is interrupted",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

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
                        async prepare() {
                            return workspace;
                        },

                        async execute() {
                            return {
                                summary:
                                    "Implemented verified change",

                                changedFiles: [
                                    "src/index.ts"
                                ],

                                changeSet: {
                                    digest:
                                        "b".repeat(
                                            64
                                        )
                                }
                            };
                        },

                        async settle(
                            input
                        ) {
                            expect(
                                input.outcome
                            ).toBe(
                                "accept"
                            );

                            expect(
                                input.acceptanceId
                            ).toBeDefined();

                            throw new Error(
                                "simulated crash during accept"
                            );
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
                                "Failure advisor should not execute"
                            );
                        }
                    };

                const run =
                    createAutonomousRun({
                        id:
                            "interrupted-acceptance",

                        goal:
                            "Survive interrupted acceptance",

                        maxIterations:
                            2
                    });

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,

                        runStore:
                            store,

                        checkpointManager:
                            checkpoints
                    });

                await expect(
                    engine.run(
                        run
                    )
                ).rejects.toThrow(
                    "simulated crash during accept"
                );

                const persisted =
                    await store.load(
                        run.id
                    );

                expect(
                    persisted
                ).not.toBeNull();

                expect(
                    persisted
                        ?.status
                ).toBe(
                    "committing"
                );

                expect(
                    persisted
                        ?.iterations
                ).toHaveLength(
                    1
                );

                const record =
                    persisted
                        ?.iterations[0];

                expect(
                    record
                        ?.completed
                ).toBe(
                    false
                );

                expect(
                    record
                        ?.acceptance
                        ?.status
                ).toBe(
                    "pending"
                );

                expect(
                    record
                        ?.workspace
                        ?.id
                ).toBe(
                    "workspace-001"
                );

                expect(
                    record
                        ?.checkpointId
                ).toBeDefined();

                expect(
                    checkpoints.restoredIds
                ).toEqual([]);

                expect(
                    checkpoints.releasedIds
                ).toEqual([]);
            }
        );


        it(
            "finishes pending acceptance during recovery without restoring the old checkpoint",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

                const settlements:
                    string[] = [];

                const worker:
                    CodingWorker = {
                        async execute() {
                            throw new Error(
                                "Worker execute should not run during recovery"
                            );
                        },

                        async settle(
                            input
                        ) {
                            settlements.push(
                                `${input.outcome}:${input.workspace.id}`
                            );

                            expect(
                                input.outcome
                            ).toBe(
                                "accept"
                            );

                            expect(
                                input.acceptanceId
                            ).toBe(
                                "acceptance-001"
                            );

                            expect(
                                input.workerResult
                                    ?.changeSet
                                    ?.digest
                            ).toBe(
                                "c".repeat(
                                    64
                                )
                            );

                            return {
                                acceptedRevision:
                                    "revision-b"
                            };
                        }
                    };

                const run =
                    createAutonomousRun({
                        id:
                            "recover-pending-acceptance",

                        goal:
                            "Recover acceptance",

                        maxIterations:
                            2
                    });

                run.status =
                    "committing";

                run.iterations.push({
                    contract,

                    attempts: [
                        {
                            attempt:
                                1,

                            startedAt:
                                "2026-09-18T00:00:00.000Z",

                            completedAt:
                                "2026-09-18T00:00:01.000Z",

                            verification: {
                                passed:
                                    true,

                                checks:
                                    []
                            }
                        }
                    ],

                    completed:
                        false,

                    checkpointId:
                        "checkpoint-001",

                    workspace,

                    acceptance: {
                        id:
                            "acceptance-001",

                        status:
                            "pending",

                        attempt:
                            1,

                        baseRevision:
                            "revision-a",

                        digest:
                            "c".repeat(
                                64
                            ),

                        changedFiles: [
                            "src/index.ts"
                        ],

                        createdAt:
                            "2026-09-18T00:00:01.000Z"
                    }
                });

                await store.save(
                    run
                );

                const recovery =
                    new RecoveryManager({
                        runStore:
                            store,

                        checkpointManager:
                            checkpoints,

                        worker
                    });

                const result =
                    await recovery.recover(
                        run.id
                    );

                expect(
                    result.type
                ).toBe(
                    "ready"
                );

                if (
                    result.type !==
                    "ready"
                ) {
                    throw new Error(
                        "Expected ready recovery"
                    );
                }

                expect(
                    settlements
                ).toEqual([
                    "accept:workspace-001"
                ]);

                expect(
                    checkpoints.restoredIds
                ).toEqual([]);

                expect(
                    checkpoints.releasedIds
                ).toEqual([
                    "checkpoint-001"
                ]);

                expect(
                    result.run.iterations
                ).toHaveLength(
                    1
                );

                const record =
                    result.run
                        .iterations[0];

                expect(
                    record
                        ?.completed
                ).toBe(
                    true
                );

                expect(
                    record
                        ?.acceptance
                        ?.status
                ).toBe(
                    "accepted"
                );

                expect(
                    record
                        ?.acceptance
                        ?.acceptedRevision
                ).toBe(
                    "revision-b"
                );

                expect(
                    record
                        ?.workspace
                ).toBeUndefined();

                expect(
                    record
                        ?.checkpointId
                ).toBeUndefined();

                expect(
                    result.run
                        .currentIteration
                ).toBe(
                    1
                );
            }
        );


        it(
            "cleans stale workspace for already accepted iteration without restoring checkpoint",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

                const settlements:
                    string[] = [];

                const worker:
                    CodingWorker = {
                        async execute() {
                            throw new Error(
                                "Worker execute should not run during recovery"
                            );
                        },

                        async settle(
                            input
                        ) {
                            settlements.push(
                                `${input.outcome}:${input.workspace.id}`
                            );

                            expect(
                                input.outcome
                            ).toBe(
                                "discard"
                            );
                        }
                    };

                const run =
                    createAutonomousRun({
                        id:
                            "recover-accepted-cleanup",

                        goal:
                            "Finish accepted cleanup",

                        maxIterations:
                            2
                    });

                run.status =
                    "committing";

                run.iterations.push({
                    contract,

                    attempts: [
                        {
                            attempt:
                                1,

                            startedAt:
                                "2026-09-18T00:00:00.000Z",

                            completedAt:
                                "2026-09-18T00:00:01.000Z",

                            verification: {
                                passed:
                                    true,

                                checks:
                                    []
                            }
                        }
                    ],

                    completed:
                        false,

                    checkpointId:
                        "checkpoint-001",

                    workspace,

                    acceptance: {
                        id:
                            "acceptance-001",

                        status:
                            "accepted",

                        attempt:
                            1,

                        baseRevision:
                            "revision-a",

                        digest:
                            "d".repeat(
                                64
                            ),

                        changedFiles: [
                            "src/index.ts"
                        ],

                        createdAt:
                            "2026-09-18T00:00:01.000Z",

                        acceptedRevision:
                            "revision-b",

                        acceptedAt:
                            "2026-09-18T00:00:02.000Z"
                    }
                });

                await store.save(
                    run
                );

                const recovery =
                    new RecoveryManager({
                        runStore:
                            store,

                        checkpointManager:
                            checkpoints,

                        worker
                    });

                const result =
                    await recovery.recover(
                        run.id
                    );

                expect(
                    result.type
                ).toBe(
                    "ready"
                );

                if (
                    result.type !==
                    "ready"
                ) {
                    throw new Error(
                        "Expected ready recovery"
                    );
                }

                expect(
                    settlements
                ).toEqual([
                    "discard:workspace-001"
                ]);

                /*
                 * Главное:
                 * accepted iteration никогда не откатывает
                 * checkpoint старого HEAD.
                 */
                expect(
                    checkpoints.restoredIds
                ).toEqual([]);

                expect(
                    checkpoints.releasedIds
                ).toEqual([
                    "checkpoint-001"
                ]);

                expect(
                    result.run.iterations
                ).toHaveLength(
                    1
                );

                const record =
                    result.run
                        .iterations[0];

                expect(
                    record
                        ?.completed
                ).toBe(
                    true
                );

                expect(
                    record
                        ?.acceptance
                        ?.status
                ).toBe(
                    "accepted"
                );

                expect(
                    record
                        ?.acceptance
                        ?.acceptedRevision
                ).toBe(
                    "revision-b"
                );

                expect(
                    record
                        ?.workspace
                ).toBeUndefined();

                expect(
                    record
                        ?.checkpointId
                ).toBeUndefined();

                expect(
                    result.run
                        .currentIteration
                ).toBe(
                    1
                );
            }
        );
    }
);