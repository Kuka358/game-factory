
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AICodingHarness,
    AutonomyEngine,
    DeterministicCommandVerifier,
    DockerExecutionSandbox,
    FileRunStore,
    GitRepositoryContextDiscovery,
    IsolatedHarnessCodingWorker,
    STRICT_VERIFICATION_EXECUTION_POLICY,
    createAutonomousRun
} from "../packages/autonomy/dist/index.js";

import {
    FreeformDependencyProvisioner,
    ProvisionedCodingWorker,
    TaskGraphAutonomyPlanner,
    TaskGraphProgressRecovery,
    validateFreeformBlueprint,
    validateTaskGraph
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    gameRoot,
    blueprintPath,
    graphPath,
    dockerExecutable
] = process.argv.slice(2);

if (
    [gameRoot, blueprintPath, graphPath, dockerExecutable]
        .some(path => !path || !isAbsolute(path))
) {
    throw new Error(
        "Usage: node scripts/test-freeform-qwen-next-task.mjs " +
        "<game-root> <blueprint.json> <executable-graph.json> <docker.exe>"
    );
}

const model = process.env.LM_STUDIO_MODEL;
const baseUrl = process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";

if (!model) {
    throw new Error("LM_STUDIO_MODEL is required");
}

async function git(...args) {
    const { stdout } = await execFileAsync("git", [
        ...(process.platform === "win32"
            ? ["-c", "core.longpaths=true"]
            : []),
        "-C",
        gameRoot,
        ...args
    ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000
    });

    return stdout.trim();
}

const status = await git(
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
);

assert.equal(status, "", "Game repository must be clean");

await access(join(gameRoot, "pnpm-lock.yaml"));

const blueprintResult = validateFreeformBlueprint(
    JSON.parse(await readFile(blueprintPath, "utf8"))
);

if (!blueprintResult.valid) {
    throw new Error(
        JSON.stringify(blueprintResult.errors)
    );
}

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    JSON.parse(await readFile(graphPath, "utf8")),
    blueprint.id
);

if (!graphResult.valid) {
    throw new Error(
        JSON.stringify(graphResult.errors)
    );
}

const graph = graphResult.data;

const recovery = new TaskGraphProgressRecovery({
    repositoryRoot: gameRoot,
    graph
});

const progress = await recovery.recover();

const initialHead = await git("rev-parse", "HEAD");

assert.equal(progress.head, initialHead);

const completedIds = new Set(
    progress.completedTasks.map(task => task.taskId)
);

assert.ok(
    completedIds.has("foundation"),
    "Foundation must have been accepted"
);

const remaining = graph.tasks.filter(
    task => !completedIds.has(task.id)
);

const graphPlanner = new TaskGraphAutonomyPlanner({
    blueprint,
    graph,

    // Only used to select a task from the full validated graph.
    // Actual executable commands are checked separately below.
    availableChecks: [
        ...new Set(graph.tasks.flatMap(task => task.checks))
    ],

    recoveredProgress: progress
});

const selection = await graphPlanner.plan({
    context: {
        run: {
            id: "next-task-selection",
            goal: `Continue ${blueprint.title}`
        },
        progress: {
            currentIteration: 0,
            maxIterations: remaining.length,
            remainingIterations: remaining.length,
            completedIterationCount: 0
        },
        completedIterations: [],
        omitted: {
            completedIterations: 0,
            changedFiles: 0
        }
    }
});

assert.equal(
    selection.type,
    "iteration",
    `Expected next iteration, got: ${selection.type}`
);

const contract = selection.contract;

const task = graph.tasks.find(
    item => item.id === contract.id
);

assert.ok(task);

// This experiment is deliberately restricted to Paddle.
// If the graph changes, stop instead of running another task.
assert.equal(
    task.id,
    "paddle",
    "Unexpected next task; refusing model execution"
);

assert.ok(
    task.dependsOn.every(id => completedIds.has(id))
);

