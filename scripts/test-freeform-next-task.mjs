
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import {
    TaskGraphAutonomyPlanner,
    TaskGraphProgressRecovery,
    validateFreeformBlueprint,
    validateTaskGraph
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [gameRoot, blueprintPath, graphPath] =
    process.argv.slice(2);

if (
    [gameRoot, blueprintPath, graphPath].some(
        path => !path || !isAbsolute(path)
    )
) {
    throw new Error(
        "Usage: node scripts/test-freeform-next-task.mjs " +
        "<absolute-game-root> <absolute-blueprint-path> " +
        "<absolute-task-graph-path>"
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
            timeout: 30_000
        }
    );

    return stdout.trim();
}

const status = await git(
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
);

assert.equal(
    status,
    "",
    "Game repository must be clean before planning"
);

const blueprintRaw = JSON.parse(
    await readFile(blueprintPath, "utf8")
);

const graphRaw = JSON.parse(
    await readFile(graphPath, "utf8")
);

const blueprintResult =
    validateFreeformBlueprint(blueprintRaw);

if (!blueprintResult.valid) {
    console.error(blueprintResult.errors);
    throw new Error("Invalid Freeform Blueprint");
}

const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    graphRaw,
    blueprint.id
);

if (!graphResult.valid) {
    console.error("TASK GRAPH VALIDATION ERRORS");

    for (const error of graphResult.errors) {
        console.error(`${error.path}: ${error.message}`);
    }

    throw new Error("Full TaskGraph is invalid");
}

const graph = graphResult.data;

const recovery = new TaskGraphProgressRecovery({
    repositoryRoot: gameRoot,
    graph
});

const progress = await recovery.recover();

assert.equal(
    await git("rev-parse", "HEAD"),
    progress.head,
    "Game HEAD changed during preflight"
);

const completedIds = new Set(
    progress.completedTasks.map(task => task.taskId)
);

const remaining = graph.tasks.filter(
    task => !completedIds.has(task.id)
);

// Only for this planning preflight: these are declared
// check types, not proof of registered verifier commands.
const declaredChecks = [
    ...new Set(graph.tasks.flatMap(task => task.checks))
];

const planner = new TaskGraphAutonomyPlanner({
    blueprint,
    graph,
    availableChecks: declaredChecks,
    recoveredProgress: progress
});

const decision = await planner.plan({
    context: {
        run: {
            id: "freeform-next-task-preflight",
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

console.log("\nFREEFORM TASK GRAPH PREFLIGHT");

console.log("Game:", blueprint.title);
console.log("HEAD:", progress.head);
console.log("Graph revision:", graph.revision);
console.log("Total tasks:", graph.tasks.length);

console.log(
    "Recovered tasks:",
    [...completedIds]
);

console.log(
    "Remaining tasks:",
    remaining.map(task => task.id)
);

if (decision.type === "blocked") {
    throw new Error(
        `Planner blocked: ${decision.reason}`
    );
}

if (decision.type === "complete") {
    console.log("All tasks already completed");
    console.log("FREEFORM TASK GRAPH COMPLETE");
    process.exit(0);
}

const contract = decision.contract;
const task = graph.tasks.find(
    task => task.id === contract.id
);

assert.ok(task, "Selected task is missing from graph");

assert.ok(
    !completedIds.has(task.id),
    "Planner selected an already completed task"
);

assert.ok(
    task.dependsOn.every(id => completedIds.has(id)),
    "Planner selected a task with unmet dependencies"
);

console.log("\nNEXT READY TASK");
console.log("ID:", task.id);
console.log("Title:", task.title);
console.log("Objective:", task.objective);
console.log("Depends on:", task.dependsOn);
console.log("Allowed writes:", task.allowedPaths);
console.log("Read paths:", task.readPaths);
console.log("Acceptance:", task.acceptance);
console.log("Checks:", task.checks);
console.log("Max local attempts:", task.maxLocalAttempts);

console.log("\nAUTONOMY CONTRACT");
console.log(
    "Verification:",
    contract.verification.map(check => check.command)
);
console.log(
    "Writable scope:",
    contract.scope.allowedPaths
);
console.log(
    "Context scope:",
    contract.contextScope?.allowedPaths
);

console.log("\nNEXT TASK PREFLIGHT PASSED");
