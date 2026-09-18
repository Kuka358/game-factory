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
            "transactional-iteration",

        objective:
            "Implement in isolated workspace",

        rationale:
            "Test transactional worker lifecycle",

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


const workspace:
    WorkerWorkspaceRef = {
        id:
            "workspace-001",

        root:
            "C:/isolated/workspace-001",

        baseRevision:
            "abc123"
    };


describe(
    "transactional worker workspace",
    () => {
        it(
            "reuses one workspace across repair attempts and accepts it after verification",
            async () => {
                let planningCalls =
                    0;

                let prepareCalls =
                    0;

                const executionWorkspaceIds:
                    Array<string | undefined> =
                    [];

                const verificationWorkspaceIds:
                    Array<string | undefined> =
                    [];

                const settlements:
                    string[] =
                    [];

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

                const worker:
                    CodingWorker = {
                        async prepare() {
                            prepareCalls +=
                                1;

                            return workspace;
                        },

                        async execute(
                            input
                        ) {
                            executionWorkspaceIds.push(
                                input.workspace
                                    ?.id
                            );

                            return {
                                summary:
                                    "Changed source",

                                changedFiles: [
                                    "src/index.ts"
                                ]
                            };
                        },

                        async settle(
                            input
                        ) {
                            settlements.push(
                                input.outcome
                            );
                        }
                    };

                let verificationCalls =
                    0;

                const verifier:
                    Verifier = {
                        async verify(
                            input
                        ) {
                            verificationCalls +=
                                1;

                            verificationWorkspaceIds.push(
                                input.workspace
                                    ?.id
                            );

                            return {
                                passed:
                                    verificationCalls >
                                    1,

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
                            "transactional-run",

                        goal:
                            "Use isolated workspace",

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
                            new MemoryRunStore()
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
                    prepareCalls
                ).toBe(
                    1
                );

                expect(
                    executionWorkspaceIds
                ).toEqual([
                    "workspace-001",
                    "workspace-001"
                ]);

                expect(
                    verificationWorkspaceIds
                ).toEqual([
                    "workspace-001",
                    "workspace-001"
                ]);

                expect(
                    settlements
                ).toEqual([
                    "accept"
                ]);

                expect(
                    result.iterations[0]
                        ?.workspace
                ).toBeUndefined();
            }
        );


        it(
            "discards persisted workspace during crash recovery before restoring checkpoint",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

                const settlements:
                    string[] =
                    [];

                const worker:
                    CodingWorker = {
                        async execute() {
                            throw new Error(
                                "Worker should not execute during recovery"
                            );
                        },

                        async settle(
                            input
                        ) {
                            settlements.push(
                                `${input.outcome}:${input.workspace.id}`
                            );
                        }
                    };

                const run =
                    createAutonomousRun({
                        id:
                            "crashed-transaction",

                        goal:
                            "Recover",

                        maxIterations:
                            2
                    });

                run.status =
                    "verifying";

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
                        false,

                    checkpointId:
                        "checkpoint-001",

                    workspace
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

                expect(
                    settlements
                ).toEqual([
                    "discard:workspace-001"
                ]);

                expect(
                    checkpoints.restoredIds
                ).toEqual([
                    "checkpoint-001"
                ]);

                if (
                    result.type !==
                    "ready"
                ) {
                    throw new Error(
                        "Expected ready recovery"
                    );
                }

                expect(
                    result.run.iterations
                ).toHaveLength(
                    0
                );
            }
        );
    }
);