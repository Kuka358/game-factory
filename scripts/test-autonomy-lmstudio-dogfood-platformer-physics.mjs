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
        "verify-autonomy-platformer-physics-dogfood.mjs"
    );


const targets = [
    "packages/runtime/src/platformer-physics.ts",
    "packages/engine-phaser/src/templates/platformer/hazard-clearance.ts",
    "packages/engine-phaser/src/templates/platformer/PlatformerLevelGenerator.ts"
];

const baselineFixtureRevision =
    "dae2d9961d964b15a9cbfea60f1d84288de969ea";


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
            "game-factory-physics-dogfood-"
        )
    );


const dogfoodRepositoryRoot =
    join(
        temporaryRoot,
        "repository"
    );


const branchName =
    `autonomy-dogfood/physics-${randomUUID().slice(0, 8)}`;


let worktreeCreated =
    false;


try {
    console.log(
        "Preparing real multi-package game-factory dogfood worktree..."
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


    const worktreeSourceHead =
        await getHead(
            dogfoodRepositoryRoot
        );


    if (
        worktreeSourceHead !==
        sourceHead
    ) {
        throw new Error(
            "Dogfood worktree did not start from source HEAD"
        );
    }


    /*
    * This dogfood originally produced the shared jump-height
    * refactor itself. The production branch now already contains
    * that accepted refactor, so simply cloning current HEAD would
    * make the architecture baseline GREEN before Qwen runs.
    *
    * Keep the rest of the repository at current HEAD, but restore
    * only the three explicit dogfood targets to the historical
    * pre-refactor state. This makes the fixture repeatable while
    * still exercising the current autonomy implementation and
    * current repository context.
    */
    await runGit(
        dogfoodRepositoryRoot,
        [
            "restore",
            "--source",
            baselineFixtureRevision,
            "--",
            ...targets
        ]
    );


    await runGit(
        dogfoodRepositoryRoot,
        [
            "add",
            "--",
            ...targets
        ]
    );


    await runGit(
        dogfoodRepositoryRoot,
        [
            "commit",
            "-m",
            "test: seed platformer physics dogfood baseline"
        ]
    );


    const dogfoodInitialHead =
        await getHead(
            dogfoodRepositoryRoot
        );


    if (
        dogfoodInitialHead ===
        sourceHead
    ) {
        throw new Error(
            "Dogfood baseline fixture commit was not created"
        );
    }


    const baselineStatus =
        await runGitOutput(
            dogfoodRepositoryRoot,
            [
                "status",
                "--porcelain",
                "--untracked-files=all"
            ]
        );


    if (
        baselineStatus !==
        ""
    ) {
        throw new Error(
            `Dogfood baseline fixture is dirty:\n${baselineStatus}`
        );
    }


    console.log(
        `Seeded historical dogfood baseline: ${baselineFixtureRevision}`
    );


    console.log(
        `Dogfood baseline commit: ${dogfoodInitialHead}`
    );


    console.log(
        "\nChecking baseline before Qwen..."
    );


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "syntax"
    );


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "runtime"
    );


    const structureFailure =
        await expectFixtureFailure(
            dogfoodRepositoryRoot,
            "structure"
        );


    if (
        !structureFailure.includes(
            "must export calculateArcadeJumpHeight()"
        )
    ) {
        throw new Error(
            [
                "Architecture verifier failed for an unexpected reason.",
                structureFailure
            ].join(
                "\n"
            )
        );
    }


    console.log(
        "PASS baseline syntax is GREEN"
    );

    console.log(
        "PASS baseline runtime behaviour is GREEN"
    );

    console.log(
        "PASS baseline architecture is RED for missing shared jump-height helper"
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
            "lm-studio-platformer-physics-dogfood-observer",

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


            for (
                const target of
                targets
            ) {
                if (
                    !contextPaths.includes(
                        target
                    )
                ) {
                    throw new Error(
                        `Qwen context does not contain required target: ${target}`
                    );
                }
            }


            const initialArchitectureContext = [
                "packages/runtime/package.json",
                "packages/runtime/src/index.ts",
                "packages/engine-phaser/package.json",
                "packages/engine-phaser/src/physics.ts"
            ];


            /*
            * Repository-intelligence coverage is asserted on the initial
            * coding request.
            *
            * Repair requests may contain verifier diagnostics and repair
            * instructions that legitimately consume more of the model
            * context budget. Optional architectural context is therefore
            * allowed to be trimmed on later attempts.
            *
            * The three production targets above remain mandatory on every
            * attempt.
            */
            if (
                prompt.attempt ===
                1
            ) {
                for (
                    const path of
                    initialArchitectureContext
                ) {
                    if (
                        !contextPaths.includes(
                            path
                        )
                    ) {
                        throw new Error(
                            `Qwen initial repository intelligence context is missing: ${path}`
                        );
                    }
                }


                contextObserved =
                    true;
            } else {
                const omittedArchitectureContext =
                    initialArchitectureContext.filter(
                        path =>
                            !contextPaths.includes(
                                path
                            )
                    );


                if (
                    omittedArchitectureContext.length >
                    0
                ) {
                    console.log(
                        "Repair context omitted optional repository-intelligence files:"
                    );

                    console.log(
                        JSON.stringify(
                            omittedArchitectureContext,
                            null,
                            2
                        )
                    );
                }
            }


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
                prompt.previousVerification
            ) {
                console.log(
                    "Repair attempt received previous deterministic verifier feedback"
                );
            } else if (
                Array.isArray(
                    prompt.repairInstructions
                ) &&
                prompt.repairInstructions.length >
                    0
            ) {
                console.log(
                    "Repair attempt received previous surgical patch feedback"
                );
            }


            const response =
                await provider.generate(
                    request
                );


            console.log(
                `\nQwen summary for attempt ${prompt.attempt}:`
            );

            console.log(
                response.data
                    ?.summary ??
                    "<missing summary>"
            );


            const edits =
                Array.isArray(
                    response.data
                        ?.edits
                )
                    ? response.data.edits
                    : [];


            console.log(
                "Qwen edit paths:"
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


            const hazardEdits =
                edits.filter(
                    edit =>
                        edit.path ===
                        "packages/engine-phaser/src/templates/platformer/hazard-clearance.ts"
                );


            if (
                hazardEdits.length >
                0
            ) {
                const relevantText =
                    hazardEdits
                        .flatMap(
                            edit => {
                                const parts = [];


                                if (
                                    typeof edit.oldText ===
                                        "string"
                                ) {
                                    parts.push(
                                        edit.oldText
                                    );
                                }


                                if (
                                    typeof edit.newText ===
                                        "string"
                                ) {
                                    parts.push(
                                        edit.newText
                                    );
                                }


                                if (
                                    typeof edit.anchor ===
                                        "string"
                                ) {
                                    parts.push(
                                        edit.anchor
                                    );
                                }


                                if (
                                    typeof edit.content ===
                                        "string"
                                ) {
                                    parts.push(
                                        edit.content
                                    );
                                }


                                return parts;
                            }
                        )
                        .join(
                            "\n"
                        );


                const relevantLines =
                    relevantText
                        .split(
                            /\r?\n/
                        )
                        .filter(
                            line =>
                                [
                                    "calculateArcadeJumpHeight",
                                    "idealRise",
                                    "effectiveForce",
                                    "crossingTime",
                                    "permittedExposure"
                                ].some(
                                    token =>
                                        line.includes(
                                            token
                                        )
                                )
                        );


                console.log(
                    "Qwen hazard math:"
                );


                console.log(
                    relevantLines.join(
                        "\n"
                    )
                );
            }


            return response;
        }
    };


    const contextDiscovery =
        new GitRepositoryContextDiscovery({
            maxSelectedFiles:
                18,

            /*
            * Inventory is only a path overview.
            * The coding model does not need hundreds of unrelated
            * repository paths for this tightly-scoped refactor.
            */
            maxInventoryEntries:
                80
        });


    const harness =
        new AICodingHarness({
            provider:
                observedProvider,

            model,

            temperature:
                0.1,

            /*
             * The coding harness returns complete final file contents.
             * PlatformerLevelGenerator.ts is substantially larger than
             * the first EventBus dogfood target.
             */
            maxTokens:
                8_192,

            contextDiscovery,

            maxContextFileBytes:
                64_000,

            /*
            * All three write targets are always considered first because
            * they are explicit filesHint entries.
            *
            * Keep enough room for those files plus small architectural
            * context, but skip large secondary files such as
            * PlatformerScene.ts.
            */
            maxContextBytes:
                40_000
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
                        "dogfood:physics:syntax",

                    executable:
                        process.execPath,

                    args: [
                        verifierPath,
                        "syntax"
                    ],

                    timeoutMs:
                        30_000
                },

                {
                    command:
                        "dogfood:physics:structure",

                    executable:
                        process.execPath,

                    args: [
                        verifierPath,
                        "structure"
                    ],

                    timeoutMs:
                        30_000
                },

                {
                    command:
                        "dogfood:physics:runtime",

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
            "dogfood-platformer-shared-jump-height",

        objective:
            "Centralize theoretical Arcade jump-height calculation in the shared runtime physics module without changing gameplay behaviour",

        rationale:
            [
                "The theoretical jump-height formula is duplicated across platformer production code.",
                "packages/runtime/src/platformer-physics.ts already owns shared platformer physics constants.",
                "The shared calculation should have one deterministic implementation used across workspace packages."
            ].join(
                " "
            ),

        scope: {
            allowedPaths:
                targets,

            forbiddenPaths:
                []
        },

        contextScope: {
            allowedPaths: [
                "packages/runtime/**",
                "packages/engine-phaser/**",
                "packages/game-spec/**"
            ],

            forbiddenPaths: [
                "packages/**/dist/**",
                "packages/**/node_modules/**"
            ]
        },

        changes: [
            {
                description:
                    [
                        "Modify exactly the three hinted production files.",
                        "",
                        "In packages/runtime/src/platformer-physics.ts export a function declaration named calculateArcadeJumpHeight.",
                        "Its input is jumpForce: number and it returns the theoretical Arcade jump height using the existing ARCADE_GRAVITY_Y constant:",
                        "jumpForce * jumpForce / (2 * ARCADE_GRAVITY_Y).",
                        "",
                        "In packages/engine-phaser/src/templates/platformer/hazard-clearance.ts import calculateArcadeJumpHeight from @game-factory/runtime and use it for the existing idealRise calculation.",
                        "Preserve every other hazard-clearance calculation and numeric behaviour.",
                        "",
                        "In packages/engine-phaser/src/templates/platformer/PlatformerLevelGenerator.ts import calculateArcadeJumpHeight from @game-factory/runtime.",
                        "Keep calculateMaximumSafeRise as a function declaration.",
                        "Use calculateArcadeJumpHeight inside calculateMaximumSafeRise instead of duplicating the theoretical jump-height formula.",
                        "Preserve the existing 0.65 safety factor, flooring and all other level generation behaviour.",
                        "",
                        "Do not perform unrelated formatting or refactors."
                    ].join(
                        "\n"
                    ),

                filesHint:
                    targets
            }
        ],

        acceptanceCriteria: [
            "platformer-physics.ts exports calculateArcadeJumpHeight as a function declaration",
            "hazard-clearance.ts uses the shared helper",
            "PlatformerLevelGenerator.ts uses the shared helper",
            "existing theoretical jump-height numeric behaviour is unchanged",
            "existing hazard clearance numeric behaviour is unchanged",
            "existing calculateMaximumSafeRise numeric behaviour is unchanged",
            "no production file outside the three-file write scope is modified"
        ],

        verification: [
            {
                id:
                    "syntax",

                command:
                    "dogfood:physics:syntax",

                required:
                    true
            },

            {
                id:
                    "structure",

                command:
                    "dogfood:physics:structure",

                required:
                    true
            },

            {
                id:
                    "runtime",

                command:
                    "dogfood:physics:runtime",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "ARCADE_GRAVITY_Y remains owned by @game-factory/runtime",
            "calculateArcadeJumpHeight must be exported by @game-factory/runtime",
            "Do not remove or rename existing public constants",
            "Do not change JUMP_REACH_SAFETY",
            "Do not change the 0.65 maximum-rise safety factor",
            "Do not change hazard collision dimensions or entity heights",
            "Do not add dependencies",
            "Do not modify files outside the explicit write scope",
            "Prefer the smallest correct refactor"
        ],

        maxLocalAttempts:
            4,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                1
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

                    contract
                };
            }


            return {
                type:
                    "complete",

                reason:
                    "Real multi-package platformer physics refactor passed deterministic verification"
            };
        }
    };

    async function printFailedWorkspaceDiff(
        context
    ) {
        const iteration =
            context.run
                .iterations
                .at(
                    -1
                );


        const workspaceRoot =
            iteration
                ?.workspace
                ?.root;


        if (!workspaceRoot) {
            console.log(
                `\nNo active workspace available for failed attempt ${context.attempts}`
            );

            return;
        }


        const diff =
            await runGitOutput(
                workspaceRoot,
                [
                    "diff",
                    "--",
                    ...targets
                ]
            );


        console.log(
            `\nFAILED ATTEMPT ${context.attempts} WORKSPACE DIFF:`
        );

        console.log(
            "========================================"
        );

        console.log(
            diff || "<no diff>"
        );

        console.log(
            "========================================"
        );


        console.log(
            "\nFailed verifier checks:"
        );


        for (
            const check of
            context.verification
                .checks
                .filter(
                    check =>
                        !check.passed
                )
        ) {
            console.log(
                [
                    `${check.id}:`,
                    check.stderr ??
                        check.stdout ??
                        "failed"
                ].join(
                    "\n"
                )
            );
        }
    }


    const failureAdvisor = {
        async advise(
            context
        ) {
            await printFailedWorkspaceDiff(
                context
            );


            const failedChecks =
                context.verification
                    .checks
                    .filter(
                        check =>
                            !check.passed
                    );


            if (
                failedChecks.length ===
                0
            ) {
                return {
                    type:
                        "abort",

                    reason:
                        "Failure advisor was invoked without failed verifier checks"
                };
            }


            const diagnostics =
                failedChecks.map(
                    check =>
                        summarizeVerifierFailure(
                            check
                        )
                );


            /*
            * The deterministic verifier is the source of truth.
            *
            * Do not hard-code a growing list of individual failure
            * messages here. Any verifier failure after the local repair
            * budget gets one bounded escalation repair attempt.
            *
            * The engine still enforces maxRepairRounds, so this cannot
            * turn into an unlimited retry loop.
            */
            return {
                type:
                    "repair",

                instructions: [
                    [
                        "The deterministic verifier rejected the current isolated worktree.",
                        "Treat the verifier diagnostics below as authoritative."
                    ].join(
                        " "
                    ),

                    ...diagnostics,

                    [
                        "Re-read the current repositoryFiles before editing.",
                        "They contain the accumulated state of all previous attempts.",
                        "Do not rely on your earlier summaries or earlier edit anchors."
                    ].join(
                        " "
                    ),

                    [
                        "Repair ALL currently failed verifier checks in one minimal surgical batch.",
                        "Do not repeat edits whose desired final state is already present."
                    ].join(
                        " "
                    ),

                    [
                        "The intended shared helper is:",
                        "`calculateArcadeJumpHeight(jumpForce)` from `@game-factory/runtime`."
                    ].join(
                        " "
                    ),

                    [
                        "packages/runtime/src/platformer-physics.ts must export calculateArcadeJumpHeight.",
                        "Its result must remain `jumpForce * jumpForce / (2 * ARCADE_GRAVITY_Y)`."
                    ].join(
                        " "
                    ),

                    [
                        "In hazard-clearance.ts, only the theoretical ideal rise should use the shared helper:",
                        "`const idealRise = calculateArcadeJumpHeight(force);`"
                    ].join(
                        " "
                    ),

                    [
                        "Preserve the hazard effectiveForce, crossingTime and permittedExposure behaviour.",
                        "In particular, permittedExposure must keep the original effectiveForce formula and must not be rewritten to calculateArcadeJumpHeight(effectiveForce)."
                    ].join(
                        " "
                    ),

                    [
                        "PlatformerLevelGenerator.ts must import calculateArcadeJumpHeight from @game-factory/runtime exactly once and use it in calculateMaximumSafeRise()."
                    ].join(
                        " "
                    ),

                    [
                        "calculateMaximumSafeRise() must use:",
                        "`const theoretical = calculateArcadeJumpHeight(jumpForce);`",
                        "and the existing 0.65 safety factor must be applied exactly once."
                    ].join(
                        " "
                    ),

                    [
                        "ARCADE_GRAVITY_Y must remain available in PlatformerLevelGenerator.ts because calculateMaximumSafeHorizontalGap() still uses it."
                    ].join(
                        " "
                    ),

                    [
                        "Do not rewrite unrelated code, formatting, comments or functions.",
                        "Make the smallest surgical repair necessary."
                    ].join(
                        " "
                    )
                ]
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
                `physics-dogfood-${randomUUID()}`,

            goal:
                "Refactor duplicated platformer jump-height physics into the shared runtime module",

            maxIterations:
                1
        });


    console.log(
        "\nRunning REAL multi-package game-factory dogfood..."
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


    assertSamePathSet(
        iteration.acceptance
            .changedFiles,
        targets,
        "Unexpected accepted production changes"
    );


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


    /*
     * Verify the accepted commit independently once more,
     * after the autonomy engine has completely settled it.
     */
    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "syntax"
    );


    await runFixtureVerifier(
        dogfoodRepositoryRoot,
        "structure"
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


    const registeredWorktreePaths =
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
            );


    const currentInternalWorktreeRoot =
        normalizeFilesystemPath(
            join(
                dogfoodRepositoryRoot,
                ".game-factory",
                "autonomy",
                "worktrees"
            )
        );


    const currentLeakedInnerWorktrees =
        registeredWorktreePaths.filter(
            path => {
                const normalized =
                    normalizeFilesystemPath(
                        path
                    );


                return (
                    normalized ===
                        currentInternalWorktreeRoot ||
                    normalized.startsWith(
                        `${currentInternalWorktreeRoot}/`
                    )
                );
            }
        );


    if (
        currentLeakedInnerWorktrees.length >
        0
    ) {
        throw new Error(
            [
                "Autonomy left an internal isolated worktree registered for the current dogfood run:",

                ...currentLeakedInnerWorktrees
            ].join(
                "\n"
            )
        );
    }


    /*
    * Historical failed/debug dogfood runs may deliberately still
    * exist. They must not make an unrelated successful run fail.
    *
    * Report them for cleanup without treating them as a leak from
    * this transaction.
    */
    const historicalInternalWorktrees =
        registeredWorktreePaths.filter(
            path => {
                const normalized =
                    normalizeFilesystemPath(
                        path
                    );


                return (
                    normalized.includes(
                        "/.game-factory/autonomy/worktrees/"
                    ) &&
                    !currentLeakedInnerWorktrees.includes(
                        path
                    )
                );
            }
        );


    if (
        historicalInternalWorktrees.length >
        0
    ) {
        console.log(
            "\nHistorical internal autonomy worktrees are still registered:"
        );

        console.log(
            JSON.stringify(
                historicalInternalWorktrees,
                null,
                2
            )
        );
    }


    const diff =
        await runGitOutput(
            dogfoodRepositoryRoot,
            [
                "diff",
                `${dogfoodInitialHead}..${finalRevision}`,
                "--",
                ...targets
            ]
        );


    console.log(
        "\nAccepted real multi-package diff:"
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
        "\nPASS baseline syntax was GREEN before Qwen"
    );

    console.log(
        "PASS baseline runtime behaviour was GREEN before Qwen"
    );

    console.log(
        "PASS baseline architecture was RED before Qwen"
    );

    console.log(
        "PASS Qwen received cross-package game-factory repository context"
    );

    console.log(
        "PASS exactly the three allowed production files changed"
    );

    console.log(
        "PASS architecture verifier accepted the shared runtime helper"
    );

    console.log(
        "PASS runtime behaviour remained unchanged"
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
        "\nFULL REAL MULTI-PACKAGE GAME-FACTORY DOGFOOD E2E PASSED"
    );


    console.log(
        "\nReview the preserved commit before integrating it."
    );
} catch (
    error
) {
    console.error(
        "\nREAL MULTI-PACKAGE DOGFOOD E2E FAILED"
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
        `Expected verifier mode ${mode} to fail before autonomous refactor`
    );
}


