
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    FreeformWorkspaceBootstrapper
} from "../packages/freeform/dist/index.js";

const blueprintPath = process.argv[2];

if (!blueprintPath) {
    throw new Error(
        "Usage: node scripts/test-freeform-workspace-smoke.mjs <blueprint.json>"
    );
}

const blueprint = JSON.parse(
    await readFile(blueprintPath, "utf8")
);

const gamesDirectory = await mkdtemp(
    join(tmpdir(), "game-factory-freeform-pr2-")
);

const bootstrapper = new FreeformWorkspaceBootstrapper({
    gamesDirectory
});

const result = await bootstrapper.create(blueprint);

// Machine-readable output for PowerShell.
console.log(JSON.stringify(result));
