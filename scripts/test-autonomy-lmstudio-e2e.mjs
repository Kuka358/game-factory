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
    dirname,
    join
} from "node:path";

import {
    promisify
} from "node:util";

import {
    fileURLToPath
} from "node:url";

import vm from "node:vm";
import ts from "typescript";

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

const fixtureVerifierPath =
    join(
        scriptDirectory,
        "verify-autonomy-math-fixture.mjs"
    );

const repairMode =
    process.argv.includes(
        "--repair"
    );

const unknownArguments =
    process.argv
        .slice(
            2
        )
        .filter(
            argument =>
                argument !==
                "--repair"
        );

if (
    unknownArguments.length >
    0
) {
    throw new Error(
        `Unknown arguments: ${unknownArguments.join(", ")}`
    );
}

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
        process.env
            .LM_STUDIO_TIMEOUT_MS ??
        "180000"
    );

if (
    !Number.isFinite(
        timeoutMs
    ) ||
    timeoutMs <= 0
) {
    throw new Error(
        "LM_STUDIO_TIMEOUT_MS must be a positive number"
    );
}


const repositoryRoot =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-autonomy-live-e2e-"
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

    let contextObserved =
        false;

    let repairPromptObserved =
        false;

    let injectedFaults =
        0;

    let failureAdvisorCalls =
        0;


    const observedProvider = {
        id:
            "lm-studio-context-observer",

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
                    "Live context E2E expected a string user prompt"
                );
            }


            const prompt =
                JSON.parse(
                    userMessage.content
                );


            const inventory =
                Array.isArray(
                    prompt.repositoryInventory
                )
                    ? prompt.repositoryInventory
                    : [];


            const repositoryFiles =
                Array.isArray(
                    prompt.repositoryFiles
                )
                    ? prompt.repositoryFiles
                    : [];


            const contextPaths =
                repositoryFiles.map(
                    file =>
                        file.path
                );


            if (
                !inventory.includes(
                    "src/math.ts"
                )
            ) {
                throw new Error(
                    "Repository inventory does not contain src/math.ts"
                );
            }


            if (
                !inventory.includes(
                    "src/math.test.ts"
                )
            ) {
                throw new Error(
                    "Repository inventory does not contain src/math.test.ts"
                );
            }


            if (
                !inventory.includes(
                    "src/helper.ts"
                )
            ) {
                throw new Error(
                    "Repository inventory does not contain src/helper.ts"
                );
            }


            if (
                !contextPaths.includes(
                    "src/math.ts"
                )
            ) {
                throw new Error(
                    "Model context does not contain src/math.ts"
                );
            }


            if (
                !contextPaths.includes(
                    "src/math.test.ts"
                )
            ) {
                throw new Error(
                    "Model context does not contain read-only src/math.test.ts"
                );
            }


            if (
                !contextPaths.includes(
                    "src/helper.ts"
                )
            ) {
                throw new Error(
                    "Model context does not contain read-only src/helper.ts"
                );
            }


            if (
                inventory.includes(
                    "src/.env.production"
                ) ||
                contextPaths.includes(
                    "src/.env.production"
                )
            ) {
                throw new Error(
                    "Sensitive tracked .env file leaked into model context"
                );
            }


            if (
                inventory.includes(
                    "src/secrets/key.ts"
                ) ||
                contextPaths.includes(
                    "src/secrets/key.ts"
                )
            ) {
                throw new Error(
                    "Forbidden secret path leaked into model context"
                );
            }


            contextObserved =
                true;


            console.log(
                "\nRepository context supplied to Qwen:"
            );


            console.log(
                JSON.stringify(
                    {
                        inventory,

                        repositoryFiles:
                            contextPaths
                    },
                    null,
                    2
                )
            );


            if (
                repairMode &&
                prompt.attempt ===
                    1 &&
                prompt.previousVerification !==
                    null
            ) {
                throw new Error(
                    "First repair E2E attempt unexpectedly contains previousVerification"
                );
            }


            if (
                repairMode &&
                prompt.attempt ===
                    2
            ) {
                const previousVerification =
                    prompt.previousVerification;


                if (
                    !previousVerification ||
                    previousVerification.passed !==
                        false
                ) {
                    throw new Error(
                        "Repair attempt did not receive failed previousVerification"
                    );
                }


                const failedRuntime =
                    previousVerification
                        .checks
                        ?.find(
                            check =>
                                check.id ===
                                    "runtime" &&
                                check.passed ===
                                    false
                        );


                if (!failedRuntime) {
                    throw new Error(
                        "Repair attempt did not receive the failed runtime verifier result"
                    );
                }


                if (
                    !String(
                        failedRuntime.stderr ??
                        ""
                    ).includes(
                        "__GAME_FACTORY_REPAIR_FAULT__"
                    )
                ) {
                    throw new Error(
                        "Repair attempt did not receive useful runtime diagnostics"
                    );
                }


                const mathFile =
                    repositoryFiles.find(
                        file =>
                            file.path ===
                            "src/math.ts"
                    );


                if (
                    !mathFile ||
                    typeof mathFile.content !==
                        "string" ||
                    !mathFile.content.includes(
                        "__GAME_FACTORY_REPAIR_FAULT__"
                    )
                ) {
                    throw new Error(
                        "Repair attempt did not receive the failed workspace contents"
                    );
                }


                if (
                    !Array.isArray(
                        prompt.repairInstructions
                    ) ||
                    prompt.repairInstructions
                        .length !==
                        0
                ) {
                    throw new Error(
                        "Local repair unexpectedly received escalation repair instructions"
                    );
                }


                repairPromptObserved =
                    true;


                console.log(
                    "\nPASS repair prompt contains previous verifier failure and failed worktree state"
                );
            }


            const response =
                await provider.generate(
                    request
                );


            const edits =
                Array.isArray(
                    response.data
                        ?.edits
                )
                    ? response.data.edits
                    : [];


            console.log(
                `\nQwen surgical edits for attempt ${prompt.attempt}:`
            );


            console.log(
                JSON.stringify(
                    edits.map(
                        edit => ({
                            operation:
                                edit.operation,

                            path:
                                edit.path,

                            oldTextLength:
                                typeof edit.oldText ===
                                    "string"
                                    ? edit.oldText.length
                                    : null,

                            newTextLength:
                                typeof edit.newText ===
                                    "string"
                                    ? edit.newText.length
                                    : null,

                            anchorLength:
                                typeof edit.anchor ===
                                    "string"
                                    ? edit.anchor.length
                                    : null,

                            contentLength:
                                typeof edit.content ===
                                    "string"
                                    ? edit.content.length
                                    : null
                        })
                    ),
                    null,
                    2
                )
            );


            if (
                repairMode &&
                prompt.attempt ===
                    1
            ) {
                injectedFaults +=
                    1;


                console.log(
                    "\nInjecting deterministic logical fault after initial Qwen response..."
                );


                /*
                * Append a second surgical replacement after Qwen's
                * real edits.
                *
                * src/math.ts starts with this stable add() implementation
                * and the task explicitly requires preserving it.
                *
                * Breaking add() gives us a deterministic runtime RED
                * without replacing the complete file and without making
                * TypeScript invalid.
                */
                return {
                    ...response,

                    data: {
                        summary:
                            `${response.data.summary} [deterministic repair fault injected]`,

                        edits: [
                            ...edits,

                            {
                                operation:
                                    "replace",

                                path:
                                    "src/math.ts",

                                content:
                                    "",

                                oldText:
                                    "    return left + right;",

                                newText:
                                    [
                                        "    /* __GAME_FACTORY_REPAIR_FAULT__ */",
                                        '    throw new Error("__GAME_FACTORY_REPAIR_FAULT__");'
                                    ].join(
                                        "\n"
                                    ),

                                anchor:
                                    ""
                            }
                        ]
                    }
                };
            }


            return response;
        }
    };

    const contextDiscovery =
        new GitRepositoryContextDiscovery({
            maxSelectedFiles:
                4,

            maxInventoryEntries:
                20
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


    const checkpointManager =
        new GitCheckpointManager({
            repositoryRoot
        });


    const contract = {
        id:
            "live-qwen-clamp",

        objective:
            "Add a clamp function to the existing TypeScript math module",

        rationale:
            [
                "Exercise the complete autonomous coding pipeline.",
                "The change must be produced by the local coding model,",
                "verified deterministically, and committed only after verification passes."
            ].join(
                " "
            ),

        scope: {
            /*
            * Qwen may WRITE only this file.
            */
            allowedPaths: [
                "src/math.ts"
            ],

            forbiddenPaths:
                []
        },

        contextScope: {
            /*
            * Qwen may READ related source files, but this does not
            * grant permission to modify them.
            */
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths: [
                "src/secrets/**"
            ]
        },

        changes: [
            {
                description:
                    [
                        "Preserve the existing exported add function.",
                        "Add an exported function named clamp.",
                        "The clamp function accepts value, min and max as numbers.",
                        "Return min when value is below min.",
                        "Return max when value is above max.",
                        "Otherwise return value.",
                        "Read the supplied related repository files for existing expectations and conventions.",
                        "Do not modify read-only context files.",
                        "Do not modify any file other than src/math.ts."
                    ].join(
                        " "
                    ),

                filesHint: [
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "src/math.ts remains valid TypeScript",
            "add(2, 3) returns 5",
            "clamp(5, 0, 10) returns 5",
            "clamp(-2, 0, 10) returns 0",
            "clamp(42, 0, 10) returns 10"
        ],

        verification: [
            {
                id:
                    "typescript",

                command:
                    "verify:typescript",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "verify:runtime",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Do not add dependencies",
            "Do not modify files other than src/math.ts",
            "Keep the implementation minimal"
        ],

        maxLocalAttempts:
            repairMode
                ? 2
                : 1,

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
                input.run
                    .currentIteration ===
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
                    "The requested coding iteration passed deterministic verification"
            };
        }
    };


    const verifier =
        new DeterministicCommandVerifier({
            commands: [
                {
                    command:
                        "verify:typescript",

                    executable:
                        process.execPath,

                    args: [
                        fixtureVerifierPath,
                        "typescript"
                    ],

                    timeoutMs:
                        30_000
                },

                {
                    command:
                        "verify:runtime",

                    executable:
                        process.execPath,

                    args: [
                        fixtureVerifierPath,
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


    const failureAdvisor = {
        async advise(
            context
        ) {
            return {
                type:
                    "abort",

                reason:
                    [
                        "Live Qwen E2E verification failed.",
                        ...context.verification
                            .checks
                            .filter(
                                check =>
                                    !check.passed
                            )
                            .map(
                                check =>
                                    `${check.id}: ${check.stderr ?? "verification failed"}`
                            )
                    ].join(
                        " "
                    )
            };
        }
    };


    const engine =
        new AutonomyEngine({
            planner,
            worker,
            verifier,
            failureAdvisor,
            runStore,
            checkpointManager
        });


    const run =
        createAutonomousRun({
            id:
                "live-qwen-autonomy-e2e",

            goal:
                "Have local Qwen implement and verify clamp() through the autonomous Git pipeline",

            maxIterations:
                1
        });


    console.log(
        "Running full live autonomous Qwen E2E..."
    );

    console.log(
        `Provider URL: ${baseUrl}`
    );

    console.log(
        `Model: ${model}`
    );

    console.log(
        `Mode: ${repairMode ? "deterministic repair" : "normal"}`
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
            `Autonomy run did not complete: ${result.status}: ${result.failureReason ?? "unknown reason"}`
        );
    }

    if (!contextObserved) {
        throw new Error(
            "Live Qwen request was sent without observed repository context"
        );
    }

    if (
        result.currentIteration !==
        1
    ) {
        throw new Error(
            `Expected exactly one completed iteration, got ${result.currentIteration}`
        );
    }

    if (
        result.iterations.length !==
        1
    ) {
        throw new Error(
            `Expected one iteration record, got ${result.iterations.length}`
        );
    }


    const iteration =
        result.iterations[0];

    if (
        !iteration?.completed
    ) {
        throw new Error(
            "Iteration was not marked completed"
        );
    }

    if (repairMode) {
        if (
            iteration.attempts
                .length !==
            2
        ) {
            throw new Error(
                `Repair E2E expected exactly 2 attempts, got ${iteration.attempts.length}`
            );
        }


        const firstAttempt =
            iteration.attempts[0];

        const secondAttempt =
            iteration.attempts[1];


        if (
            firstAttempt
                ?.verification
                ?.passed !==
            false
        ) {
            throw new Error(
                "Repair E2E first attempt unexpectedly passed verification"
            );
        }


        const firstRuntime =
            firstAttempt
                .verification
                .checks
                .find(
                    check =>
                        check.id ===
                        "runtime"
                );

        if (
            !firstRuntime ||
            firstRuntime.passed !==
                false
        ) {
            throw new Error(
                "Repair E2E first attempt did not fail runtime verification"
            );
        }


        if (
            secondAttempt
                ?.verification
                ?.passed !==
            true
        ) {
            throw new Error(
                "Repair E2E second attempt did not pass verification"
            );
        }


        if (!repairPromptObserved) {
            throw new Error(
                "Second Qwen attempt did not observe repair context"
            );
        }


        if (
            injectedFaults !==
            1
        ) {
            throw new Error(
                `Expected exactly one injected fault, got ${injectedFaults}`
            );
        }


        if (
            failureAdvisorCalls !==
            0
        ) {
            throw new Error(
                `Local repair unexpectedly escalated to FailureAdvisor ${failureAdvisorCalls} time(s)`
            );
        }


        if (
            iteration.acceptance
                ?.attempt !==
            2
        ) {
            throw new Error(
                `Expected acceptance from attempt 2, got ${iteration.acceptance?.attempt ?? "<missing>"}`
            );
        }


        console.log(
            "PASS attempt 1 failed deterministic verification"
        );

        console.log(
            "PASS attempt 2 received verifier diagnostics"
        );

        console.log(
            "PASS Qwen repaired the existing isolated worktree"
        );

        console.log(
            "PASS repair completed without escalation"
        );

        console.log(
            "PASS only repaired attempt 2 was accepted"
        );
    } else {
        if (
            iteration.attempts
                .length !==
            1
        ) {
            throw new Error(
                `Normal live E2E expected exactly 1 attempt, got ${iteration.attempts.length}`
            );
        }
    }

    const acceptedAttemptNumber =
        iteration.acceptance
            ?.attempt;

    if (!acceptedAttemptNumber) {
        throw new Error(
            "Accepted iteration does not identify the accepted attempt"
        );
    }


    const acceptedAttempt =
        iteration.attempts.find(
            attempt =>
                attempt.attempt ===
                acceptedAttemptNumber
        );

    if (!acceptedAttempt) {
        throw new Error(
            `Accepted attempt ${acceptedAttemptNumber} was not persisted`
        );
    }


    const engineVerification =
        acceptedAttempt.verification;

    if (
        !engineVerification ||
        !engineVerification.passed
    ) {
        throw new Error(
            `Accepted attempt ${acceptedAttemptNumber} does not contain a passing command verification report`
        );
    }

    if (
        engineVerification
            .checks
            .length !==
        2
    ) {
        throw new Error(
            `Expected 2 command verification checks, got ${engineVerification.checks.length}`
        );
    }


    for (
        const check of
        engineVerification.checks
    ) {
        if (
            !check.passed
        ) {
            throw new Error(
                `Command verification failed: ${check.id}`
            );
        }

        if (
            check.exitCode !==
            0
        ) {
            throw new Error(
                `Command verifier returned unexpected exit code for ${check.id}: ${check.exitCode}`
            );
        }

        console.log(
            `PASS command-verifier:${check.id} exit=${check.exitCode} duration=${check.durationMs ?? 0}ms`
        );
    }

    if (
        iteration.acceptance
            ?.status !==
        "accepted"
    ) {
        throw new Error(
            "Iteration acceptance was not persisted as accepted"
        );
    }


    const acceptedRevision =
        iteration.acceptance
            .acceptedRevision;

    if (!acceptedRevision) {
        throw new Error(
            "Accepted iteration has no acceptedRevision"
        );
    }


    const finalRevision =
        await getHead(
            repositoryRoot
        );

    if (
        finalRevision !==
        acceptedRevision
    ) {
        throw new Error(
            [
                "Repository HEAD does not match acceptedRevision.",
                `HEAD=${finalRevision}`,
                `acceptedRevision=${acceptedRevision}`
            ].join(
                " "
            )
        );
    }

    if (
        finalRevision ===
        initialRevision
    ) {
        throw new Error(
            "Autonomous acceptance did not advance repository HEAD"
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
        1
    ) {
        throw new Error(
            `Expected exactly one autonomous commit, found ${commitCount}`
        );
    }


    const generatedSource =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                "HEAD:src/math.ts"
            ]
        );


    console.log(
        "\nCommitted src/math.ts:"
    );

    console.log(
        "----------------------------------------"
    );

    console.log(
        generatedSource
    );

    console.log(
        "----------------------------------------"
    );


    const finalVerification =
        await verifyMathModule(
            repositoryRoot
        );

    if (
        !finalVerification.passed
    ) {
        throw new Error(
            [
                "Committed HEAD failed deterministic verification:",
                ...finalVerification
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
                "\n"
            )
        );
    }


    for (
        const check of
        finalVerification.checks
    ) {
        console.log(
            `PASS verifier:${check.id}`
        );
    }


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
            "Protected file changed in committed HEAD"
        );
    }

    const committedMathTest =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                "HEAD:src/math.test.ts"
            ]
        );

    const expectedMathTest =
        [
            'import { add, clamp } from "./math.js";',
            "",
            "// Expected public behaviour:",
            "// add(2, 3) === 5",
            "// clamp(5, 0, 10) === 5",
            "// clamp(-2, 0, 10) === 0",
            "// clamp(42, 0, 10) === 10",
            "",
            "void add;",
            "void clamp;",
            ""
        ].join(
            "\n"
        );

    if (
        committedMathTest !==
        expectedMathTest
    ) {
        throw new Error(
            "Read-only context file src/math.test.ts was modified"
        );
    }


    const committedHelper =
        await runGitOutput(
            repositoryRoot,
            [
                "show",
                "HEAD:src/helper.ts"
            ]
        );

    const expectedHelper =
        [
            "/**",
            " * Math modules in this repository prefer explicit",
            " * readable control flow over clever expressions.",
            " */",
            "export const mathConvention =",
            '    "prefer explicit readable control flow";',
            ""
        ].join(
            "\n"
        );

    if (
        committedHelper !==
        expectedHelper
    ) {
        throw new Error(
            "Read-only context file src/helper.ts was modified"
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
            `Main working tree is not clean:\n${status}`
        );
    }


    const worktreeOutput =
        await runGitOutput(
            repositoryRoot,
            [
                "worktree",
                "list",
                "--porcelain"
            ]
        );

    const registeredWorktrees =
        worktreeOutput
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
        registeredWorktrees.length !==
        1
    ) {
        throw new Error(
            `Expected only the main worktree after settlement, found ${registeredWorktrees.length}`
        );
    }


    const persisted =
        await runStore.load(
            run.id
        );

    if (!persisted) {
        throw new Error(
            "Autonomous run was not persisted"
        );
    }

    if (
        persisted.status !==
        "completed"
    ) {
        throw new Error(
            `Persisted run has unexpected status: ${persisted.status}`
        );
    }

    if (
        persisted.iterations[0]
            ?.acceptance
            ?.acceptedRevision !==
        finalRevision
    ) {
        throw new Error(
            "Persisted acceptedRevision does not match repository HEAD"
        );
    }


    const commitMessage =
        await runGitOutput(
            repositoryRoot,
            [
                "log",
                "-1",
                "--pretty=%B"
            ]
        );

    if (
        !commitMessage.includes(
            "Game-Factory-Accept:"
        )
    ) {
        throw new Error(
            "Verified commit is missing Game-Factory-Accept marker"
        );
    }

    if (
        !commitMessage.includes(
            "Game-Factory-Digest:"
        )
    ) {
        throw new Error(
            "Verified commit is missing Game-Factory-Digest marker"
        );
    }

    if (
        !commitMessage.includes(
            "Game-Factory-Base:"
        )
    ) {
        throw new Error(
            "Verified commit is missing Game-Factory-Base marker"
        );
    }


    console.log(
        `\nAccepted commit: ${finalRevision}`
    );

    console.log(
        "PASS repository HEAD advanced exactly once"
    );

    console.log(
        "PASS acceptedRevision matches HEAD"
    );

    console.log(
        "PASS protected file remained unchanged"
    );

    console.log(
        "PASS main working tree is clean"
    );

    console.log(
        "PASS isolated worktree was removed"
    );

    console.log(
        "PASS run state was persisted"
    );

    console.log(
        "PASS verified commit contains acceptance metadata"
    );


    succeeded =
        true;

    console.log(
        "\nFULL LIVE AUTONOMOUS QWEN E2E PASSED"
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
            "autonomy-e2e@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Autonomy E2E"
        ]
    );


    await mkdir(
        join(
            repository,
            "src",
            "secrets"
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
            "math.test.ts"
        ),
        [
            'import { add, clamp } from "./math.js";',
            "",
            "// Expected public behaviour:",
            "// add(2, 3) === 5",
            "// clamp(5, 0, 10) === 5",
            "// clamp(-2, 0, 10) === 0",
            "// clamp(42, 0, 10) === 10",
            "",
            "void add;",
            "void clamp;",
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
            "/**",
            " * Math modules in this repository prefer explicit",
            " * readable control flow over clever expressions.",
            " */",
            "export const mathConvention =",
            '    "prefer explicit readable control flow";',
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );


    /*
    * Intentionally TRACKED sensitive file.
    *
    * Repository context discovery must still exclude it.
    */
    await writeFile(
        join(
            repository,
            "src",
            ".env.production"
        ),
        "API_TOKEN=must-never-reach-model\n",
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "src",
            "secrets",
            "key.ts"
        ),
        'export const secret = "must-never-reach-model";\n',
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


async function verifyMathModule(
    repository
) {
    const startedAt =
        Date.now();

    const sourcePath =
        join(
            repository,
            "src",
            "math.ts"
        );

    let source;

    try {
        source =
            await readFile(
                sourcePath,
                "utf8"
            );
    } catch (
        error
    ) {
        return {
            passed:
                false,

            checks: [
                {
                    id:
                        "typescript",

                    command:
                        "read src/math.ts",

                    passed:
                        false,

                    stderr:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),

                    durationMs:
                        Date.now() -
                        startedAt
                }
            ]
        };
    }


    const compilerOptions = {
        target:
            ts.ScriptTarget
                .ES2022,

        module:
            ts.ModuleKind
                .ES2022,

        moduleResolution:
            ts.ModuleResolutionKind
                .Bundler,

        strict:
            true,

        noEmit:
            true,

        skipLibCheck:
            true
    };


    const program =
        ts.createProgram({
            rootNames: [
                sourcePath
            ],

            options:
                compilerOptions
        });


    const diagnostics =
        ts.getPreEmitDiagnostics(
            program
        );


    const errors =
        diagnostics.filter(
            diagnostic =>
                diagnostic.category ===
                ts.DiagnosticCategory
                    .Error
        );


    if (
        errors.length >
        0
    ) {
        const stderr =
            errors
                .map(
                    diagnostic =>
                        formatDiagnostic(
                            diagnostic
                        )
                )
                .join(
                    "\n"
                );

        return {
            passed:
                false,

            checks: [
                {
                    id:
                        "typescript",

                    command:
                        "TypeScript compiler API",

                    passed:
                        false,

                    stderr,

                    durationMs:
                        Date.now() -
                        startedAt
                }
            ]
        };
    }


    const typecheckDuration =
        Date.now() -
        startedAt;


    const transpiled =
        ts.transpileModule(
            source,
            {
                fileName:
                    "math.ts",

                compilerOptions: {
                    target:
                        ts.ScriptTarget
                            .ES2022,

                    module:
                        ts.ModuleKind
                            .CommonJS,

                    strict:
                        true
                }
            }
        );


    const runtimeStartedAt =
        Date.now();


    try {
        /*
         * Run generated code in a minimal VM context.
         *
         * There is intentionally no require(), process, fetch,
         * filesystem API, or network API exposed to this context.
         */
        const sandbox = {
            exports:
                {}
        };

        const verificationProgram =
            [
                transpiled.outputText,
                "",
                'if (typeof exports.add !== "function") {',
                '    throw new Error("add export is missing");',
                "}",
                "",
                'if (typeof exports.clamp !== "function") {',
                '    throw new Error("clamp export is missing");',
                "}",
                "",
                "const checks = [",
                '    ["add(2, 3)", exports.add(2, 3), 5],',
                '    ["clamp(5, 0, 10)", exports.clamp(5, 0, 10), 5],',
                '    ["clamp(-2, 0, 10)", exports.clamp(-2, 0, 10), 0],',
                '    ["clamp(42, 0, 10)", exports.clamp(42, 0, 10), 10]',
                "];",
                "",
                "for (const [name, actual, expected] of checks) {",
                "    if (actual !== expected) {",
                "        throw new Error(`${name}: expected ${expected}, got ${actual}`);",
                "    }",
                "}"
            ].join(
                "\n"
            );


        vm.runInNewContext(
            verificationProgram,
            sandbox,
            {
                timeout:
                    1_000,

                displayErrors:
                    true
            }
        );


        return {
            passed:
                true,

            checks: [
                {
                    id:
                        "typescript",

                    command:
                        "TypeScript compiler API",

                    passed:
                        true,

                    durationMs:
                        typecheckDuration
                },

                {
                    id:
                        "runtime",

                    command:
                        "sandboxed runtime assertions",

                    passed:
                        true,

                    durationMs:
                        Date.now() -
                        runtimeStartedAt
                }
            ]
        };
    } catch (
        error
    ) {
        return {
            passed:
                false,

            checks: [
                {
                    id:
                        "typescript",

                    command:
                        "TypeScript compiler API",

                    passed:
                        true,

                    durationMs:
                        typecheckDuration
                },

                {
                    id:
                        "runtime",

                    command:
                        "sandboxed runtime assertions",

                    passed:
                        false,

                    stderr:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),

                    durationMs:
                        Date.now() -
                        runtimeStartedAt
                }
            ]
        };
    }
}


function formatDiagnostic(
    diagnostic
) {
    const message =
        ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
        );

    if (
        !diagnostic.file ||
        diagnostic.start ===
            undefined
    ) {
        return message;
    }

    const position =
        diagnostic.file
            .getLineAndCharacterOfPosition(
                diagnostic.start
            );

    return (
        `${diagnostic.file.fileName}:` +
        `${position.line + 1}:` +
        `${position.character + 1} ` +
        message
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