function assertSamePathSet(
    actual,
    expected,
    message
) {
    const actualSorted =
        [...actual]
            .sort();


    const expectedSorted =
        [...expected]
            .sort();


    const same =
        actualSorted.length ===
            expectedSorted.length &&
        actualSorted.every(
            (
                path,
                index
            ) =>
                path ===
                expectedSorted[index]
        );


    if (!same) {
        throw new Error(
            [
                message,
                `Expected: ${JSON.stringify(expectedSorted)}`,
                `Actual: ${JSON.stringify(actualSorted)}`
            ].join(
                "\n"
            )
        );
    }
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

function normalizeFilesystemPath(
    value
) {
    const normalized =
        resolve(
            value
        ).replaceAll(
            "\\",
            "/"
        );


    return process.platform ===
        "win32"
        ? normalized.toLowerCase()
        : normalized;
}

function summarizeVerifierFailure(
    check
) {
    const raw =
        String(
            check.stderr ??
            check.stdout ??
            "failed"
        ).trim();


    const lines =
        raw.split(
            /\r?\n/
        );


    const errorLine =
        lines.find(
            line =>
                line.trim()
                    .startsWith(
                        "Error:"
                    )
        );


    if (
        errorLine
    ) {
        return [
            `Verifier check "${check.id}" failed.`,
            errorLine.trim()
        ].join(
            " "
        );
    }


    const compact =
        raw.length >
            1_500
            ? `${raw.slice(
                0,
                1_500
            )}...`
            : raw;


    return [
        `Verifier check "${check.id}" failed.`,
        compact
    ].join(
        " "
    );
}