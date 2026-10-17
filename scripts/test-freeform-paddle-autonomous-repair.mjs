
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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

import {
    BehaviorAcceptanceVerifier,
    reconcileAcceptanceContract,
    validateExecutableBehaviorSpec,
    validateFreeformBlueprint,
    validateTaskGraph,
    validateAcceptanceTestPlan
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    blueprintPath,
    graphPath,
    draftPath,
    clarificationPath,
    contractPath,
    specPath,
    sourceRoot
] = process.argv.slice(2);

const paths = [
    blueprintPath,
    graphPath,
    draftPath,
    clarificationPath,
    contractPath,
    specPath,
    sourceRoot
];

if (paths.some(path => !path || !isAbsolute(path))) {
    throw new Error(
        "Usage: test-freeform-paddle-autonomous-repair.mjs " +
        "<blueprint> <graph> <draft> <clarification> " +
        "<contract> <spec> <game-root>"
    );
}

const model = process.env.LM_STUDIO_MODEL;

if (!model) {
    throw new Error("LM_STUDIO_MODEL is required");
}

const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";

const modelTimeout = Number(
    process.env.LM_STUDIO_TIMEOUT_MS ??
    "240000"
);

if (
    !Number.isSafeInteger(modelTimeout) ||
    modelTimeout <= 0
) {
    throw new Error("Invalid LM Studio timeout");
}

async function run(executable, args, cwd) {
    return execFileAsync(executable, args, {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024
    });
}

async function git(root, ...args) {
    const result = await run(
        "git",
        ["-C", root, ...args],
        root
    );

    return result.stdout.trimEnd();
}

async function json(path) {
    return JSON.parse(
        await readFile(path, "utf8")
    );
}

const source = resolve(sourceRoot);

const initialHead = await git(
    source,
    "rev-parse",
    "HEAD"
);

assert.equal(
    initialHead,
    "7445e16743aa66b5b9569f53b97260c9edcb5efb",
    "Unexpected Brick Breaker baseline"
);

assert.equal(
    await git(
        source,
        "status",
        "--porcelain=v1",
        "--untracked-files=all"
    ),
    "",
    "Original game must be clean"
);

const blueprintResult = validateFreeformBlueprint(
    await json(blueprintPath)
);

assert.equal(blueprintResult.valid, true);

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    await json(graphPath),
    blueprint.id
);

assert.equal(graphResult.valid, true);

const graph = graphResult.data;

const draftResult = validateAcceptanceTestPlan(
    await json(draftPath),
    graph,
    blueprint.id
);

assert.equal(draftResult.valid, true);

const draftPlan = draftResult.data;

assert.equal(draftPlan.taskId, "paddle");

const task = graph.tasks.find(
    item => item.id === "paddle"
);

assert.ok(task);

const spec = await json(specPath);

assert.equal(
    spec.sourcePath,
    "src/game/Paddle.ts"
);

assert.equal(
    spec.speed.sourcePath,
    "src/game/constants.ts"
);

assert.ok(
    task.readPaths.includes(
        spec.speed.sourcePath
    )
);

assert.ok(
    !task.allowedPaths.includes(
        spec.speed.sourcePath
    )
);

// Restore the original trusted reference context.
// The implementation itself is NOT a specification.
const constantsContent = await git(
    source,
    "show",
    `HEAD:${spec.speed.sourcePath}`
);

const referenceFiles = [{
    path: spec.speed.sourcePath,
    content: constantsContent + "\n"
}];

const savedContract = await json(contractPath);

const verifiedContract = reconcileAcceptanceContract({
    blueprint,
    graph,
    draftPlan,
    clarification: await json(clarificationPath),
    referenceFiles,
    expectedProfile: "continuous_motion",

    candidate: {
        schemaVersion: savedContract.schemaVersion,
        blueprintId: savedContract.blueprintId,
        taskId: savedContract.taskId,
        graphDigest: savedContract.graphDigest,
        referenceDigest: savedContract.referenceDigest,
        profile: savedContract.profile,
        timeModel: savedContract.timeModel,
        rules: savedContract.rules
    }
});

