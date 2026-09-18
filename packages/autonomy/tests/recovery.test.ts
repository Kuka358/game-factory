import {
    describe,
    expect,
    it
} from "vitest";

import {
    createAutonomousRun,
    MemoryCheckpointManager,
    MemoryEventJournal,
    MemoryRunStore,
    RecoveryManager,
    type IterationContract
} from "../src/index.js";


const contract:
    IterationContract = {
        id:
            "iteration-recovery",

        objective:
            "Recover safely",

        rationale:
            "Test recovery",

        scope: {
            allowedPaths: [
                "packages/autonomy/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    "Test"
            }
        ],

        acceptanceCriteria: [
            "Recovered"
        ],

        verification:
            [],

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
    };


describe(
    "RecoveryManager",
    () => {
        it(
            "returns not_found for an unknown run",
            async () => {
                const manager =
                    new RecoveryManager({
                        runStore:
                            new MemoryRunStore()
                    });

                expect(
                    await manager.recover(
                        "missing"
                    )
                ).toEqual({
                    type:
                        "not_found",

                    runId:
                        "missing"
                });
            }
        );


        it(
            "does not resume a terminal run",
            async () => {
                const store =
                    new MemoryRunStore();

                const run =
                    createAutonomousRun({
                        id:
                            "terminal",

                        goal:
                            "Done",

                        maxIterations:
                            3
                    });

                run.status =
                    "completed";

                await store.save(
                    run
                );

                const manager =
                    new RecoveryManager({
                        runStore:
                            store
                    });

                const result =
                    await manager.recover(
                        run.id
                    );

                expect(
                    result.type
                ).toBe(
                    "terminal"
                );
            }
        );


        it(
            "restores checkpoint and discards an incomplete iteration",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

                const events =
                    new MemoryEventJournal();

                const run =
                    createAutonomousRun({
                        id:
                            "interrupted",

                        goal:
                            "Resume",

                        maxIterations:
                            5
                    });

                run.currentIteration =
                    1;

                run.status =
                    "verifying";

                run.iterations.push(
                    {
                        contract: {
                            ...contract,

                            id:
                                "completed"
                        },

                        attempts:
                            [],

                        completed:
                            true
                    },
                    {
                        contract,

                        attempts: [
                            {
                                attempt:
                                    1,

                                startedAt:
                                    "2026-09-18T00:00:00.000Z"
                            }
                        ],

                        completed:
                            false,

                        checkpointId:
                            "checkpoint-123"
                    }
                );

                await store.save(
                    run
                );

                const manager =
                    new RecoveryManager({
                        runStore:
                            store,

                        checkpointManager:
                            checkpoints,

                        eventJournal:
                            events
                    });

                const result =
                    await manager.recover(
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
                    result.run.status
                ).toBe(
                    "planning"
                );

                expect(
                    result.run.currentIteration
                ).toBe(
                    1
                );

                expect(
                    result.run.iterations
                ).toHaveLength(
                    1
                );

                expect(
                    checkpoints.restoredIds
                ).toEqual([
                    "checkpoint-123"
                ]);

                expect(
                    checkpoints.releasedIds
                ).toEqual([
                    "checkpoint-123"
                ]);
            }
        );

        it(
            "rejects recovery when an incomplete iteration is not the latest",
            async () => {
                const store =
                    new MemoryRunStore();

                const run =
                    createAutonomousRun({
                        id:
                            "invalid-order",

                        goal:
                            "Invalid iteration order",

                        maxIterations:
                            5
                    });

                run.status =
                    "verifying";

                run.iterations.push(
                    {
                        contract: {
                            ...contract,

                            id:
                                "incomplete"
                        },

                        attempts:
                            [],

                        completed:
                            false
                    },
                    {
                        contract: {
                            ...contract,

                            id:
                                "completed-after"
                        },

                        attempts:
                            [],

                        completed:
                            true
                    }
                );

                await store.save(
                    run
                );

                const manager =
                    new RecoveryManager({
                        runStore:
                            store
                    });

                await expect(
                    manager.recover(
                        run.id
                    )
                ).rejects.toThrow(
                    "incomplete iteration is not the latest iteration"
                );
            }
        );

        it(
            "rejects recovery with multiple incomplete iterations",
            async () => {
                const store =
                    new MemoryRunStore();

                const run =
                    createAutonomousRun({
                        id:
                            "multiple-incomplete",

                        goal:
                            "Invalid recovery state",

                        maxIterations:
                            5
                    });

                run.status =
                    "implementing";

                run.iterations.push(
                    {
                        contract: {
                            ...contract,

                            id:
                                "incomplete-a"
                        },

                        attempts:
                            [],

                        completed:
                            false
                    },
                    {
                        contract: {
                            ...contract,

                            id:
                                "incomplete-b"
                        },

                        attempts:
                            [],

                        completed:
                            false
                    }
                );

                await store.save(
                    run
                );

                const manager =
                    new RecoveryManager({
                        runStore:
                            store
                    });

                await expect(
                    manager.recover(
                        run.id
                    )
                ).rejects.toThrow(
                    "multiple incomplete iterations"
                );
            }
        );

        it(
            "rejects unsafe recovery without a checkpoint",
            async () => {
                const store =
                    new MemoryRunStore();

                const run =
                    createAutonomousRun({
                        id:
                            "unsafe",

                        goal:
                            "Unsafe resume",

                        maxIterations:
                            3
                    });

                run.status =
                    "implementing";

                run.iterations.push({
                    contract,

                    attempts: [
                        {
                            attempt:
                                1,

                            startedAt:
                                "2026-09-18T00:00:00.000Z"
                        }
                    ],

                    completed:
                        false
                });

                await store.save(
                    run
                );

                const manager =
                    new RecoveryManager({
                        runStore:
                            store
                    });

                await expect(
                    manager.recover(
                        run.id
                    )
                ).rejects.toThrow(
                    "worker attempts but no checkpoint"
                );
            }
        );
    }
);