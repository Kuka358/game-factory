
import assert from "node:assert/strict";
import {
    readFile,
    writeFile
} from "node:fs/promises";
import {
    dirname,
    isAbsolute,
    join
} from "node:path";

import {
    validateFreeformBlueprint,
    validateTaskGraph
} from "../packages/freeform/dist/index.js";

const [blueprintPath, graphPath] =
    process.argv.slice(2);

if (
    !blueprintPath ||
    !graphPath ||
    !isAbsolute(blueprintPath) ||
    !isAbsolute(graphPath)
) {
    throw new Error(
        "Usage: node scripts/fix-freeform-task-graph-checks.mjs " +
        "<absolute-blueprint-path> <absolute-task-graph-path>"
    );
}

const blueprintRaw = JSON.parse(
    await readFile(blueprintPath, "utf8")
);

const blueprintResult =
    validateFreeformBlueprint(blueprintRaw);

if (!blueprintResult.valid) {
    throw new Error(
        "Invalid Blueprint: " +
        JSON.stringify(blueprintResult.errors)
    );
}

const graph = JSON.parse(
    await readFile(graphPath, "utf8")
);

assert.ok(Array.isArray(graph.tasks));

const foundationBefore = JSON.stringify(
    graph.tasks.find(task => task.id === "foundation")
);

assert.ok(
    foundationBefore,
    "Previously accepted foundation task is missing"
);

// Every task referenced by dependsOn has dependents
// and therefore is not a terminal DAG task.
const nonTerminalIds = new Set(
    graph.tasks.flatMap(task => task.dependsOn)
);

const changes = [];

for (const task of graph.tasks) {
    if (
        !nonTerminalIds.has(task.id) ||
        !task.checks.includes("browser_smoke")
    ) {
        continue;
    }

    if (task.id === "foundation") {
        throw new Error(
            "Refusing to alter already accepted foundation"
        );
    }

    const checks = task.checks.filter(
        check => check !== "browser_smoke"
    );

    if (checks.length === 0) {
        throw new Error(
            `Task ${task.id} has no checks after correction`
        );
    }

    changes.push({
        id: task.id,
        before: [...task.checks],
        after: [...checks]
    });

    task.checks = checks;
}

// Accepted foundation contract must remain exactly
// as it appeared in the original cloud TaskGraph.
assert.equal(
    JSON.stringify(
        graph.tasks.find(task => task.id === "foundation")
    ),
    foundationBefore,
    "Foundation contract was modified"
);

const validation = validateTaskGraph(
    graph,
    blueprintResult.data.id
);

if (!validation.valid) {
    console.error("REMAINING VALIDATION ERRORS");

    for (const error of validation.errors) {
        console.error(`${error.path}: ${error.message}`);
    }

    throw new Error(
        "Corrected TaskGraph is still invalid"
    );
}

const outputPath = join(
    dirname(graphPath),
    "task-graph-executable.json"
);

const contents = JSON.stringify(graph, null, 2) + "\n";

// Never silently overwrite an existing reviewed graph.
// Re-running with identical input is allowed.
let existing;

try {
    existing = await readFile(outputPath, "utf8");
} catch (error) {
    if (error.code !== "ENOENT") {
        throw error;
    }
}

if (existing !== undefined) {
    assert.equal(
        existing,
        contents,
        "Existing executable graph differs; review it manually"
    );
} else {
    await writeFile(
        outputPath,
        contents,
        {
            encoding: "utf8",
            flag: "wx"
        }
    );
}

console.log("TASK GRAPH CORRECTION");
console.log("Original:", graphPath);
console.log("Executable:", outputPath);
console.log("Corrections:", JSON.stringify(changes, null, 2));
console.log("Tasks:", graph.tasks.length);
console.log("Foundation: unchanged");
console.log("TASK GRAPH VALIDATION PASSED");
