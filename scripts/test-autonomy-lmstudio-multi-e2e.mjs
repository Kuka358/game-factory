import {
    execFile
} from "node:child_process";

import {
    mkdtemp,
    mkdir,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    dirname,
    join
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


const scriptDirectory =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );

const verifierPath =
    join(
        scriptDirectory,
        "verify-autonomy-multi-fixture.mjs"
    );


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


const repositoryRoot =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-autonomy-multi-e2e-"
        )
    );


let succeeded =
    false;


try {
    await initializeRepository(
        repositoryRoot
    );


    const initialRevision =
        await getHead(
            repositoryRoot
        );


    const provider =
        new LMStudioProvider({
            baseUrl,
            timeoutMs
        });


    let firstPromptObserved =
        false;

    let secondPromptObserved =
        false;

    let secondSawAcceptedClamp =
        false;


    const observedProvider = {
        id:
            "lm-studio-multi-observer",

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
                    "Expected string coding prompt"
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


            const math =
                files.find(
                    file =>
                        file.path ===
                        "src/math.ts"
                );


            if (
                prompt.iteration?.id ===
                "multi-add-clamp"
            ) {
                firstPromptObserved =
                    true;

                if (
                    math?.content.includes(
                        "export function clamp"
                    )
                ) {
                    throw new Error(
                        "Iteration 1 unexpectedly started with clamp already present"
                    );
                }
            }


            if (
                prompt.iteration?.id ===
                "multi-add-normalize"
            ) {
                secondPromptObserved =
                    true;

                if (
                    !math ||
                    !math.content.includes(
                        "export function clamp"
                    )
                ) {
                    throw new Error(
                        "Iteration 2 did not receive the accepted clamp implementation from iteration 1"
                    );
                }

                secondSawAcceptedClamp =
                    true;

                console.log(
                    "\nPASS iteration 2 context contains accepted iteration 1 code"
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
                6,

            maxInventoryEntries:
                30
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
                32_000,

            maxContextBytes:
                96_000
        });


    const worker =
        new IsolatedHarnessCodingWorker({
            repositoryRoot,

            harness
        });


    const verifier =
        new DeterministicCommandVerifier({
            commands: [
                command(
                    "verify:multi:math:typescript",
                    "math",
                    "typescript"
                ),

                command(
                    "verify:multi:math:runtime",
                    "math",
                    "runtime"
                ),

                command(
                    "verify:multi:normalize:typescript",
                    "normalize",
                    "typescript"
                ),

                command(
                    "verify:multi:normalize:runtime",
                    "normalize",
                    "runtime"
                )
            ],

            defaultTimeoutMs:
                30_000,

            maxOutputBytes:
                100_000
        });


    const firstContract = {
        id:
            "multi-add-clamp",

        objective:
            "Add a reusable clamp function to src/math.ts",

        rationale:
            "The first verified commit establishes functionality required by the next iteration.",

        scope: {
            allowedPaths: [
                "src/math.ts"
            ],

            forbiddenPaths:
                []
        },

        contextScope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    [
                        "Preserve the existing add function.",
                        "Add exported clamp(value, min, max).",
                        "Return min below the lower bound.",
                        "Return max above the upper bound.",
                        "Otherwise return value.",
                        "Modify only src/math.ts."
                    ].join(
                        " "
                    ),

                filesHint: [
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "add still works",
            "clamp is exported",
            "clamp enforces lower and upper bounds"
        ],

        verification: [
            {
                id:
                    "typescript",

                command:
                    "verify:multi:math:typescript",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "verify:multi:math:runtime",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Do not add dependencies",
            "Keep the implementation minimal"
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


    const secondContract = {
        id:
            "multi-add-normalize",

        objective:
            "Create src/normalize.ts using the clamp function accepted in the previous iteration",

        rationale:
            "Prove that a later autonomous iteration can depend on an earlier verified commit.",

        scope: {
            allowedPaths: [
                "src/normalize.ts"
            ],

            forbiddenPaths:
                []
        },

        contextScope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    [
                        "Create src/normalize.ts.",
                        'Import clamp from "./math.js".',
                        "Export normalizeClamped(value, min, max).",
                        "Use clamp to bound value first.",
                        "Return the bounded value normalized to the 0..1 range.",
                        "Do not modify src/math.ts.",
                        "Modify only src/normalize.ts."
                    ].join(
                        " "
                    ),

                filesHint: [
                    "src/normalize.ts",
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "normalize.ts is valid TypeScript",
            "normalizeClamped is exported",
            "normalizeClamped uses the existing clamp implementation",
            "values below min normalize to 0",
            "values above max normalize to 1",
            "midpoint normalizes to 0.5"
        ],

        verification: [
            {
                id:
                    "typescript",

                command:
                    "verify:multi:normalize:typescript",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "verify:multi:normalize:runtime",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Do not duplicate clamp logic",
            "Do not modify src/math.ts",
            "Do not add dependencies"
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


    const planner = {
        async plan(
            input
        ) {
            if (
                input.run.currentIteration ===
                0
            ) {
                return {
                    type:
                        "iteration",

                    contract:
                        firstContract
                };
            }


            if (
                input.run.currentIteration ===
                1
            ) {
                return {
                    type:
                        "iteration",

                    contract:
                        secondContract
                };
            }


            return {
                type:
                    "complete",

                reason:
                    "Both dependent coding iterations passed deterministic verification"
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
                        `Verification failed for ${context.contract.id}.`,
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
                    repositoryRoot,
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
                    repositoryRoot
                })
        });


    const run =
        createAutonomousRun({
            id:
                "live-qwen-multi-e2e",

            goal:
                "Build dependent math functionality across two autonomous verified coding iterations",

            maxIterations:
                2
        });


    console.log(
        "Running live multi-iteration autonomous Qwen E2E..."
    );

    console.log(
        `Provider URL: ${baseUrl}`
    );

    console.log(
        `Model: ${model}`
    );

    console.log(
        `Temporary Git repository: ${repositoryRoot}`
    );

    console.log(
        `Initial HEAD: ${initialRevision}`
    );


    const result =
        await engine.run(
            run
        );


    if (
        result.status !==
        "completed"
    ) {
        throw new Error(
            `Run failed: ${result.status}: ${result.failureReason ?? "unknown reason"}`
        );
    }


    if (
        result.currentIteration !==
        2 ||
        result.iterations.length !==
        2
    ) {
        throw new Error(
            "Expected exactly two completed autonomous iterations"
        );
    }


    if (
        !firstPromptObserved ||
        !secondPromptObserved ||
        !secondSawAcceptedClamp
    ) {
        throw new Error(
            "Expected both live Qwen iterations to observe their repository context"
        );
    }


    const first =
        result.iterations[0];

    const second =
        result.iterations[1];


    assertAccepted(
        first,
        firstContract.id
    );

    assertAccepted(
        second,
        secondContract.id
    );


    const firstRevision =
        first.acceptance
            .acceptedRevision;

    const secondRevision =
        second.acceptance
            .acceptedRevision;


    if (
        first.acceptance
            .baseRevision !==
        initialRevision
    ) {
        throw new Error(
            "Iteration 1 did not start from the initial repository revision"
        );
    }


    if (
        second.acceptance
            .baseRevision !==
        firstRevision
    ) {
        throw new Error(
            "Iteration 2 did not start from the accepted iteration 1 revision"
        );
    }


    const finalRevision =
        await getHead(
            repositoryRoot
        );


    if (
        finalRevision !==
        secondRevision
    ) {
        throw new Error(
            "Final HEAD does not match iteration 2 acceptedRevision"
        );
    }


    const commitCount =
        Number(
            (
                await runGitOutput(
                    repositoryRoot,
                    [
                        "rev-list",
                        "--count",
                        `${initialRevision}..HEAD`
                    ]
                )
            ).trim()
        );


    if (
        commitCount !==
        2
    ) {
        throw new Error(
            `Expected exactly 2 autonomous commits, found ${commitCount}`
        );
    }


    const secondParent =
        (
            await runGitOutput(
                repositoryRoot,
                [
                    "rev-parse",
                    `${secondRevision}^`
                ]
            )
        ).trim();


    if (
        secondParent !==
        firstRevision
    ) {
        throw new Error(
            "Iteration 2 commit is not a child of iteration 1 commit"
        );
    }


    const firstParent =
        (
            await runGitOutput(
                repositoryRoot,
                [
                    "rev-parse",
                    `${firstRevision}^`
                ]
            )
        ).trim();


    if (
        firstParent !==
        initialRevision
    ) {
        throw new Error(
            "Iteration 1 commit is not a child of the initial revision"
        );
    }


    const firstMath =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                `${firstRevision}:src/math.ts`
            ]
        );


    if (
        !firstMath.includes(
            "export function clamp"
        )
    ) {
        throw new Error(
            "Iteration 1 accepted commit does not contain clamp"
        );
    }


    const finalNormalize =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                "HEAD:src/normalize.ts"
            ]
        );


    console.log(
        "\nFinal src/normalize.ts:"
    );

    console.log(
        "----------------------------------------"
    );

    console.log(
        finalNormalize
    );

    console.log(
        "----------------------------------------"
    );


    await runFixtureVerifier(
        repositoryRoot,
        "normalize",
        "typescript"
    );

    await runFixtureVerifier(
        repositoryRoot,
        "normalize",
        "runtime"
    );


    const protectedFile =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                "HEAD:do-not-touch.txt"
            ]
        );


    if (
        protectedFile !==
        "protected\n"
    ) {
        throw new Error(
            "Protected file changed"
        );
    }


    const status =
        await runGitOutput(
            repositoryRoot,
            [
                "status",
                "--porcelain",
                "--untracked-files=all"
            ]
        );


    if (
        status !==
        ""
    ) {
        throw new Error(
            `Main worktree is dirty:\n${status}`
        );
    }


    const worktrees =
        (
            await runGitOutput(
                repositoryRoot,
                [
                    "worktree",
                    "list",
                    "--porcelain"
                ]
            )
        )
            .split(
                /\r?\n/
            )
            .filter(
                line =>
                    line.startsWith(
                        "worktree "
                    )
            );


    if (
        worktrees.length !==
        1
    ) {
        throw new Error(
            `Expected only main worktree, found ${worktrees.length}`
        );
    }


    const persisted =
        await runStore.load(
            run.id
        );


    if (
        !persisted ||
        persisted.status !==
            "completed" ||
        persisted.currentIteration !==
            2
    ) {
        throw new Error(
            "Completed multi-iteration run was not persisted correctly"
        );
    }


    console.log(
        `\nIteration 1 commit: ${firstRevision}`
    );

    console.log(
        `Iteration 2 commit: ${secondRevision}`
    );

    console.log(
        "PASS iteration 2 started from iteration 1 accepted commit"
    );

    console.log(
        "PASS dependent repository context reached Qwen"
    );

    console.log(
        "PASS exactly two verified commits were created"
    );

    console.log(
        "PASS final dependent functionality passed deterministic verification"
    );

    console.log(
        "PASS protected file remained unchanged"
    );

    console.log(
        "PASS isolated worktrees were removed"
    );

    console.log(
        "PASS multi-iteration run state was persisted"
    );


    succeeded =
        true;


    console.log(
        "\nFULL LIVE MULTI-ITERATION QWEN E2E PASSED"
    );
} finally {
    if (succeeded) {
        await rm(
            repositoryRoot,
            {
                recursive:
                    true,

                force:
                    true
            }
        );
    } else {
        console.error(
            `\nE2E repository preserved for debugging: ${repositoryRoot}`
        );
    }
}


