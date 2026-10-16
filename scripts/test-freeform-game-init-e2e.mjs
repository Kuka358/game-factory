
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
    access,
    mkdtemp,
    readFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
    isAbsolute,
    join
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
    FreeformDependencyProvisioner,
    FreeformGameInitializer
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const [blueprintPath, dockerExecutable] =
    process.argv.slice(2);

if (
    !blueprintPath ||
    !isAbsolute(blueprintPath) ||
    !dockerExecutable ||
    !isAbsolute(dockerExecutable)
) {
    throw new Error(
        "Usage: node scripts/test-freeform-game-init-e2e.mjs " +
        "<absolute-blueprint-path> <absolute-docker-path>"
    );
}

const image = "game-factory-freeform-verifier:pr2";

const blueprint = JSON.parse(
    await readFile(blueprintPath, "utf8")
);

const gamesDirectory = await mkdtemp(
    join(tmpdir(), "gf-freeform-init-e2e-")
);

const provisioner = new FreeformDependencyProvisioner({
    dockerExecutable,
    image,
    storeVolume: "game-factory-freeform-pnpm-store"
});

const initializer = new FreeformGameInitializer({
    gamesDirectory,
    provisioner
});

console.log("Initializing game from saved Blueprint...");

const workspace = await initializer.create(blueprint);

console.log("GAME INITIALIZED");
console.log("Workspace:", workspace.root);
console.log("HEAD:", workspace.headSha);

await access(
    join(workspace.root, "pnpm-lock.yaml")
);

const git = async args => {
    const { stdout } = await execFileAsync(
        "git",
        args,
        {
            cwd: workspace.root,
            windowsHide: true,
            encoding: "utf8"
        }
    );

    return stdout.trim();
};

const history = (
    await git(["log", "-2", "--format=%s"])
).split(/\r?\n/);

assert.deepEqual(history, [
    "chore: lock game dependencies",
    "chore: bootstrap freeform game"
]);

assert.equal(
    await git(["status", "--porcelain=v1"]),
    ""
);

assert.equal(
    await git(["rev-parse", "HEAD"]),
    workspace.headSha
);

console.log("PASS lockfile committed");
console.log("PASS clean Git repository");
console.log("PASS initial Git history");

const smokeScript = fileURLToPath(
    new URL(
        "./test-freeform-docker-verifier.mjs",
        import.meta.url
    )
);

console.log("Running full Docker verification...");

await new Promise((resolve, reject) => {
    const child = spawn(
        process.execPath,
        [
            smokeScript,
            workspace.root,
            dockerExecutable
        ],
        {
            stdio: "inherit",
            windowsHide: true
        }
    );

    child.once("error", reject);

    child.once("close", code => {
        if (code === 0) {
            resolve();
        } else {
            reject(
                new Error(
                    `Docker smoke failed with exit code ${code}`
                )
            );
        }
    });
});

assert.equal(
    await git(["status", "--porcelain=v1"]),
    ""
);

console.log("PASS repository remains clean");
console.log("");
console.log("FULL FREEFORM GAME INITIALIZATION E2E PASSED");
console.log("Generated game:", workspace.root);