assert.ok(
    task.checks.every(check =>
        ["tsc", "vite"].includes(check)
    ),
    "Selected task requires checks not implemented by this runner"
);

const executableChecks = new Set([
    "verify:tsc",
    "verify:vite"
]);

assert.ok(
    contract.verification.every(
        check => executableChecks.has(check.command)
    )
);

// The AutonomyEngine run has a budget of ONE iteration.
// The full-graph planner is used above for selection,
// then this wrapper permits exactly the selected contract.
const oneTaskPlanner = {
    async plan(input) {
        if (input.context.replan) {
            return {
                type: "blocked",
                reason: "Replanning disabled in this smoke test"
            };
        }

        const completed =
            input.context.completedIterations;

        if (completed.length === 0) {
            return {
                type: "iteration",
                contract
            };
        }

        if (
            completed.length === 1 &&
            completed[0].id === contract.id
        ) {
            return {
                type: "complete",
                reason: `One-task experiment completed: ${contract.id}`
            };
        }

        return {
            type: "blocked",
            reason: "Unexpected one-task execution state"
        };
    }
};

const image = "game-factory-freeform-verifier:pr2";

const provisioner = new FreeformDependencyProvisioner({
    dockerExecutable,
    image,
    storeVolume: "game-factory-freeform-pnpm-store"
});

const provider = new LMStudioProvider({
    baseUrl,
    timeoutMs: 180_000
});

const observedProvider = {
    id: provider.id,

    async generate(request) {
        console.log("\nQWEN CODING REQUEST");

        const response = await provider.generate(request);

        console.log(
            "Summary:",
            response.data?.summary ?? "<missing>"
        );

        console.log(
            "Proposed edits:",
            (response.data?.edits ?? []).map(edit => ({
                operation: edit.operation,
                path: edit.path
            }))
        );

        return response;
    }
};

const harness = new AICodingHarness({
    provider: observedProvider,
    model,
    allowFullRepairOfNewFiles: true,
    temperature: 0.1,
    maxTokens: 6144,
    contextDiscovery: new GitRepositoryContextDiscovery({
        maxSelectedFiles: 12,
        maxInventoryEntries: 200
    }),
    maxContextFileBytes: 64_000,
    maxContextBytes: 192_000
});

const worker = new ProvisionedCodingWorker({
    worker: new IsolatedHarnessCodingWorker({
        repositoryRoot: gameRoot,
        worktreesDirectory: join(
            gameRoot,
            ".game-factory",
            "wt"
        ),
        harness
    }),
    provisioner
});

const sandbox = new DockerExecutionSandbox({
    dockerExecutable,
    image,
    memoryMb: 2048,
    cpus: 2,
    executableMap: {
        [process.execPath]: "/usr/local/bin/node"
    }
});

const verifier = new DeterministicCommandVerifier({
    sandbox,
    defaultTimeoutMs: 120_000,
    maxOutputBytes: 200_000,
    commands: [
        {
            command: "verify:tsc",
            executable: process.execPath,
            args: [
                "node_modules/typescript/bin/tsc",
                "--noEmit"
            ],
            policy: STRICT_VERIFICATION_EXECUTION_POLICY
        },
        {
            command: "verify:vite",
            executable: process.execPath,
            args: [
                "node_modules/vite/bin/vite.js",
                "build"
            ],
            policy: STRICT_VERIFICATION_EXECUTION_POLICY
        }
    ]
});

const failureAdvisor = {
    async advise(context) {
        return {
            type: "abort",
            reason: [
                "Task verification failed after local attempts.",
                ...context.verification.checks
                    .filter(check => !check.passed)
                    .map(check =>
                        `${check.id}: ${check.stderr || check.stdout || "failed"}`
                    )
            ].join("\n")
        };
    }
};

const engine = new AutonomyEngine({
    planner: oneTaskPlanner,
    worker,
    verifier,
    failureAdvisor,
    runStore: new FileRunStore({
        directory: join(
            gameRoot,
            ".game-factory",
            "autonomy",
            "runs"
        )
    })
});

