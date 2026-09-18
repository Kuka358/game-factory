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

import vm from "node:vm";
import ts from "typescript";

import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AICodingHarness,
    AutonomyEngine,
    FileRunStore,
    GitCheckpointManager,
    IsolatedHarnessCodingWorker,
    createAutonomousRun
} from "../packages/autonomy/dist/index.js";


const execFileAsync =
    promisify(
        execFile
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


    const harness =
        new AICodingHarness({
            provider,

            model,

            temperature:
                0.1,

            maxTokens:
                4096
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
            allowedPaths: [
                "src/math.ts"
            ],

            forbiddenPaths:
                []
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
                        "Do not modify any other file."
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
                    "deterministic TypeScript compiler verification",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "sandboxed runtime assertions",

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
            1,

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


    const verifier = {
        async verify(
            input
        ) {
            const workspaceRoot =
                input.workspace
                    ?.root;

            if (!workspaceRoot) {
                throw new Error(
                    "Live verifier requires an isolated workspace"
                );
            }

            return verifyMathModule(
                workspaceRoot
            );
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