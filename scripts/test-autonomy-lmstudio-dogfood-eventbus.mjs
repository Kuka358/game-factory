import {
    execFile
} from "node:child_process";

import {
    randomUUID
} from "node:crypto";

import {
    mkdtemp
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    dirname,
    join,
    resolve
} from "node:path";

import {
    promisify
} from "node:util";

import {
    fileURLToPath
} from "node:url";

import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AICodingHarness,
    AutonomyEngine,
    DeterministicCommandVerifier,
    FileRunStore,
    GitCheckpointManager,
    GitRepositoryContextDiscovery,
    IsolatedHarnessCodingWorker,
    createAutonomousRun
} from "../packages/autonomy/dist/index.js";


const execFileAsync =
    promisify(
        execFile
    );


const sourceRepositoryRoot =
    resolve(
        process.cwd()
    );


const scriptDirectory =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );


const verifierPath =
    join(
        scriptDirectory,
        "verify-autonomy-eventbus-dogfood.mjs"
    );


const target =
    "packages/runtime/src/events/EventBus.ts";


const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";


const model =
    process.env.LM_STUDIO_MODEL;


if (!model) {
    throw new Error(
        "LM_STUDIO_MODEL is required"
    );
}


const timeoutMs =
    Number(
        process.env.LM_STUDIO_TIMEOUT_MS ??
        "180000"
    );


if (
    !Number.isFinite(
        timeoutMs
    ) ||
    timeoutMs <=
        0
) {
    throw new Error(
        "LM_STUDIO_TIMEOUT_MS must be a positive number"
    );
}


const sourceHead =
    await getHead(
        sourceRepositoryRoot
    );


const sourceBranch =
    (
        await runGitOutput(
            sourceRepositoryRoot,
            [
                "branch",
                "--show-current"
            ]
        )
    ).trim();


const temporaryRoot =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-eventbus-dogfood-"
        )
    );


const dogfoodRepositoryRoot =
    join(
        temporaryRoot,
        "repository"
    );


const branchName =
    `autonomy-dogfood/eventbus-${randomUUID().slice(0, 8)}`;


let worktreeCreated =
    false;