const run = createAutonomousRun({
    id: `freeform-${task.id}-${randomUUID()}`,

    goal: [
        `Continue the existing ${blueprint.title} game.`,
        `Task: ${task.title}`,
        `Objective: ${task.objective}`,
        "Acceptance criteria:",
        ...task.acceptance.map(item => `- ${item}`),
        "Interface requirements:",
        ...task.interfaces.map(item => `- ${item}`),
        "Use the existing src/game/constants.ts values.",
        "Preserve the existing game architecture.",
        "Implement only this task.",
        "For an absent Paddle.ts use operation=create.",
        "Do not modify other source files.",
        "Use frame-rate-independent movement.",
        "PADDLE.speed=7 is currently ambiguous; if treated",
        "as pixels per nominal 60 Hz frame, convert it to",
        "pixels per second for Phaser velocity.",
        "Do not modify constants.ts.",
        "Return only valid surgical JSON edits."
    ].join("\n"),

    maxIterations: 1
});

console.log("\nFREEFORM QWEN CONTINUATION E2E");
console.log("Game:", blueprint.title);
console.log("Model:", model);
console.log("Provider:", baseUrl);
console.log("Previous HEAD:", initialHead);
console.log("Recovered:", [...completedIds]);
console.log("Selected task:", task.id);
console.log("Allowed writes:", contract.scope.allowedPaths);
console.log("Read paths:", contract.contextScope?.allowedPaths);
console.log("Checks:", contract.verification.map(x => x.command));
console.log("Maximum attempts:", contract.maxLocalAttempts);

const result = await engine.run(run);

console.log("\nAUTONOMY RESULT");
console.log("Status:", result.status);
console.log("Completed iterations:", result.currentIteration);
console.log("Failure:", result.failureReason ?? "<none>");

for (const iteration of result.iterations) {
    console.log("Task:", iteration.contract.id);
    console.log("Completed:", iteration.completed);
    console.log("Attempts:", iteration.attempts.length);

    for (const attempt of iteration.attempts) {
        console.log("Attempt:", attempt.attempt);

        if (attempt.error) {
            console.log("Harness error:", attempt.error);
        }

        for (const check of attempt.verification?.checks ?? []) {
            console.log(
                `${check.passed ? "PASS" : "FAIL"} ${check.id}`
            );

            if (!check.passed) {
                console.error(check.stderr);
                console.error(check.stdout);
            }
        }
    }
}

if (result.status !== "completed") {
    throw new Error(
        `One-task run failed: ${result.failureReason ?? result.status}`
    );
}

assert.equal(result.currentIteration, 1);

const acceptance = result.iterations[0]?.acceptance;

assert.equal(acceptance?.status, "accepted");

assert.ok(
    acceptance.changedFiles.length > 0,
    "No files were changed"
);

assert.deepEqual(
    acceptance.changedFiles,
    ["src/game/Paddle.ts"],
    "Unexpected accepted changes"
);

const finalHead = await git("rev-parse", "HEAD");

assert.notEqual(
    finalHead,
    initialHead,
    "No accepted Git commit was created"
);

assert.equal(
    await git("status", "--porcelain=v1"),
    "",
    "Game repository is dirty after acceptance"
);

const updatedProgress = await recovery.recover();

assert.equal(updatedProgress.head, finalHead);

const updatedTasks = new Set(
    updatedProgress.completedTasks.map(item => item.taskId)
);

assert.ok(updatedTasks.has("foundation"));
assert.ok(updatedTasks.has("paddle"));
assert.equal(updatedTasks.size, completedIds.size + 1);

console.log("\nRECOVERED TASK GRAPH PROGRESS");
console.log("Previous HEAD:", initialHead);
console.log("Accepted HEAD:", finalHead);
console.log("Completed tasks:", [...updatedTasks]);

console.log("\nFREEFORM QWEN CONTINUATION E2E PASSED");
