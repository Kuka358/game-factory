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
    type RepairAdvisor,
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
            "rejects a structured repair plan that rewrites verifier failures",
            async () => {
                const guardedContract = {
                    ...contract,

                    maxLocalAttempts:
                        1
                };


                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "iteration",

                                contract:
                                    guardedContract
                            };
                        }
                    };


                const worker:
                    CodingWorker = {
                        async execute() {
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
                        async verify() {
                            return {
                                passed:
                                    false,

                                checks: [
                                    {
                                        id:
                                            "runtime",

                                        command:
                                            "node verify.mjs",

                                        passed:
                                            false,

                                        exitCode:
                                            1
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise() {
                            return {
                                strategy:
                                    "repair",

                                diagnosis:
                                    "Wrong diagnosis",

                                failedChecks: [
                                    "typecheck"
                                ],

                                instructions: [
                                    "Fix something unrelated"
                                ],

                                filesHint:
                                    [],

                                preserve:
                                    []
                            };
                        }
                    };


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "structured-verifier-guard",

                            goal:
                                "Protect verifier facts",

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
                    result.failureReason
                ).toContain(
                    "must exactly match deterministic failed checks"
                );
            }
        );

        it(
            "stops after the structured escalation repair budget is exhausted",
            async () => {
                let workerCalls =
                    0;

                let advisorCalls =
                    0;


                const boundedContract = {
                    ...contract,

                    maxLocalAttempts:
                        1,

                    escalation: {
                        ...contract.escalation,

                        maxRepairRounds:
                            1
                    }
                };


                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "iteration",

                                contract:
                                    boundedContract
                            };
                        }
                    };


                const worker:
                    CodingWorker = {
                        async execute() {
                            workerCalls +=
                                1;


                            return {
                                summary:
                                    "Still broken",

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
                                    false,

                                checks: [
                                    {
                                        id:
                                            "runtime",

                                        command:
                                            "node verify.mjs",

                                        passed:
                                            false,

                                        exitCode:
                                            1,

                                        stderr:
                                            "Runtime invariant still fails"
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise() {
                            advisorCalls +=
                                1;


                            return {
                                strategy:
                                    "repair",

                                diagnosis:
                                    "Runtime invariant still fails",

                                failedChecks: [
                                    "runtime"
                                ],

                                instructions: [
                                    "Repair the runtime invariant"
                                ],

                                filesHint:
                                    [],

                                preserve:
                                    []
                            };
                        }
                    };


                const checkpointManager =
                    new MemoryCheckpointManager();


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor,
                        checkpointManager
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "structured-repair-budget",

                            goal:
                                "Bound repair attempts",

                            maxIterations:
                                2
                        })
                    );


                expect(
                    result.status
                ).toBe(
                    "blocked"
                );


                expect(
                    result.failureReason
                ).toBe(
                    "Escalation repair budget exhausted"
                );


                expect(
                    workerCalls
                ).toBe(
                    2
                );


                /*
                * The advisor is consulted again after the failed escalation
                * attempt because it may choose replan/abort/architecture_required
                * instead of another repair.
                */
                expect(
                    advisorCalls
                ).toBe(
                    2
                );


                expect(
                    checkpointManager.restoredIds
                ).toEqual(
                    checkpointManager.createdIds
                );
            }
        );

        it(
            "blocks the run when RepairAdvisor requires an architecture decision",
            async () => {
                const architectureContract = {
                    ...contract,

                    maxLocalAttempts:
                        1
                };


                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "iteration",

                                contract:
                                    architectureContract
                            };
                        }
                    };


                const worker:
                    CodingWorker = {
                        async execute() {
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
                        async verify() {
                            return {
                                passed:
                                    false,

                                checks: [
                                    {
                                        id:
                                            "architecture",

                                        command:
                                            "verify architecture",

                                        passed:
                                            false,

                                        exitCode:
                                            1,

                                        stderr:
                                            "Package ownership is ambiguous"
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise() {
                            return {
                                strategy:
                                    "architecture_required",

                                diagnosis:
                                    "The verifier exposed an unresolved package ownership decision",

                                failedChecks: [
                                    "architecture"
                                ],

                                question:
                                    "Which package should own the shared abstraction?"
                            };
                        }
                    };


                const checkpointManager =
                    new MemoryCheckpointManager();


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor,
                        checkpointManager
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "structured-architecture",

                            goal:
                                "Escalate architecture safely",

                            maxIterations:
                                2
                        })
                    );


                expect(
                    result.status
                ).toBe(
                    "blocked"
                );


                expect(
                    result.failureReason
                ).toBe(
                    "Which package should own the shared abstraction?"
                );


                expect(
                    checkpointManager.restoredIds
                ).toEqual(
                    checkpointManager.createdIds
                );
            }
        );

        it(
            "requires at least one escalation advisor",
            () => {
                expect(
                    () =>
                        new AutonomyEngine({
                            planner: {
                                async plan() {
                                    return {
                                        type:
                                            "complete",

                                        reason:
                                            "Done"
                                    };
                                }
                            },

                            worker: {
                                async execute() {
                                    return {
                                        summary:
                                            "Unused",

                                        changedFiles:
                                            []
                                    };
                                }
                            },

                            verifier: {
                                async verify() {
                                    return {
                                        passed:
                                            true,

                                        checks:
                                            []
                                    };
                                }
                            }
                        })
                ).toThrow(
                    "AutonomyEngine requires either RepairAdvisor or FailureAdvisor"
                );
            }
        );

        it(
            "fails the run when RepairAdvisor returns abort",
            async () => {
                const abortContract = {
                    ...contract,

                    maxLocalAttempts:
                        1
                };


                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "iteration",

                                contract:
                                    abortContract
                            };
                        }
                    };


                const worker:
                    CodingWorker = {
                        async execute() {
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
                        async verify() {
                            return {
                                passed:
                                    false,

                                checks: [
                                    {
                                        id:
                                            "runtime",

                                        command:
                                            "node verify.mjs",

                                        passed:
                                            false,

                                        exitCode:
                                            1,

                                        stderr:
                                            "Behaviour changed"
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise() {
                            return {
                                strategy:
                                    "abort",

                                diagnosis:
                                    "The requested change cannot preserve runtime behaviour",

                                failedChecks: [
                                    "runtime"
                                ],

                                reason:
                                    "Stop before accepting the regression"
                            };
                        }
                    };


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "structured-abort",

                            goal:
                                "Abort safely",

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
                    result.failureReason
                ).toBe(
                    "Stop before accepting the regression"
                );
            }
        );

        it(
            "prefers RepairAdvisor over legacy FailureAdvisor",
            async () => {
                let planningCalls =
                    0;

                let legacyCalls =
                    0;


                const repairContract = {
                    ...contract,

                    maxLocalAttempts:
                        1
                };


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

                                    contract:
                                        repairContract
                                }
                                : {
                                    type:
                                        "complete",

                                    reason:
                                        "Replanned"
                                };
                        }
                    };


                const worker:
                    CodingWorker = {
                        async execute() {
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
                        async verify() {
                            return {
                                passed:
                                    false,

                                checks: [
                                    {
                                        id:
                                            "architecture",

                                        command:
                                            "verify architecture",

                                        passed:
                                            false,

                                        exitCode:
                                            1,

                                        stderr:
                                            "Architecture conflict"
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise() {
                            return {
                                strategy:
                                    "replan",

                                diagnosis:
                                    "Iteration design is insufficient",

                                failedChecks: [
                                    "architecture"
                                ],

                                reason:
                                    "Create a different iteration"
                            };
                        }
                    };


                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            legacyCalls +=
                                1;


                            return {
                                type:
                                    "abort",

                                reason:
                                    "Legacy advisor must not run"
                            };
                        }
                    };


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor,
                        failureAdvisor
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "advisor-precedence",

                            goal:
                                "Prefer structured advisor",

                            maxIterations:
                                3
                        })
                    );


                expect(
                    result.status
                ).toBe(
                    "completed"
                );


                expect(
                    legacyCalls
                ).toBe(
                    0
                );


                expect(
                    result.currentIteration
                ).toBe(
                    0
                );
            }
        );

        it(
            "uses a structured repair advisor after local attempts are exhausted",
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
                                        "Structured repair succeeded"
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
                                    "Repair diagnosis: Typecheck still fails",

                                    "Failed deterministic checks: typecheck",

                                    "Fix the incompatible assignment",

                                    "Prioritize these files while repairing: packages/example/file.ts",

                                    "Preserve: Keep the public API unchanged"
                                ]);
                            }


                            return {
                                summary:
                                    "Attempt",

                                changedFiles: [
                                    "packages/example/file.ts"
                                ]
                            };
                        }
                    };


                const verifier:
                    Verifier = {
                        async verify(
                            input
                        ) {
                            if (
                                input.attempt ===
                                3
                            ) {
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


                            return {
                                passed:
                                    false,

                                checks: [
                                    {
                                        id:
                                            "typecheck",

                                        command:
                                            "pnpm typecheck",

                                        passed:
                                            false,

                                        exitCode:
                                            2,

                                        stderr:
                                            "TS2322"
                                    }
                                ]
                            };
                        }
                    };


                const repairAdvisor:
                    RepairAdvisor = {
                        async advise(
                            context
                        ) {
                            advisorCalls +=
                                1;


                            expect(
                                context.attemptsPerformed
                            ).toBe(
                                2
                            );


                            expect(
                                context.failedChecks
                                    .map(
                                        check =>
                                            check.id
                                    )
                            ).toEqual([
                                "typecheck"
                            ]);


                            return {
                                strategy:
                                    "repair",

                                diagnosis:
                                    "Typecheck still fails",

                                failedChecks: [
                                    "typecheck"
                                ],

                                instructions: [
                                    "Fix the incompatible assignment"
                                ],

                                filesHint: [
                                    "packages/example/file.ts"
                                ],

                                preserve: [
                                    "Keep the public API unchanged"
                                ]
                            };
                        }
                    };


                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        repairAdvisor
                    });


                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "structured-repair",

                            goal:
                                "Use structured repair",

                            maxIterations:
                                3
                        })
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
            }
        );

        it(
            "allows the planner to complete after exactly reaching the iteration limit",
            async () => {
                let planningCalls =
                    0;

                let workerCalls =
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
                                    "Goal reached at iteration limit"
                            };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            workerCalls +=
                                1;

                            return {
                                summary:
                                    "Implemented",

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
                                "Failure advisor should not execute"
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

                const result =
                    await engine.run(
                        createAutonomousRun({
                            id:
                                "exact-iteration-limit",

                            goal:
                                "Complete exactly at iteration limit",

                            maxIterations:
                                1
                        })
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
                    planningCalls
                ).toBe(
                    2
                );

                expect(
                    workerCalls
                ).toBe(
                    1
                );

                expect(
                    result.completionReason
                ).toBe(
                    "Goal reached at iteration limit"
                );
            }
        );

        it(
            "resumes a recovered run without repeating completed iterations",
            async () => {
                const store =
                    new MemoryRunStore();

                const checkpoints =
                    new MemoryCheckpointManager();

                const events =
                    new MemoryEventJournal();

                const interrupted =
                    createAutonomousRun({
                        id:
                            "resume-run",

                        goal:
                            "Resume execution",

                        maxIterations:
                            3
                    });

                interrupted.currentIteration =
                    1;

                interrupted.status =
                    "verifying";

                interrupted.iterations.push(
                    {
                        contract,

                        attempts:
                            [],

                        completed:
                            true
                    },
                    {
                        contract: {
                            ...contract,

                            id:
                                "interrupted-iteration"
                        },

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
                            "resume-checkpoint"
                    }
                );

                await store.save(
                    interrupted
                );

                const planner:
                    Planner = {
                        async plan() {
                            return {
                                type:
                                    "complete",

                                reason:
                                    "Already done"
                            };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            throw new Error(
                                "Worker must not execute"
                            );
                        }
                    };

                const verifier:
                    Verifier = {
                        async verify() {
                            throw new Error(
                                "Verifier must not execute"
                            );
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            throw new Error(
                                "Advisor must not execute"
                            );
                        }
                    };

                const engine =
                    new AutonomyEngine({
                        planner,
                        worker,
                        verifier,
                        failureAdvisor,

                        runStore:
                            store,

                        checkpointManager:
                            checkpoints,

                        eventJournal:
                            events
                    });

                const result =
                    await engine.resume(
                        interrupted.id
                    );

                expect(
                    result?.status
                ).toBe(
                    "completed"
                );

                expect(
                    result?.currentIteration
                ).toBe(
                    1
                );

                expect(
                    result?.iterations
                ).toHaveLength(
                    1
                );

                expect(
                    checkpoints.restoredIds
                ).toEqual([
                    "resume-checkpoint"
                ]);

                const recordedEvents =
                    await events.read(
                        interrupted.id
                    );

                expect(
                    recordedEvents.some(
                        event =>
                            event.type ===
                            "run_recovered"
                    )
                ).toBe(
                    true
                );

                expect(
                    recordedEvents.some(
                        event =>
                            event.type ===
                            "run_resumed"
                    )
                ).toBe(
                    true
                );
            }
        );

        it(
            "replans without counting a failed iteration",
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
                                    "Replanned"
                            };
                        }
                    };

                const worker:
                    CodingWorker = {
                        async execute() {
                            return {
                                summary:
                                    "Failed attempt",

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
                                    false,

                                checks:
                                    []
                            };
                        }
                    };

                const failureAdvisor:
                    FailureAdvisor = {
                        async advise() {
                            return {
                                type:
                                    "replan",

                                reason:
                                    "Need another plan"
                            };
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
                                "replan-run",

                            goal:
                                "Replan correctly",

                            maxIterations:
                                3
                        })
                    );

                expect(
                    result.status
                ).toBe(
                    "completed"
                );

                expect(
                    result.currentIteration
                ).toBe(
                    0
                );

                expect(
                    result.iterations
                ).toHaveLength(
                    0
                );

                expect(
                    checkpointManager.restoredIds
                ).toEqual(
                    checkpointManager.createdIds
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
                        async execute(
                            input
                        ) {
                            workerAttempts +=
                                1;

                            if (
                                input.attempt ===
                                1
                            ) {
                                expect(
                                    input.previousVerification
                                ).toBeUndefined();

                                expect(
                                    input.repairInstructions
                                ).toBeUndefined();
                            } else {
                                expect(
                                    input.previousVerification
                                        ?.passed
                                ).toBe(
                                    false
                                );

                                expect(
                                    input.previousVerification
                                        ?.checks[0]
                                        ?.id
                                ).toBe(
                                    "typecheck"
                                );

                                expect(
                                    input.previousVerification
                                        ?.checks[0]
                                        ?.stderr
                                ).toContain(
                                    "TS2322"
                                );

                                /*
                                * This is a local retry, not an escalation repair.
                                */
                                expect(
                                    input.repairInstructions
                                ).toBeUndefined();
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
                            if (
                                input.attempt ===
                                1
                            ) {
                                return {
                                    passed:
                                        false,

                                    checks: [
                                        {
                                            id:
                                                "typecheck",

                                            command:
                                                "pnpm typecheck",

                                            passed:
                                                false,

                                            exitCode:
                                                2,

                                            stderr:
                                                "TS2322: Type 'string' is not assignable to type 'number'."
                                        }
                                    ]
                                };
                            }

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