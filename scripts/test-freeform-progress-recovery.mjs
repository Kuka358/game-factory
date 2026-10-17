
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import {
    TaskGraphProgressRecovery
} from "../packages/freeform/dist/index.js";

const [gameRoot, graphPath] = process.argv.slice(2);

if (
    !gameRoot ||
    !graphPath ||
    !isAbsolute(gameRoot) ||
    !isAbsolute(graphPath)
) {
    throw new Error(
        "Usage: node scripts/test-freeform-progress-recovery.mjs " +
        "<absolute-game-root> <absolute-task-graph-path>"
    );
}

const graph = JSON.parse(
    await readFile(graphPath, "utf8")
);

const recovery = new TaskGraphProgressRecovery({
    repositoryRoot: gameRoot,
    graph
});

const progress = await recovery.recover();

console.log("Current HEAD:", progress.head);

console.log(
    "Recovered tasks:",
    JSON.stringify(progress.completedTasks, null, 2)
);

const foundation = progress.completedTasks.find(
    item => item.taskId === "foundation"
);

assert.ok(
    foundation,
    "Previously accepted foundation was not recovered"
);

console.log("PASS foundation acceptance recovered");
console.log("FREEFORM TASK PROGRESS RECOVERY PASSED");
