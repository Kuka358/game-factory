
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import {
    OpenRouterProvider
} from "../packages/ai/dist/index.js";

import {
    CloudAcceptanceTestPlanner,
    createTaskGraphDigest,
    validateFreeformBlueprint,
    validateTaskGraph,
    assertReadyForTestGeneration
} from "../packages/freeform/dist/index.js";

const [blueprintPath, graphPath, taskId = "paddle"] =
    process.argv.slice(2);

if (
    !blueprintPath ||
    !graphPath ||
    !isAbsolute(blueprintPath) ||
    !isAbsolute(graphPath)
) {
    throw new Error(
        "Usage: node scripts/test-freeform-cloud-acceptance.mjs " +
        "<absolute-blueprint-path> <absolute-graph-path> [taskId]"
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
        "Configure OpenRouter API key and cloud model in .env"
    );
}

const blueprintResult = validateFreeformBlueprint(
    JSON.parse(await readFile(blueprintPath, "utf8"))
);

if (!blueprintResult.valid) {
    throw new Error(
        "Invalid Blueprint: " +
        JSON.stringify(blueprintResult.errors)
    );
}

const graphResult = validateTaskGraph(
    JSON.parse(await readFile(graphPath, "utf8")),
    blueprintResult.data.id
);

if (!graphResult.valid) {
    throw new Error(
        "Invalid TaskGraph: " +
        JSON.stringify(graphResult.errors)
    );
}

const blueprint = blueprintResult.data;
const graph = graphResult.data;

const task = graph.tasks.find(
    item => item.id === taskId
);

if (!task) {
    throw new Error(`Unknown task: ${taskId}`);
}

const provider = new OpenRouterProvider({
    apiKey,
    timeoutMs: 180_000,
    appName: "Game Factory Acceptance Planning",
    reasoningEffort: "low"
});

const planner = new CloudAcceptanceTestPlanner({
    provider,
    model,
    maxTokens: 8192
});

console.log("\nCLOUD ACCEPTANCE PLANNING");
console.log("Model:", model);
console.log("Game:", blueprint.title);
console.log("Task:", task.id);
console.log("Graph digest:", createTaskGraphDigest(graph));
console.log("Acceptance criteria:", task.acceptance);

const result = await planner.plan({
    blueprint,
    graph,
    taskId
});

const plan = result.plan;

const outputPath = join(
    dirname(graphPath),
    `acceptance-${taskId}-${randomUUID()}.json`
);

await writeFile(
    outputPath,
    JSON.stringify(plan, null, 2) + "\n",
    {
        encoding: "utf8",
        flag: "wx"
    }
);

console.log("\nGENERATED SCENARIOS");

for (const scenario of plan.scenarios) {
    console.log(`\n[${scenario.id}]`);
    console.log("Level:", scenario.level);
    console.log("Requirement:", scenario.requirement);
    console.log("Setup:", scenario.setup);
    console.log("Actions:", scenario.actions);
    console.log("Assertions:", scenario.assertions);
}

console.log("\nUNRESOLVED QUESTIONS");
console.log(plan.unresolvedQuestions);

console.log("\nTOKEN USAGE");
console.log(result.metadata.usage ?? "<unavailable>");

console.log("\nSAVED PLAN");
console.log(outputPath);

try {
    assertReadyForTestGeneration(plan);

    console.log("\nACCEPTANCE PLAN READY");
} catch (error) {
    console.log("\nACCEPTANCE PLAN REQUIRES CLARIFICATION");
    console.log(
        error instanceof Error
            ? error.message
            : String(error)
    );

    // The plan was saved, but test generation must not begin.
    process.exitCode = 2;
}