function command(
    commandName,
    stage,
    mode
) {
    return {
        command:
            commandName,

        executable:
            process.execPath,

        args: [
            verifierPath,
            stage,
            mode
        ],

        timeoutMs:
            30_000
    };
}


function assertAccepted(
    iteration,
    expectedId
) {
    if (
        !iteration ||
        iteration.contract.id !==
            expectedId ||
        !iteration.completed ||
        iteration.acceptance
            ?.status !==
            "accepted" ||
        !iteration.acceptance
            .acceptedRevision
    ) {
        throw new Error(
            `Iteration was not accepted correctly: ${expectedId}`
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
            `Accepted iteration does not have passing verification: ${expectedId}`
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
            `Accepted iteration contains a failed verification check: ${expectedId}`
        );
    }
}


async function initializeRepository(
    repository
) {
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
            "autonomy-multi-e2e@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Multi E2E"
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
            "math.ts"
        ),
        [
            "export function add(",
            "    left: number,",
            "    right: number",
            "): number {",
            "    return left + right;",
            "}",
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "src",
            "helper.ts"
        ),
        [
            "/** Keep math helpers small and explicit. */",
            'export const convention = "small-explicit-functions";',
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "do-not-touch.txt"
        ),
        "protected\n",
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
}


async function runFixtureVerifier(
    repository,
    stage,
    mode
) {
    await execFileAsync(
        process.execPath,
        [
            verifierPath,
            stage,
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