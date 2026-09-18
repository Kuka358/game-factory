import {
    execFile
} from "node:child_process";

import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    promisify
} from "node:util";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    createAutonomousRun,
    createLocalAutonomyRuntime,
    type CodingWorker,
    type FailureAdvisor,
    type Planner,
    type Verifier
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


const contract = {
    id:
        "runtime-iteration",

    objective:
        "Execute local runtime",

    rationale:
        "Integration test",

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
                "Test runtime"
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
            0
    }
} as const;


describe(
    "LocalAutonomyRuntime",
    () => {
        it(
            "runs and persists an autonomous execution",
            async () => {
                const repository =
                    await createRepository();

                try {
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
                                            "Runtime completed"
                                    };
                            }
                        };

                    const worker:
                        CodingWorker = {
                            async execute() {
                                return {
                                    summary:
                                        "No-op implementation",

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

                    const runtime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    const result =
                        await runtime.start({
                            id:
                                "runtime-run",

                            goal:
                                "Test local runtime",

                            maxIterations:
                                3
                        });

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

                    const stored =
                        await runtime.runStore
                            .load(
                                "runtime-run"
                            );

                    expect(
                        stored
                    ).toEqual(
                        result
                    );

                    const events =
                        await runtime.eventJournal
                            .read(
                                "runtime-run"
                            );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "checkpoint_created"
                        )
                    ).toBe(
                        true
                    );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "run_completed"
                        )
                    ).toBe(
                        true
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );

        it(
            "restores an interrupted filesystem state after process restart",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const planner:
                        Planner = {
                            async plan() {
                                return {
                                    type:
                                        "complete",

                                    reason:
                                        "Recovered successfully"
                                };
                            }
                        };

                    const worker:
                        CodingWorker = {
                            async execute() {
                                throw new Error(
                                    "Worker must not execute after recovery"
                                );
                            }
                        };

                    const verifier:
                        Verifier = {
                            async verify() {
                                throw new Error(
                                    "Verifier must not execute after recovery"
                                );
                            }
                        };

                    const failureAdvisor:
                        FailureAdvisor = {
                            async advise() {
                                throw new Error(
                                    "Advisor must not execute after recovery"
                                );
                            }
                        };

                    const firstRuntime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    const checkpoint =
                        await firstRuntime
                            .checkpointManager
                            .create(
                                "crash-run",
                                contract.id,
                                contract.scope
                            );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "index.ts"
                        ),
                        "export const interrupted = true;\n",
                        "utf8"
                    );

                    const interruptedRun =
                        createAutonomousRun({
                            id:
                                "crash-run",

                            goal:
                                "Recover after crash",

                            maxIterations:
                                3,

                            now:
                                "2026-09-18T00:00:00.000Z"
                        });

                    interruptedRun.status =
                        "implementing";

                    interruptedRun.iterations.push({
                        contract,

                        attempts: [
                            {
                                attempt:
                                    1,

                                startedAt:
                                    "2026-09-18T00:00:01.000Z"
                            }
                        ],

                        completed:
                            false,

                        checkpointId:
                            checkpoint.id
                    });

                    await firstRuntime
                        .runStore
                        .save(
                            interruptedRun
                        );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "index.ts"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "export const interrupted = true;\n"
                    );

                    const restartedRuntime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    const result =
                        await restartedRuntime
                            .resume(
                                interruptedRun.id
                            );

                    expect(
                        result?.status
                    ).toBe(
                        "completed"
                    );

                    expect(
                        result?.currentIteration
                    ).toBe(
                        0
                    );

                    expect(
                        result?.iterations
                    ).toHaveLength(
                        0
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "index.ts"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "export {};\n"
                    );

                    const events =
                        await restartedRuntime
                            .eventJournal
                            .read(
                                interruptedRun.id
                            );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "checkpoint_restored"
                        )
                    ).toBe(
                        true
                    );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "run_recovered"
                        )
                    ).toBe(
                        true
                    );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "run_resumed"
                        )
                    ).toBe(
                        true
                    );

                    expect(
                        events.some(
                            event =>
                                event.type ===
                                "run_completed"
                        )
                    ).toBe(
                        true
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );

        it(
            "rejects starting a run with an existing id",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const planner:
                        Planner = {
                            async plan() {
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
                            async execute() {
                                throw new Error(
                                    "Worker should not execute"
                                );
                            }
                        };

                    const verifier:
                        Verifier = {
                            async verify() {
                                throw new Error(
                                    "Verifier should not execute"
                                );
                            }
                        };

                    const failureAdvisor:
                        FailureAdvisor = {
                            async advise() {
                                throw new Error(
                                    "Advisor should not execute"
                                );
                            }
                        };

                    const runtime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    await runtime.start({
                        id:
                            "duplicate",

                        goal:
                            "First run",

                        maxIterations:
                            2
                    });

                    await expect(
                        runtime.start({
                            id:
                                "duplicate",

                            goal:
                                "Second run",

                            maxIterations:
                                2
                        })
                    ).rejects.toThrow(
                        "Autonomous run already exists"
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "returns a persisted terminal run from resume",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const planner:
                        Planner = {
                            async plan() {
                                return {
                                    type:
                                        "complete",

                                    reason:
                                        "Already complete"
                                };
                            }
                        };

                    const worker:
                        CodingWorker = {
                            async execute() {
                                throw new Error(
                                    "Worker should not execute"
                                );
                            }
                        };

                    const verifier:
                        Verifier = {
                            async verify() {
                                throw new Error(
                                    "Verifier should not execute"
                                );
                            }
                        };

                    const failureAdvisor:
                        FailureAdvisor = {
                            async advise() {
                                throw new Error(
                                    "Advisor should not execute"
                                );
                            }
                        };

                    const runtime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    const original =
                        await runtime.start({
                            id:
                                "terminal-run",

                            goal:
                                "Complete immediately",

                            maxIterations:
                                2
                        });

                    const restartedRuntime =
                        createLocalAutonomyRuntime({
                            repositoryRoot:
                                repository,

                            planner,
                            worker,
                            verifier,
                            failureAdvisor
                        });

                    const resumed =
                        await restartedRuntime
                            .resume(
                                original.id
                            );

                    expect(
                        resumed
                    ).toEqual(
                        original
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );
    }
);


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-local-runtime-"
            )
        );

    await runGit(
        repository,
        [
            "init"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.autocrlf",
            "false"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.eol",
            "lf"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.email",
            "test@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Test"
        ]
    );

    await mkdir(
        join(
            repository,
            "src"
        ),
        {
            recursive:
                true
        }
    );

    await writeFile(
        join(
            repository,
            ".gitignore"
        ),
        ".game-factory/\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "index.ts"
        ),
        "export {};\n",
        "utf8"
    );

    await runGit(
        repository,
        [
            "add",
            "."
        ]
    );

    await runGit(
        repository,
        [
            "commit",
            "-m",
            "initial"
        ]
    );

    return repository;
}


async function runGit(
    repository:
        string,

    args:
        readonly string[]
): Promise<void> {
    await execFileAsync(
        "git",
        [
            ...args
        ],
        {
            cwd:
                repository,

            encoding:
                "utf8",

            windowsHide:
                true
        }
    );
}