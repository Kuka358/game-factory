
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import {
    OpenRouterProvider
} from "../packages/ai/dist/index.js";

import {
    CloudAcceptanceContractNormalizer,
    validateFreeformBlueprint,
    validateTaskGraph,
    validateAcceptanceTestPlan,
    validateAcceptanceClarification,
    assertClarificationReady
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    blueprintPath,
    graphPath,
    draftPath,
    clarificationPath,
    gameRoot
] = process.argv.slice(2);

const inputPaths = [
    blueprintPath,
    graphPath,
    draftPath,
    clarificationPath,
    gameRoot
];

if (
    inputPaths.some(path =>
        !path || !isAbsolute(path)
    )
) {
    throw new Error(
        "Usage: node scripts/test-freeform-cloud-contract-normalization.mjs " +
        "<blueprint> <graph> <draft> <clarification> <game-root>"
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
        "OpenRouter API key and model are required"
    );
}

async function git(...args) {
    const { stdout } = await execFileAsync(
        "git",
        [
            ...(process.platform === "win32"
                ? ["-c", "core.longpaths=true"]
                : []),
            "-C",
            gameRoot,
            ...args
        ],
        {
            encoding: "utf8",
            windowsHide: true,
            timeout: 30_000,
            maxBuffer: 1024 * 1024
        }
    );

    return stdout.trimEnd();
}

async function readJson(path) {
    return JSON.parse(
        await readFile(path, "utf8")
    );
}

const initialHead = await git(
    "rev-parse",
    "HEAD"
);

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
    await readJson(blueprintPath)
);

if (!blueprintResult.valid) {
    throw new Error(
        JSON.stringify(blueprintResult.errors)
    );
}

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    await readJson(graphPath),
    blueprint.id
);

if (!graphResult.valid) {
    throw new Error(
        JSON.stringify(graphResult.errors)
    );
}

const graph = graphResult.data;

const draftResult = validateAcceptanceTestPlan(
    await readJson(draftPath),
    graph,
    blueprint.id
);

if (!draftResult.valid) {
    throw new Error(
        JSON.stringify(draftResult.errors)
    );
}

const draftPlan = draftResult.data;

assert.equal(
    draftPlan.taskId,
    "paddle",
    "This E2E is specifically for Paddle"
);

const clarification = await readJson(
    clarificationPath
);

const task = graph.tasks.find(
    item => item.id === draftPlan.taskId
);

assert.ok(task);

const constantsPath = "src/game/constants.ts";

assert.ok(
    task.readPaths.includes(constantsPath),
    "Task must permit reading constants.ts"
);

assert.ok(
    !task.allowedPaths.includes(constantsPath),
    "Reference file must not be writable"
);

// Reconstruct EXACTLY the reference content used
// during the previous clarification request.
// Do not read Paddle.ts or other candidate code.
const constantsContent =
    await git("show", `HEAD:${constantsPath}`);

const referenceFiles = [{
    path: constantsPath,
    content: constantsContent + "\n"
}];

const referenceDigest = createHash("sha256")
    .update(JSON.stringify(referenceFiles), "utf8")
    .digest("hex");

const clarificationErrors =
    validateAcceptanceClarification(
        clarification,
        draftPlan,
        referenceDigest
    );

assert.deepEqual(
    clarificationErrors,
    [],
    "Clarification does not match its source context"
);

assertClarificationReady(clarification);

const provider = new OpenRouterProvider({
    apiKey,
    timeoutMs: 180_000,
    appName: "Game Factory Contract Normalization",
    reasoningEffort: "low"
});

const normalizer =
    new CloudAcceptanceContractNormalizer({
        provider,
        model,
        maxTokens: 8192
    });

console.log("\nCLOUD CONTRACT NORMALIZATION");
console.log("Game:", blueprint.title);
console.log("Task:", task.id);
console.log("Model:", model);
console.log("Game HEAD:", initialHead);
console.log(
    "Clarification answers:",
    clarification.answers.length
);
console.log(
    "Trusted runtime profile:",
    "continuous_motion"
);
console.log(
    "Reference files:",
    referenceFiles.map(file => file.path)
);

const result = await normalizer.normalize({
    blueprint,
    graph,
    draftPlan,
    clarification,
    referenceFiles,

    // Trusted selection for this motion-specific E2E.
    // Never derive this from the AI response.
    expectedProfile: "continuous_motion"
});

const contract = result.contract;

assert.equal(
    contract.profile,
    "continuous_motion"
);

assert.ok(
    [
        "delta_ms",
        "engine_managed",
        "fixed_timestep"
    ].includes(contract.timeModel)
);

assert.equal(
    contract.rules.length,
    clarification.answers.length
);

assert.equal(
    await git("rev-parse", "HEAD"),
    initialHead,
    "Game HEAD changed unexpectedly"
);

assert.equal(
    await git(
        "status",
        "--porcelain=v1",
        "--untracked-files=all"
    ),
    "",
    "Normalization must not modify the game"
);

const outputPath = join(
    dirname(clarificationPath),
    `acceptance-contract-paddle-${randomUUID()}.json`
);

await writeFile(
    outputPath,
    JSON.stringify(contract, null, 2) + "\n",
    {
        encoding: "utf8",
        flag: "wx"
    }
);

console.log("\nNORMALIZED CONTRACT");
console.log("Profile:", contract.profile);
console.log("Time model:", contract.timeModel);
console.log("Graph revision:", contract.graphRevision);
console.log("Graph digest:", contract.graphDigest);
console.log("Policy digest:", contract.runtimePolicyDigest);

console.log("\nNORMALIZED RULES");

for (const rule of contract.rules) {
    console.log("\nQuestion:", rule.question);
    console.log("Classification:", rule.classification);
    console.log("Rule:", rule.rule);
}

console.log("\nTOKEN USAGE");
console.log(result.metadata.usage ?? "<unavailable>");

console.log("\nMODEL ATTEMPTS");
console.log(result.metadata.attempts);

console.log("\nSAVED CONTRACT");
console.log(outputPath);

console.log(
    "\nSTRUCTURAL CONTRACT NORMALIZATION PASSED"
);
console.log(
    "Semantic consistency has not yet been certified."
);
