
import {
    mkdtemp,
    writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    OpenRouterProvider
} from "../packages/ai/dist/index.js";

import {
    CloudGameArchitect,
    CloudGamePlanner
} from "../packages/freeform/dist/index.js";

const env = process.env;

const apiKey =
    env.FREEFORM_CLOUD_API_KEY ||
    env.OPENROUTER_API_KEY ||
    (
        env.GAME_FACTORY_AI_PROVIDER === "openrouter"
            ? env.GAME_FACTORY_AI_API_KEY
            : undefined
    );

const defaultModel =
    env.FREEFORM_CLOUD_MODEL ||
    (
        env.GAME_FACTORY_AI_PROVIDER === "openrouter"
            ? env.GAME_FACTORY_AI_MODEL
            : undefined
    );

const architectModel =
    env.FREEFORM_ARCHITECT_MODEL || defaultModel;

const plannerModel =
    env.FREEFORM_PLANNER_MODEL || defaultModel;

if (!apiKey) {
    throw new Error(
        "Set FREEFORM_CLOUD_API_KEY or configure OpenRouter"
    );
}

if (!architectModel || !plannerModel) {
    throw new Error(
        "Set FREEFORM_CLOUD_MODEL or both role-specific models"
    );
}

const provider = new OpenRouterProvider({
    apiKey,
    timeoutMs: 180_000,
    appName: "Game Factory Freeform E2E",
    reasoningEffort: "low"
});

const architect = new CloudGameArchitect({
    provider,
    model: architectModel,
    maxTokens: 16000
});

const planner = new CloudGamePlanner({
    provider,
    model: plannerModel,
    maxTokens: 16000
});

const outputDir = await mkdtemp(
    join(tmpdir(), "game-factory-freeform-cloud-")
);

console.log("Freeform Cloud E2E");
console.log("Architect model:", architectModel);
console.log("Planner model:", plannerModel);
console.log("Output directory:", outputDir);

try {
    const design = await architect.design({
        prompt: [
            "Create a small, playable 2D Breakout game.",
            "A paddle controlled by arrow keys moves horizontally.",
            "A ball bounces off walls, bricks and the paddle.",
            "Destroying bricks increases score.",
            "The player wins when every brick is destroyed.",
            "The player loses when all lives are gone.",
            "Use one gameplay scene and a simple HUD.",
            "Keep collision shapes independent of sprites.",
            "Prefer geometric graphics over generated artwork.",
            "The game must work offline in a browser."
        ].join(" "),
        target: "web",
        orientation: "landscape"
    });

    const blueprint = design.blueprint;

    await writeFile(
        join(outputDir, "blueprint.json"),
        JSON.stringify(blueprint, null, 2),
        "utf8"
    );

    console.log("\nARCHITECT PASSED");
    console.log("Game:", blueprint.title);
    console.log("Mechanics:", blueprint.mechanics.length);
    console.log("Scenes:", blueprint.scenes.length);
    console.log("Assets:", blueprint.assets.length);

    const planning = await planner.plan({ blueprint });
    const graph = planning.graph;

    await writeFile(
        join(outputDir, "task-graph.json"),
        JSON.stringify(graph, null, 2),
        "utf8"
    );

    console.log("\nPLANNER PASSED");
    console.log("Blueprint ID:", graph.blueprintId);
    console.log("Tasks:", graph.tasks.length);

    for (const task of graph.tasks) {
        console.log(`\n[${task.id}] ${task.title}`);
        console.log("  Depends on:", task.dependsOn);
        console.log("  Writes:", task.allowedPaths);
        console.log("  Checks:", task.checks);
    }

    console.log("\nToken usage:");
    console.log(JSON.stringify({
        architect: design.metadata.usage,
        planner: planning.metadata.usage
    }, null, 2));

    console.log("\nFULL FREEFORM CLOUD PLANNING E2E PASSED");
    console.log("Saved results:", outputDir);
} catch (error) {
    console.error("\nFREEFORM CLOUD E2E FAILED");

    console.error(
        error instanceof Error
            ? error.message
            : String(error)
    );

    console.error("Debug directory:", outputDir);

    process.exitCode = 1;
}