try {
    console.log(
        "Preparing real game-factory dogfood worktree..."
    );

    console.log(
        `Source branch: ${sourceBranch || "<detached>"}`
    );

    console.log(
        `Source HEAD: ${sourceHead}`
    );

    console.log(
        `Dogfood branch: ${branchName}`
    );

    console.log(
        `Dogfood worktree: ${dogfoodRepositoryRoot}`
    );


    await runGit(
        sourceRepositoryRoot,
        [
            "worktree",
            "add",
            "-b",
            branchName,
            dogfoodRepositoryRoot,
            sourceHead
        ]
    );


    worktreeCreated =
        true;


    const dogfoodInitialHead =
        await getHead(
            dogfoodRepositoryRoot
        );


    if (
        dogfoodInitialHead !==
        sourceHead
    ) {
        throw new Error(
            "Dogfood worktree did not start from source HEAD"
        );
    }


    console.log(
        "\nChecking RED baseline before Qwen..."
    );


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "typescript"
    );


    const redFailure =
        await expectFixtureFailure(
            dogfoodRepositoryRoot,
            "runtime"
        );


    if (
        !redFailure.includes(
            'Expected calls: ["first","second"]'
        )
    ) {
        throw new Error(
            [
                "Dogfood runtime verifier failed for an unexpected reason.",
                redFailure
            ].join(
                "\n"
            )
        );
    }


    console.log(
        "PASS baseline TypeScript verification"
    );

    console.log(
        "PASS baseline runtime verification is RED for the intended EventBus behaviour"
    );


    const provider =
        new LMStudioProvider({
            baseUrl,
            timeoutMs
        });


    let contextObserved =
        false;


    const observedProvider = {
        id:
            "lm-studio-eventbus-dogfood-observer",

        async generate(
            request
        ) {
            const userMessage =
                request.messages.find(
                    message =>
                        message.role ===
                        "user"
                );


            if (
                !userMessage ||
                typeof userMessage.content !==
                    "string"
            ) {
                throw new Error(
                    "Dogfood coding request must contain a string user prompt"
                );
            }


            const prompt =
                JSON.parse(
                    userMessage.content
                );


            const files =
                Array.isArray(
                    prompt.repositoryFiles
                )
                    ? prompt.repositoryFiles
                    : [];


            const contextPaths =
                files.map(
                    file =>
                        file.path
                );


            if (
                !contextPaths.includes(
                    target
                )
            ) {
                throw new Error(
                    "Qwen context does not contain EventBus.ts"
                );
            }


            if (
                !contextPaths.includes(
                    "packages/runtime/package.json"
                )
            ) {
                throw new Error(
                    "Qwen context does not contain runtime package metadata"
                );
            }


            if (
                !contextPaths.includes(
                    "packages/runtime/src/index.ts"
                )
            ) {
                throw new Error(
                    "Qwen context does not contain runtime package entrypoint"
                );
            }


            const hasReverseImporter =
                [
                    "packages/runtime/src/GameContext.ts",
                    "packages/runtime/src/create-game-context.ts",
                    "packages/runtime/src/score/ScoreService.ts"
                ].some(
                    path =>
                        contextPaths.includes(
                            path
                        )
                );


            if (!hasReverseImporter) {
                throw new Error(
                    "Qwen context does not contain a real EventBus reverse importer"
                );
            }


            contextObserved =
                true;


            console.log(
                `\nQwen context for attempt ${prompt.attempt}:`
            );

            console.log(
                JSON.stringify(
                    contextPaths,
                    null,
                    2
                )
            );


            if (
                prompt.attempt >
                    1
            ) {
                console.log(
                    "Repair attempt received previous deterministic verifier feedback"
                );
            }


            return provider.generate(
                request
            );
        }
    };


    const contextDiscovery =
        new GitRepositoryContextDiscovery({
            maxSelectedFiles:
                10,

            maxInventoryEntries:
                500
        });


    const harness =
        new AICodingHarness({
            provider:
                observedProvider,

            model,

            temperature:
                0.1,

            maxTokens:
                4096,

            contextDiscovery,

            maxContextFileBytes:
                64_000,

            maxContextBytes:
                192_000
        });


    const worker =
        new IsolatedHarnessCodingWorker({
            repositoryRoot:
                dogfoodRepositoryRoot,

            harness
        });


    const verifier =
        new DeterministicCommandVerifier({
            commands: [
                {
                    command:
                        "dogfood:eventbus:typescript",

                    executable:
                        process.execPath,

                    args: [
                        verifierPath,
                        "typescript"
                    ],

                    timeoutMs:
                        30_000
                },

                {
                    command:
                        "dogfood:eventbus:runtime",

                    executable:
                        process.execPath,

                    args: [
                        verifierPath,
                        "runtime"
                    ],

                    timeoutMs:
                        30_000
                }
            ],

            defaultTimeoutMs:
                30_000,

            maxOutputBytes:
                100_000
        });


    const contract = {
        id:
            "dogfood-eventbus-stable-dispatch",

        objective:
            "Make EventBus dispatch each event against a stable snapshot of listeners",

        rationale:
            [
                "The current implementation iterates a live Set.",
                "Subscription mutations during a handler therefore change the event already being dispatched.",
                "Event dispatch should be deterministic for the listeners that existed when emit() started."
            ].join(
                " "
            ),

        scope: {
            allowedPaths: [
                target
            ],

            forbiddenPaths:
                []
        },

        contextScope: {
            allowedPaths: [
                "packages/runtime/**"
            ],

            forbiddenPaths: [
                "packages/runtime/dist/**",
                "packages/runtime/node_modules/**"
            ]
        },

        changes: [
            {
                description:
                    [
                        "Modify only packages/runtime/src/events/EventBus.ts.",
                        "Preserve the existing public EventBus API.",
                        "When emit() begins, dispatch to a stable snapshot of the handlers that exist at that moment.",
                        "Removing a handler during dispatch must not prevent that handler from receiving the current event if it was present when emit() began.",
                        "Adding a handler during dispatch must not make that new handler receive the current event.",
                        "Subscription mutations must affect later emit() calls.",
                        "Keep the implementation minimal."
                    ].join(
                        " "
                    ),

                filesHint: [
                    target
                ]
            }
        ],

        acceptanceCriteria: [
            "EventBus.ts remains valid strict TypeScript",
            "all listeners present when emit starts receive the current event exactly once",
            "listeners added during emit do not receive the current event",
            "subscription changes apply to later emits",
            "no file other than EventBus.ts is modified"
        ],

        verification: [
            {
                id:
                    "typescript",

                command:
                    "dogfood:eventbus:typescript",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "dogfood:eventbus:runtime",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Do not change the EventBus public API",
            "Do not add dependencies",
            "Do not modify any other file",
            "Prefer the smallest correct implementation"
        ],

        maxLocalAttempts:
            2,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                0
        }
    };


    let plannerCalls =
        0;


    const planner = {
        async plan(
            input
        ) {
            plannerCalls +=
                1;


            if (
                input.run.currentIteration ===
                0
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
                    "Real EventBus dogfood iteration passed deterministic verification"
            };
        }
    };


    const failureAdvisor = {
        async advise(
            context
        ) {
            return {
                type:
                    "abort",

                reason:
                    [
                        "EventBus dogfood verification failed after local repair budget.",
                        ...context.verification
                            .checks
                            .filter(
                                check =>
                                    !check.passed
                            )
                            .map(
                                check =>
                                    `${check.id}: ${check.stderr ?? "failed"}`
                            )
                    ].join(
                        " "
                    )
            };
        }
    };


    const runStore =
        new FileRunStore({
            directory:
                join(
                    dogfoodRepositoryRoot,
                    ".game-factory",
                    "autonomy",
                    "runs"
                )
        });


    const engine =
        new AutonomyEngine({
            planner,
            worker,
            verifier,
            failureAdvisor,
            runStore,

            checkpointManager:
                new GitCheckpointManager({
                    repositoryRoot:
                        dogfoodRepositoryRoot
                })
        });


    const run =
        createAutonomousRun({
            id:
                `eventbus-dogfood-${randomUUID()}`,

            goal:
                "Fix stable EventBus dispatch semantics in the real game-factory repository",

            maxIterations:
                1
        });


    console.log(
        "\nRunning REAL game-factory autonomous dogfood..."
    );

    console.log(
        `Provider URL: ${baseUrl}`
    );

    console.log(
        `Model: ${model}`
    );


    const result =
        await engine.run(
            run
        );


    console.log(
        "\nRun result:"
    );

    console.log(
        JSON.stringify(
            {
                status:
                    result.status,

                currentIteration:
                    result.currentIteration,

                completionReason:
                    result.completionReason,

                failureReason:
                    result.failureReason,

                iterations:
                    result.iterations.map(
                        iteration => ({
                            id:
                                iteration.contract.id,

                            completed:
                                iteration.completed,

                            attempts:
                                iteration.attempts.length,

                            acceptance:
                                iteration.acceptance
                        })
                    )
            },
            null,
            2
        )
    );


    if (
        result.status !==
        "completed"
    ) {
        throw new Error(
            `Dogfood run did not complete: ${result.status}: ${result.failureReason ?? "unknown"}`
        );
    }


    if (!contextObserved) {
        throw new Error(
            "Real repository context was not observed by Qwen"
        );
    }


    if (
        result.currentIteration !==
            1 ||
        result.iterations.length !==
            1
    ) {
        throw new Error(
            "Dogfood run did not complete exactly one iteration"
        );
    }


    const iteration =
        result.iterations[0];


    if (
        !iteration ||
        !iteration.completed ||
        iteration.acceptance
            ?.status !==
            "accepted"
    ) {
        throw new Error(
            "Dogfood iteration was not accepted"
        );
    }


    if (
        iteration.acceptance
            .changedFiles.length !==
            1 ||
        iteration.acceptance
            .changedFiles[0] !==
            target
    ) {
        throw new Error(
            `Unexpected accepted changes: ${JSON.stringify(iteration.acceptance.changedFiles)}`
        );
    }


    const acceptedAttempt =
        iteration.attempts.find(
            attempt =>
                attempt.attempt ===
                iteration.acceptance.attempt
        );


    if (
        !acceptedAttempt
            ?.verification
            ?.passed
    ) {
        throw new Error(
            "Accepted attempt does not contain passing verification"
        );
    }


    if (
        acceptedAttempt
            .verification
            .checks
            .some(
                check =>
                    !check.passed
            )
    ) {
        throw new Error(
            "Accepted attempt contains a failed verification check"
        );
    }


    const finalRevision =
        await getHead(
            dogfoodRepositoryRoot
        );


    if (
        finalRevision !==
        iteration.acceptance
            .acceptedRevision
    ) {
        throw new Error(
            "Dogfood HEAD does not match acceptedRevision"
        );
    }


    const commitCount =
        Number(
            (
                await runGitOutput(
                    dogfoodRepositoryRoot,
                    [
                        "rev-list",
                        "--count",
                        `${dogfoodInitialHead}..HEAD`
                    ]
                )
            ).trim()
        );


    if (
        commitCount !==
        1
    ) {
        throw new Error(
            `Expected exactly one dogfood commit, found ${commitCount}`
        );
    }


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "typescript"
    );


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "runtime"
    );


    const dogfoodStatus =
        await runGitOutput(
            dogfoodRepositoryRoot,
            [
                "status",
                "--porcelain",
                "--untracked-files=all"
            ]
        );


    if (
        dogfoodStatus !==
        ""
    ) {
        throw new Error(
            `Dogfood branch worktree is dirty after acceptance:\n${dogfoodStatus}`
        );
    }


    const sourceHeadAfter =
        await getHead(
            sourceRepositoryRoot
        );


    const sourceBranchAfter =
        (
            await runGitOutput(
                sourceRepositoryRoot,
                [
                    "branch",
                    "--show-current"
                ]
            )
        ).trim();


    if (
        sourceHeadAfter !==
        sourceHead
    ) {
        throw new Error(
            "Source working branch HEAD changed during dogfooding"
        );
    }


    if (
        sourceBranchAfter !==
        sourceBranch
    ) {
        throw new Error(
            "Source working branch changed during dogfooding"
        );
    }


    const worktreeList =
        await runGitOutput(
            sourceRepositoryRoot,
            [
                "worktree",
                "list",
                "--porcelain"
            ]
        );


    const leakedInnerWorktree =
        worktreeList
            .split(
                /\r?\n/
            )
            .filter(
                line =>
                    line.startsWith(
                        "worktree "
                    )
            )
            .map(
                line =>
                    line.slice(
                        "worktree ".length
                    )
            )
            .some(
                path =>
                    path.includes(
                        ".game-factory"
                    ) &&
                    path.includes(
                        "autonomy"
                    ) &&
                    path.includes(
                        "worktrees"
                    )
            );


    if (leakedInnerWorktree) {
        throw new Error(
            "Autonomy left an internal isolated worktree registered"
        );
    }


    const diff =
        await runGitOutput(
            dogfoodRepositoryRoot,
            [
                "diff",
                `${dogfoodInitialHead}..${finalRevision}`,
                "--",
                target
            ]
        );


    console.log(
        "\nAccepted real-repository diff:"
    );

    console.log(
        "========================================"
    );

    console.log(
        diff
    );

    console.log(
        "========================================"
    );


    console.log(
        `\nAccepted dogfood commit: ${finalRevision}`
    );

    console.log(
        `Dogfood branch: ${branchName}`
    );

    console.log(
        `Dogfood worktree preserved for review: ${dogfoodRepositoryRoot}`
    );


    console.log(
        "\nPASS baseline verifier was RED before Qwen"
    );

    console.log(
        "PASS Qwen received real game-factory repository context"
    );

    console.log(
        "PASS only EventBus.ts changed"
    );

    console.log(
        "PASS deterministic verifier accepted the real change"
    );

    console.log(
        "PASS exactly one verified commit was created"
    );

    console.log(
        "PASS internal isolated worktree was removed"
    );

    console.log(
        "PASS source feature branch HEAD remained unchanged"
    );


    console.log(
        "\nFULL REAL GAME-FACTORY DOGFOOD E2E PASSED"
    );


    console.log(
        "\nReview the preserved commit before integrating it."
    );
} catch (
    error
) {
    console.error(
        "\nREAL DOGFOOD E2E FAILED"
    );


    if (worktreeCreated) {
        console.error(
            `Dogfood worktree preserved for debugging: ${dogfoodRepositoryRoot}`
        );

        console.error(
            `Dogfood branch preserved: ${branchName}`
        );
    }


    throw error;
}


async function runFixtureVerifier(
    repository,
    mode
) {
    await execFileAsync(
        process.execPath,
        [
            verifierPath,
            mode
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


async function expectFixtureFailure(
    repository,
    mode
) {
    try {
        await runFixtureVerifier(
            repository,
            mode
        );
    } catch (
        error
    ) {
        return [
            String(
                error?.stdout ??
                ""
            ),

            String(
                error?.stderr ??
                ""
            ),

            error instanceof Error
                ? error.message
                : String(
                    error
                )
        ].join(
            "\n"
        );
    }


    throw new Error(
        `Expected verifier mode ${mode} to fail before autonomous repair`
    );
}


async function getHead(
    repository
) {
    return (
        await runGitOutput(
            repository,
            [
                "rev-parse",
                "HEAD"
            ]
        )
    ).trim();
}


async function runGit(
    repository,
    args
) {
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


async function runGitOutput(
    repository,
    args
) {
    const result =
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


    return String(
        result.stdout
    );
}