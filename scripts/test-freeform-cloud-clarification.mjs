
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
    CloudAcceptanceClarifier,
    validateFreeformBlueprint,
    validateTaskGraph,
    validateAcceptanceTestPlan,
    assertClarificationReady
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [
    blueprintPath,
    graphPath,
    draftPath,
    gameRoot
] = process.argv.slice(2);

if (
    [blueprintPath, graphPath, draftPath, gameRoot]
        .some(path => !path || !isAbsolute(path))
) {
    throw new Error(
        "Usage: node scripts/test-freeform-cloud-clarification.mjs " +
        "<blueprint> <graph> <draft-plan> <game-root>"
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
    throw new Error("Cloud API key and model are required");
}

async function git(...args) {
    const { stdout } = await execFileAsync(
        "git",
        [
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

const initialHead = await git("rev-parse", "HEAD");

assert.equal(
    await git("status", "--porcelain=v1", "--untracked-files=all"),
    "",
    "Game repository must be clean"
);

const blueprintResult = validateFreeformBlueprint(
    JSON.parse(await readFile(blueprintPath, "utf8"))
);

if (!blueprintResult.valid) {
    throw new Error("Invalid Blueprint");
}

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    JSON.parse(await readFile(graphPath, "utf8")),
    blueprint.id
);

if (!graphResult.valid) {
    throw new Error("Invalid TaskGraph");
}

const graph = graphResult.data;

const draftResult = validateAcceptanceTestPlan(
    JSON.parse(await readFile(draftPath, "utf8")),
    graph,
    blueprint.id
);

if (!draftResult.valid) {
    throw new Error(
        JSON.stringify(draftResult.errors)
    );
}

const draftPlan = draftResult.data;

assert.equal(draftPlan.taskId, "paddle");

assert.ok(
    draftPlan.unresolvedQuestions.length > 0,
    "No questions to clarify"
);

const task = graph.tasks.find(
    item => item.id === draftPlan.taskId
);

assert.ok(task);

// Read a trusted reference from the accepted Git HEAD.
// Never read Paddle.ts: that is the candidate AI
// implementation whose behavior we want to verify.
const constantsPath = "src/game/constants.ts";

assert.ok(task.readPaths.includes(constantsPath));

assert.ok(
    !task.allowedPaths.includes(constantsPath),
    "Reference must be read-only for this task"
);

const constantsContent = await git(
    "show",
    `HEAD:${constantsPath}`
);

assert.ok(constantsContent.length > 0);
assert.ok(constantsContent.length <= 16_000);

const referenceFiles = [{
    path: constantsPath,
    content: constantsContent + "\n"
}];

const provider = new OpenRouterProvider({
    apiKey,
    timeoutMs: 180_000,
    appName: "Game Factory Acceptance Clarification",
    reasoningEffort: "low"
});

const clarifier = new CloudAcceptanceClarifier({
    provider,
    model,
    maxTokens: 8192
});

console.log("\nCLOUD ACCEPTANCE CLARIFICATION");
console.log("Model:", model);
console.log("Game:", blueprint.title);
console.log("Task:", draftPlan.taskId);
console.log("Game HEAD:", initialHead);
console.log("Questions:", draftPlan.unresolvedQuestions.length);
console.log("Reference files:", referenceFiles.map(x => x.path));

const result = await clarifier.clarify({
    blueprint,
    graph,
    draftPlan,
    referenceFiles
});

assert.equal(
    await git("rev-parse", "HEAD"),
    initialHead,
    "Game HEAD changed during clarification"
);

assert.equal(
    await git("status", "--porcelain=v1", "--untracked-files=all"),
    "",
    "Clarification must not modify the game"
);

const clarification = result.clarification;

const outputPath = join(
    dirname(draftPath),
    `clarification-${draftPlan.taskId}-${randomUUID()}.json`
);

await writeFile(
    outputPath,
    JSON.stringify(clarification, null, 2) + "\n",
    {
        encoding: "utf8",
        flag: "wx"
    }
);

console.log("\nCLARIFICATION RESULTS");

for (const answer of clarification.answers) {
    console.log("\nQuestion:", answer.question);
    console.log("Classification:", answer.classification);
    console.log("Resolution:", answer.resolution);
    console.log("Rationale:", answer.rationale);
}

console.log("\nTOKEN USAGE");
console.log(result.metadata.usage ?? "<unavailable>");
console.log("\nSAVED:", outputPath);

try {
    assertClarificationReady(clarification);
    console.log("\nCLARIFICATION READY");
} catch (error) {
    console.log("\nCLARIFICATION STILL BLOCKED");
    console.log(
        error instanceof Error
            ? error.message
            : String(error)
    );
    process.exitCode = 2;
}
