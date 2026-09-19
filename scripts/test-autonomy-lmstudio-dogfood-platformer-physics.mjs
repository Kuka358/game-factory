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


            const requiredArchitectureContext = [
                "packages/runtime/package.json",
                "packages/runtime/src/index.ts",
                "packages/engine-phaser/package.json",
                "packages/engine-phaser/src/physics.ts"
            ];


            for (
                const path of
                requiredArchitectureContext
            ) {
                if (
                    !contextPaths.includes(
                        path
                    )
                ) {
                    throw new Error(
                        `Qwen repository intelligence context is missing: ${path}`
                    );
                }
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
                                edit.path
                        })
                    ),
                    null,
                    2
                )
            );


            const hazardEdit =
                edits.find(
                    edit =>
                        edit.path ===
                        "packages/engine-phaser/src/templates/platformer/hazard-clearance.ts" &&
                        edit.operation ===
                        "write"
                );


            if (
                hazardEdit &&
                typeof hazardEdit.content ===
                    "string"
            ) {
                const relevantLines =
                    hazardEdit.content
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


            const runtimeRegression =
                failedChecks.some(
                    check =>
                        check.id ===
                            "runtime" &&
                        (
                            check.stderr ??
                            check.stdout ??
                            ""
                        ).includes(
                            "narrow-speed hazard clearance changed"
                        )
                );


            if (runtimeRegression) {
                return {
                    type:
                        "repair",

                    instructions: [
                        [
                            "The deterministic runtime verifier proves that hazard-clearance behaviour changed.",
                            "Expected hazardHeightAboveSurface({ jump_force: 560, move_speed: 100 }) to remain 12.",
                            "The current result is incorrect."
                        ].join(
                            " "
                        ),

                        [
                            "In hazard-clearance.ts, the ONLY intended semantic change is replacing the theoretical idealRise formula",
                            "`force ** 2 / (2 * ARCADE_GRAVITY_Y)`",
                            "with `calculateArcadeJumpHeight(force)`."
                        ].join(
                            " "
                        ),

                        [
                            "Restore and preserve the remaining hazard-clearance equations exactly:",
                            "`const effectiveForce = force - ARCADE_GRAVITY_Y / (2 * ARCADE_PHYSICS_FPS);`",
                            "`const crossingTime = (PLATFORMER_BODIES.hazard.width + PLATFORMER_BODIES.player.width) / speed + 2 / ARCADE_PHYSICS_FPS;`",
                            "`const permittedExposure = Math.floor(effectiveForce ** 2 / (2 * ARCADE_GRAVITY_Y) - ARCADE_GRAVITY_Y * crossingTime ** 2 / 8);`"
                        ].join(
                            " "
                        ),

                        [
                            "Do not simplify, reorder, approximate, or replace those formulas.",
                            "Do not change body dimensions, FPS handling, exposure calculation, flooring, or return logic."
                        ].join(
                            " "
                        ),

                        "Keep all previously correct shared-helper refactor work."
                    ]
                };
            }


            return {
                type:
                    "abort",

                reason:
                    [
                        "Platformer physics dogfood failed after local repair budget.",

                        ...failedChecks.map(
                            check =>
                                `${check.id}: ${check.stderr ?? check.stdout ?? "failed"}`
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