assert.deepEqual(
    savedContract,
    verifiedContract
);

const specValidation = validateExecutableBehaviorSpec(
    spec,
    task,
    verifiedContract
);

if (!specValidation.valid) {
    throw new Error(
        "Invalid repair specification: " +
        JSON.stringify(specValidation.errors)
    );
}

assert.equal(
    spec.kind,
    "horizontal_boolean_controller"
);

assert.equal(spec.className, "Paddle");
assert.equal(spec.update.deltaArgumentIndex, 1);
assert.equal(spec.speed.unit, "pixels_per_nominal_frame");
assert.equal(spec.speed.referenceFps, 60);

const scriptDirectory = dirname(
    fileURLToPath(import.meta.url)
);

const behaviorRunnerPath = join(
    scriptDirectory,
    "verification",
    "verify-horizontal-workspace.mjs"
);

const typescriptVerifierPath = join(
    scriptDirectory,
    "verification",
    "verify-horizontal-typescript.mjs"
);

// Use a completely separate Git clone.
// The original accepted game will not be promoted,
// reset, rebased, or committed by this experiment.
const experimentRoot = await mkdtemp(
    join(tmpdir(), "gf-paddle-repair-")
);

const repairRoot = join(
    experimentRoot,
    "game"
);

console.log("\nAUTONOMOUS PADDLE REPAIR");
console.log("Source HEAD:", initialHead);
console.log("Model:", model);
console.log("Experiment:", experimentRoot);

await run(
    "git",
    [
        "clone",
        "--no-hardlinks",
        "--",
        source,
        repairRoot
    ],
    source
);

assert.equal(
    await git(repairRoot, "rev-parse", "HEAD"),
    initialHead
);

// Local identity only for the temporary clone.
await git(
    repairRoot,
    "config",
    "user.name",
    "Game Factory"
);

await git(
    repairRoot,
    "config",
    "user.email",
    "game-factory@local.invalid"
);

const taskId = "paddle_semantic_repair";

// Expose the complete binding rules to Qwen.
// Do not ask the coding model to reinterpret them.
const bindingRules = verifiedContract.rules
    .filter(rule =>
        rule.classification === "binding"
    )
    .map(rule => rule.rule);

const behaviorDescription = [
    "Repair the existing Paddle implementation.",
    "Modify ONLY src/game/Paddle.ts.",
    "Preserve the exported Paddle class.",
    "Preserve existing constants and exports.",
    "Use update(input, deltaMs) with milliseconds.",
    "PADDLE.speed is pixels per nominal frame at 60 FPS.",
    "Convert speed to px/s before applying deltaMs.",
    "NUMERIC MOVEMENT ORACLE:",
    "PADDLE.speed = 7 pixels per nominal frame.",
    "Nominal frame rate = 60 FPS.",
    "Therefore speedPixelsPerSecond = 7 * 60 = 420.",
    "deltaMs is milliseconds, NOT seconds.",
    "Convert deltaMs into seconds EXACTLY ONCE.",
    "",
    "Correct displacement formula:",
    "direction * PADDLE.speed * 60 * (deltaMs / 1000)",
    "",
    "IMPORTANT: Never divide deltaMs by 1000 twice.",
    "Do not multiply or divide the speed by 1000 again.",
    "",
    "Expected behavior examples:",
    "Starting at x=400, right=true, deltaMs=100 -> x=442.",
    "Starting at x=400, left=true, deltaMs=100 -> x=358.",
    "Starting at x=442, left=true, deltaMs=100 -> x=400.",
    "Starting at x=400, right=true, deltaMs=100000 -> x=740.",
    "Starting at x=400, left=true, deltaMs=100000 -> x=60.",
    "",
    "SURGICAL EDIT REQUIREMENT:",
    "Use small, precise replacements of existing code blocks.",
    "Never replace the entire Paddle.ts file.",
    "Each oldText must be an exact, unique, small substring.",
    "Do not include almost the whole file in one replace operation.",
    "Use paddle.x and paddle.y as center coordinates.",
    "Clamping uses half the paddle width.",
    "Left and right together must cancel movement.",
    "No input means no movement.",
    "Direction reversal must be immediate.",
    "No accumulated horizontal acceleration.",
    "",
    "AUTHORITATIVE EXECUTABLE BEHAVIOR SPEC:",
    JSON.stringify(spec, null, 2),
    "",
    "BINDING ACCEPTANCE RULES:",
    ...bindingRules
].join("\n");

