
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
    TaskGraphAutonomyPlanner
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    gameRoot,
    blueprintPath,
    graphPath,
    dockerExecutable
] = process.argv.slice(2);

for (const path of [
    gameRoot,
    blueprintPath,
    graphPath,
    dockerExecutable
]) {
    if (!path || !isAbsolute(path)) {
        throw new Error(
            "All four arguments must be absolute paths: " +
            "<gameRoot> <blueprint.json> <task-graph.json> <docker.exe>"
        );
    }
}

const model = process.env.LM_STUDIO_MODEL;
const baseUrl = process.env.LM_STUDIO_BASE_URL
    ?? "http://127.0.0.1:1234/v1/";

if (!model) {
    throw new Error("LM_STUDIO_MODEL is required");
}

const blueprint = JSON.parse(
    await readFile(blueprintPath, "utf8")
);

const originalGraph = JSON.parse(
    await readFile(graphPath, "utf8")
);

assert.equal(
    originalGraph.blueprintId,
    blueprint.id,
    "Blueprint and TaskGraph must match"
);

const foundation = originalGraph.tasks.find(
    task => task.id === "foundation"
);

assert.ok(foundation, "Foundation task is missing");
assert.deepEqual(
    foundation.dependsOn,
    [],
    "Foundation must not depend on other tasks"
);

for (const check of foundation.checks) {
    assert.ok(
        ["tsc", "vite"].includes(check),
        `Unsupported foundation check: ${check}`
    );
}

// Deliberately execute ONE task only.
// We are not approving or executing the original full graph.
const graph = {
    schemaVersion: "1.0",
    blueprintId: blueprint.id,
    revision: 1,
    tasks: [{
        ...foundation,
        maxLocalAttempts: 3,
        readPaths: [
            ...new Set([
                ...foundation.readPaths,
                "package.json",
                "tsconfig.json",
                "vite.config.ts"
            ])
        ]
    }]
};

const planner = new TaskGraphAutonomyPlanner({
    blueprint,
    graph,
    availableChecks: ["tsc", "vite"]
});

await access(join(gameRoot, "pnpm-lock.yaml"));

async function git(...args) {
    const result = await execFileAsync("git", args, {
        cwd: gameRoot,
        windowsHide: true,
        encoding: "utf8"
    });

    return result.stdout.trim();
}

assert.equal(
    await git("status", "--porcelain"),
    "",
    "Game repository must be clean before Qwen starts"
);

const initialHead = await git("rev-parse", "HEAD");

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

const harness = new AICodingHarness({
    provider,
    model,
    temperature: 0.1,
    maxTokens: 6144,
    contextDiscovery: new GitRepositoryContextDiscovery({
        maxSelectedFiles: 12,
        maxInventoryEntries: 200
    })
});

const isolatedWorker = new IsolatedHarnessCodingWorker({
    repositoryRoot: gameRoot,
    worktreesDirectory: join(
        gameRoot,
        ".game-factory",
        "wt"
    ),
    harness
});

const worker = new ProvisionedCodingWorker({
    worker: isolatedWorker,
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
        const failures = context.verification.checks
            .filter(check => !check.passed)
            .map(check =>
                `${check.id}: ${check.stderr || check.stdout}`
            );

        return {
            type: "abort",
            reason: [
                "Foundation verification failed.",
                ...failures
            ].join("\n")
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
            gameRoot,
            ".game-factory",
            "autonomy",
            "runs"
        )
    })
});

const run = createAutonomousRun({
    id: `freeform-foundation-${randomUUID()}`,
    goal: [
        `Build the foundation for ${blueprint.title}.`,
        `Game description: ${blueprint.pitch}`,
        `Viewport: ${blueprint.viewport.width}x${blueprint.viewport.height}`,
        "Mechanics:",
        ...blueprint.mechanics.map(mechanic =>
            `${mechanic.id}: ${mechanic.rules.join("; ")}`
        ),
        "Preserve the working Phaser/Vite configuration.",
        "Implement the specified foundation task.",
        "Do not edit package.json or build configuration.",
        "src/main.ts already contains a working Phaser bootstrap.",
        "Preserve its existing structure and initialization logic.",
        "Do not rewrite the entire src/main.ts file.",
        "Use small, exact, unique oldText ranges for replacements.",
        "Prefer insert_before or insert_after when adding code.",
        "Keep every replacement oldText below 30% of the existing file.",
        "Use operation=create for a new src/game/constants.ts file.",
        "Do not implement later tasks."
    ].join("\n"),
    maxIterations: 1
});

console.log("FREEFORM QWEN FOUNDATION E2E");
console.log("Game:", blueprint.title);
console.log("Model:", model);
console.log("Provider:", baseUrl);
console.log("Task:", foundation.id);
console.log("Allowed writes:", foundation.allowedPaths);
console.log("Checks:", foundation.checks);
console.log("Initial HEAD:", initialHead);
console.log("");

let result;

try {
    result = await engine.run(run);
} catch (error) {
    console.error("Autonomy runtime threw an error:");
    console.error(error);
    throw error;
}

console.log("\nAUTONOMY RESULT");
console.log("Status:", result.status);
console.log("Iterations:", result.currentIteration);
console.log("Failure:", result.failureReason ?? "<none>");

for (const iteration of result.iterations) {


    console.log("Task:", iteration.contract.id);

    console.log("Attempts:", iteration.attempts.length);

    for (const attempt of iteration.attempts) {
        console.log(`Attempt ${attempt.attempt}`);

        if (attempt.error) {
            console.log("Harness error:", attempt.error);
        }
    }

    console.log("Completed:", iteration.completed);
    console.log(
        "Accepted files:",
        iteration.acceptance?.changedFiles ?? []
    );

    for (const attempt of iteration.attempts) {
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
        `Foundation run did not complete: ${result.status}`
    );
}

assert.equal(result.currentIteration, 1);

const accepted = result.iterations[0]?.acceptance;

assert.equal(
    accepted?.status,
    "accepted",
    "Foundation changes must be accepted"
);

assert.ok(
    accepted.changedFiles.length > 0,
    "Qwen did not change any files"
);

const finalHead = await git("rev-parse", "HEAD");

assert.notEqual(
    finalHead,
    initialHead,
    "Verified commit was not created"
);

assert.equal(
    await git("status", "--porcelain"),
    "",
    "Game repository must remain clean"
);

console.log("");
console.log("Initial HEAD:", initialHead);
console.log("Accepted HEAD:", finalHead);
console.log("Accepted files:", accepted.changedFiles);
console.log("FREEFORM QWEN FOUNDATION E2E PASSED");
