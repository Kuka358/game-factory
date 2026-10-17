
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import {
    OpenRouterProvider
} from "../packages/ai/dist/index.js";

import {
    CloudExecutableBehaviorPlanner,
    reconcileAcceptanceContract,
    validateFreeformBlueprint,
    validateTaskGraph,
    validateAcceptanceTestPlan,
    validateExecutableBehaviorSpec,
    createAcceptanceContractDigest
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    blueprintPath,
    graphPath,
    draftPath,
    clarificationPath,
    contractPath,
    gameRoot
] = process.argv.slice(2);

if (
    [
        blueprintPath,
        graphPath,
        draftPath,
        clarificationPath,
        contractPath,
        gameRoot
    ].some(path => !path || !isAbsolute(path))
) {
    throw new Error(
        "Usage: node scripts/test-freeform-cloud-executable-behavior.mjs " +
        "<blueprint> <graph> <draft> <clarification> " +
        "<contract> <game-root>"
    );
}

const env = process.env;

const apiKey =
    env.FREEFORM_CLOUD_API_KEY ||
    env.OPENROUTER_API_KEY ||
    (env.GAME_FACTORY_AI_PROVIDER === "openrouter"
        ? env.GAME_FACTORY_AI_API_KEY
        : undefined);

const model =
    env.FREEFORM_TEST_MODEL ||
    env.FREEFORM_PLANNER_MODEL ||
    env.FREEFORM_CLOUD_MODEL ||
    (env.GAME_FACTORY_AI_PROVIDER === "openrouter"
        ? env.GAME_FACTORY_AI_MODEL
        : undefined);

if (!apiKey || !model) {
    throw new Error(
        "Configure an OpenRouter API key and model"
    );
}

async function git(...args) {
    const { stdout } = await execFileAsync(
        "git",
        ["-C", gameRoot, ...args],
        {
            encoding: "utf8",
            windowsHide: true,
            timeout: 30_000,
            maxBuffer: 1024 * 1024
        }
    );

    return stdout.trimEnd();
}

async function json(path) {
    return JSON.parse(
        await readFile(path, "utf8")
    );
}

const originalHead = await git("rev-parse", "HEAD");

assert.equal(
    await git(
        "status",
        "--porcelain=v1",
        "--untracked-files=all"
    ),
    "",
    "Game repository must be clean"
);

const blueprintResult = validateFreeformBlueprint(
    await json(blueprintPath)
);

if (!blueprintResult.valid) {
    throw new Error(
        "Invalid Blueprint: " +
        JSON.stringify(blueprintResult.errors)
    );
}

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    await json(graphPath),
    blueprint.id
);

if (!graphResult.valid) {
    throw new Error(
        "Invalid TaskGraph: " +
        JSON.stringify(graphResult.errors)
    );
}

const graph = graphResult.data;

const draftResult = validateAcceptanceTestPlan(
    await json(draftPath),
    graph,
    blueprint.id
);

if (!draftResult.valid) {
    throw new Error(
        "Invalid AcceptanceTestPlan: " +
        JSON.stringify(draftResult.errors)
    );
}

const draftPlan = draftResult.data;
const clarification = await json(clarificationPath);
const savedContract = await json(contractPath);

assert.equal(draftPlan.taskId, "paddle");

const task = graph.tasks.find(
    item => item.id === draftPlan.taskId
);

assert.ok(task, "Paddle task not found");

const constantsPath = "src/game/constants.ts";

assert.ok(task.readPaths.includes(constantsPath));
assert.ok(!task.allowedPaths.includes(constantsPath));

// Reconstruct exactly the reference context used
// by the previous clarification and normalization.
const constantsContent = await git(
    "show",
    `HEAD:${constantsPath}`
);

const referenceFiles = [{
    path: constantsPath,
    content: constantsContent + "\n"
}];

// Reconcile again using the persisted inputs.
// This checks the saved contract rather than
// trusting an arbitrary JSON file.
const verifiedContract = reconcileAcceptanceContract({
    blueprint,
    graph,
    draftPlan,
    clarification,
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
    verifiedContract,
    "Saved contract differs from reconciled contract"
);

assert.equal(
    verifiedContract.timeModel,
    "delta_ms",
    "This behavior profile requires delta_ms"
);

// Trusted design choices for this particular E2E.
// In the final autonomous pipeline these must be
// supplied by a versioned design/contract artifact.
const expectedTarget = {
    sourcePath: "src/game/Paddle.ts",
    className: "Paddle"
};

const trustedSpeed = {
    sourcePath: constantsPath,
    exportName: "PADDLE",
    property: "speed",
    unit: "pixels_per_nominal_frame",
    referenceFps: 60
};

const provider = new OpenRouterProvider({
    apiKey,
    timeoutMs: 180_000,
    appName: "Game Factory Executable Behavior",
    reasoningEffort: "low"
});

const planner = new CloudExecutableBehaviorPlanner({
    provider,
    model,
    maxTokens: 4096
});

console.log("\nEXECUTABLE BEHAVIOR PLANNING");
console.log("Game:", blueprint.title);
console.log("Task:", task.id);
console.log("Model:", model);
console.log("Game HEAD:", originalHead);
console.log("Contract time model:", verifiedContract.timeModel);
console.log(
    "Contract digest:",
    createAcceptanceContractDigest(verifiedContract)
);
console.log("Trusted target:", expectedTarget);
console.log("Trusted speed:", trustedSpeed);

const result = await planner.plan({
    blueprint,
    graph,
    contract: verifiedContract,
    referenceFiles,
    expectedTarget,
    trustedSpeed
});

const spec = result.spec;

// Additional Paddle-specific E2E checks.
// The generic planner itself remains reusable.
assert.equal(spec.kind, "horizontal_boolean_controller");
assert.equal(spec.className, "Paddle");
assert.equal(spec.controls.negative, "left");
assert.equal(spec.controls.positive, "right");
assert.equal(spec.update.deltaArgumentIndex, 1);

const validation = validateExecutableBehaviorSpec(
    spec,
    task,
    verifiedContract
);

assert.equal(
    validation.valid,
    true,
    "Generated behavior specification failed validation"
);

// No changes to the accepted game workspace.
assert.equal(
    await git("rev-parse", "HEAD"),
    originalHead
);

assert.equal(
    await git(
        "status",
        "--porcelain=v1",
        "--untracked-files=all"
    ),
    "",
    "Behavior planning changed the game workspace"
);

const outputPath = join(
    dirname(contractPath),
    `executable-behavior-paddle-${randomUUID()}.json`
);

await writeFile(
    outputPath,
    JSON.stringify(spec, null, 2) + "\n",
    {
        encoding: "utf8",
        flag: "wx"
    }
);

console.log("\nEXECUTABLE BEHAVIOR SPEC");
console.log(JSON.stringify(spec, null, 2));

console.log("\nTOKEN USAGE");
console.log(result.metadata.usage ?? "<unavailable>");

console.log("\nMODEL ATTEMPTS");
console.log(result.metadata.attempts);

console.log("\nSAVED SPEC");
console.log(outputPath);

console.log("\nEXECUTABLE BEHAVIOR PLANNING PASSED");