const iterationContract = {
    id: taskId,

    objective:
        "Repair Paddle horizontal motion to satisfy the " +
        "validated executable behavior specification",

    rationale:
        "The accepted Paddle has deterministic " +
        "behavioral failures despite compiling successfully.",

    scope: {
        allowedPaths: [
            spec.sourcePath
        ],
        forbiddenPaths: [
            "src/game/constants.ts",
            "package.json",
            "pnpm-lock.yaml",
            "tsconfig.json",
            ".env"
        ]
    },

    contextScope: {
        allowedPaths: [
            spec.sourcePath,
            spec.speed.sourcePath
        ],
        forbiddenPaths: []
    },

    changes: [{
        description: behaviorDescription,
        filesHint: [
            spec.sourcePath
        ]
    }],

    acceptanceCriteria: [
        "The existing Paddle class remains exported.",
        "All 13 horizontal behavior checks pass in Docker.",
        "Strict TypeScript verification passes.",
        "Only src/game/Paddle.ts may change.",
        ...bindingRules
    ],

    verification: [{
        id: "paddle-typescript",
        command: "verify:paddle:typescript",
        required: true
    }],

    architecturalConstraints: [
        "Do not modify any file except src/game/Paddle.ts.",
        "Do not change the trusted constants.",
        "Do not modify the test runner or tests.",
        "Do not install dependencies.",
        "Do not use per-render-call displacement.",
        "Treat the executable behavior specification as binding."
    ],

    maxLocalAttempts: 5,

    escalation: {
        onRepeatedFailure: true,
        onArchitectureConflict: true,
        maxRepairRounds: 0
    }
};

const provider = new LMStudioProvider({
    baseUrl,
    timeoutMs: modelTimeout
});

const harness = new AICodingHarness({
    provider,
    model,
    temperature: 0.1,
    maxTokens: 8192,

    contextDiscovery:
        new GitRepositoryContextDiscovery({
            maxSelectedFiles: 8,
            maxInventoryEntries: 100
        }),

    maxContextFileBytes: 64_000,
    maxContextBytes: 128_000
});

const worker = new IsolatedHarnessCodingWorker({
    repositoryRoot: repairRoot,
    harness
});

const technicalVerifier =
    new DeterministicCommandVerifier({
        commands: [{
            command: "verify:paddle:typescript",
            executable: process.execPath,
            args: [typescriptVerifierPath],
            timeoutMs: 45_000
        }],

        defaultTimeoutMs: 45_000,
        maxOutputBytes: 64_000
    });

const verifier = new BehaviorAcceptanceVerifier({
    technicalVerifier,
    runnerScriptPath: behaviorRunnerPath,
    requiredTaskIds: [taskId],

    bindings: {
        [taskId]: {
            specPath: resolve(specPath),
            viewportWidth: blueprint.viewport.width
        }
    },

    timeoutMs: 90_000
});

// This is a NEW autonomous repair run.
// It does not rewrite the original TaskGraph,
// or pretend the already accepted paddle task
// is unfinished.
const planner = {
    async plan(input) {
        if (
            input.context.progress.currentIteration === 0
        ) {
            return {
                type: "iteration",
                contract: iterationContract
            };
        }

        return {
            type: "complete",
            reason:
                "Paddle semantic repair passed all " +
                "mandatory verification checks"
        };
    }
};

const failureAdvisor = {
    async advise(context) {
        const failedChecks = context.verification.checks
            .filter(check => !check.passed)
            .map(check =>
                `${check.id}: ${check.stderr ?? "failed"}`
            );

        return {
            type: "abort",
            reason:
                "Paddle repair exhausted local attempts. " +
                failedChecks.join("\n")
        };
    }
};

const engine = new AutonomyEngine({
    planner,
    worker,
    verifier,
    failureAdvisor,

    runStore: new FileRunStore({
        directory: join(
            experimentRoot,
            "runs"
        )
    }),

    checkpointManager: new GitCheckpointManager({
        repositoryRoot: repairRoot,

        metadataDirectory: join(
            experimentRoot,
            "checkpoints"
        )
    })
});

const runId = `paddle-repair-${randomUUID()}`;

const autonomousRun = createAutonomousRun({
    id: runId,

    goal:
        "Repair accepted Brick Breaker Paddle using " +
        "trusted behavioral acceptance checks",

    maxIterations: 1
});

console.log("\nStarting Qwen autonomous repair...");
console.log("Run ID:", runId);

let result;

try {
    result = await engine.run(autonomousRun);
} finally {
    const finalSourceHead = await git(
        source,
        "rev-parse",
        "HEAD"
    );

    assert.equal(
        finalSourceHead,
        initialHead,
        "Original game HEAD must remain unchanged"
    );
}

console.log("\nAUTONOMOUS RUN RESULT");
console.log("Status:", result.status);
console.log(
    "Completed iterations:",
    result.currentIteration
);

if (result.failureReason) {
    console.log(
        "Failure reason:",
        result.failureReason
    );
}

for (const iteration of result.iterations) {
    console.log(
        "\nIteration:",
        iteration.contract.id
    );

    for (const attempt of iteration.attempts) {
        console.log(
            "Attempt:",
            attempt.attempt
        );

        if (attempt.error) {
            console.log(
                "Worker error:",
                attempt.error
            );
        }

        for (const check of
            attempt.verification?.checks ?? []) {
            console.log(
                check.passed ? "PASS" : "FAIL",
                check.id
            );

            if (!check.passed) {
                console.log(
                    (check.stderr ?? check.stdout ?? "")
                        .slice(0, 5000)
                );
            }
        }
    }
}

if (result.status !== "completed") {
    console.log(
        "\nRepair experiment retained at:",
        experimentRoot
    );

    process.exitCode = 1;
} else {
    const finalHead = await git(
        repairRoot,
        "rev-parse",
        "HEAD"
    );

    const iteration = result.iterations[0];

    assert.equal(
        iteration?.acceptance?.status,
        "accepted"
    );

    assert.equal(
        iteration.acceptance.acceptedRevision,
        finalHead
    );

    const verifiedAttempt = iteration.attempts.find(
        attempt =>
            attempt.attempt ===
            iteration.acceptance.attempt
    );

    assert.equal(
        verifiedAttempt?.verification?.passed,
        true
    );

    const behaviorCheck =
        verifiedAttempt.verification.checks.find(
            check =>
                check.command === "verify:behavior"
        );

    assert.equal(
        behaviorCheck?.passed,
        true
    );

    const changedFiles = (
        await git(
            repairRoot,
            "diff",
            "--name-only",
            `${initialHead}..${finalHead}`
        )
    ).split(/\r?\n/).filter(Boolean);

    assert.deepEqual(
        changedFiles,
        [spec.sourcePath]
    );

    assert.notEqual(
        finalHead,
        initialHead
    );

    console.log("\nREPAIR ACCEPTED");
    console.log("Original HEAD:", initialHead);
    console.log("Repaired HEAD:", finalHead);
    console.log("Changed files:", changedFiles);
    console.log(
        "Accepted in isolated clone:",
        repairRoot
    );

    console.log(
        "\nAUTONOMOUS PADDLE REPAIR E2E PASSED"
    );
}
