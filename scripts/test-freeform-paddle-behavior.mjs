
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

import {
    createTaskGraphDigest,
    validateFreeformBlueprint,
    validateTaskGraph,
    validateExecutableBehaviorSpec
} from "../packages/freeform/dist/index.js";

const execFileAsync = promisify(execFile);

const requireFromFreeform = createRequire(
    new URL("../packages/freeform/package.json", import.meta.url)
);

const ts = requireFromFreeform("typescript");

const [
    blueprintPath,
    graphPath,
    contractPath,
    specPath,
    gameRoot
] = process.argv.slice(2);

if (
    [
        blueprintPath,
        graphPath,
        contractPath,
        specPath,
        gameRoot
    ].some(path => !path || !isAbsolute(path))
) {
    throw new Error(
        "Usage: node scripts/test-freeform-paddle-behavior.mjs " +
        "<blueprint> <graph> <contract> <spec> <game-root>"
    );
}

async function json(path) {
    return JSON.parse(await readFile(path, "utf8"));
}

async function git(...args) {
    return execFileAsync(
        "git",
        ["-C", gameRoot, ...args],
        {
            encoding: "utf8",
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024
        }
    );
}

const originalHead = (
    await git("rev-parse", "HEAD")
).stdout.trim();

assert.equal(
    originalHead,
    "7445e16743aa66b5b9569f53b97260c9edcb5efb",
    "This diagnostic E2E targets the accepted buggy Paddle commit"
);

const originalStatus = (
    await git(
        "status",
        "--porcelain=v1",
        "--untracked-files=all"
    )
).stdout.trim();

assert.equal(
    originalStatus,
    "",
    "Game repository must be clean"
);

const blueprintResult = validateFreeformBlueprint(
    await json(blueprintPath)
);

assert.equal(blueprintResult.valid, true);
const blueprint = blueprintResult.data;

const graphResult = validateTaskGraph(
    await json(graphPath),
    blueprint.id
);

assert.equal(graphResult.valid, true);
const graph = graphResult.data;

const contract = await json(contractPath);
const spec = await json(specPath);

assert.equal(contract.blueprintId, blueprint.id);
assert.equal(contract.graphRevision, graph.revision);
assert.equal(
    contract.graphDigest,
    createTaskGraphDigest(graph)
);
assert.equal(contract.taskId, "paddle");

const task = graph.tasks.find(
    item => item.id === "paddle"
);

assert.ok(task);

const validation = validateExecutableBehaviorSpec(
    spec,
    task,
    contract
);

if (!validation.valid) {
    throw new Error(
        "Invalid executable behavior: " +
        JSON.stringify(validation.errors)
    );
}

assert.equal(
    spec.kind,
    "horizontal_boolean_controller"
);

assert.equal(
    spec.className,
    "Paddle"
);

const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "gf-behavior-")
);

try {
    const tracked = (
        await git("ls-files", "-z", "--", "src")
    ).stdout;

    const sourceFiles = tracked
        .split("\0")
        .filter(path =>
            path.endsWith(".ts") &&
            !path.endsWith(".d.ts")
        );

    assert.ok(
        sourceFiles.length > 0 &&
        sourceFiles.length <= 128,
        "Unexpected source file count"
    );

    let totalSourceBytes = 0;

    for (const sourcePath of sourceFiles) {
        assert.match(
            sourcePath,
            /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/
        );

        const source = (
            await git("show", `HEAD:${sourcePath}`)
        ).stdout;

        totalSourceBytes += Buffer.byteLength(
            source,
            "utf8"
        );

        assert.ok(
            totalSourceBytes <= 1024 * 1024,
            "Source bundle is too large"
        );

        // This is compilation only. No game code
        // is executed in the host Node process.
        const transpiled = ts.transpileModule(
            source,
            {
                fileName: sourcePath,
                compilerOptions: {
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.CommonJS,
                    esModuleInterop: true
                }
            }
        );

        const output = join(
            temporaryDirectory,
            sourcePath.replace(/\.ts$/, ".js")
        );

        await mkdir(dirname(output), {
            recursive: true
        });

        await writeFile(
            output,
            transpiled.outputText,
            "utf8"
        );
    }

    const harnessPath = fileURLToPath(
        new URL(
            "./verification/run-horizontal-controller.mjs",
            import.meta.url
        )
    );

    await copyFile(
        harnessPath,
        join(temporaryDirectory, "runner.mjs")
    );

    await writeFile(
        join(temporaryDirectory, "context.json"),
        JSON.stringify({
            spec,
            viewportWidth: blueprint.viewport.width
        }),
        "utf8"
    );

    const image =
        process.env.FREEFORM_DOCKER_IMAGE ??
        "node:22-alpine";

    const args = [
        "run",
        "--rm",
        "--pull", "never",
        "--network", "none",
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--pids-limit", "64",
        "--memory", "512m",
        "--cpus", "1",
        "--user", "65534:65534",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=32m",
        "--mount",
        `type=bind,source=${temporaryDirectory},target=/verify,readonly`,
        "--workdir", "/verify",
        image,
        "node",
        "/verify/runner.mjs"
    ];

    console.log("\nBEHAVIOR VERIFICATION E2E");
    console.log("Game:", blueprint.title);
    console.log("Task:", task.id);
    console.log("Game HEAD:", originalHead);
    console.log("Docker image:", image);
    console.log("Behavior:", spec.kind);

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
        const result = await execFileAsync(
            process.env.FREEFORM_DOCKER_EXECUTABLE ??
                "docker",
            args,
            {
                encoding: "utf8",
                windowsHide: true,
                timeout: 60000,
                maxBuffer: 2 * 1024 * 1024
            }
        );

        stdout = result.stdout;
        stderr = result.stderr;
    } catch (error) {
        stdout = error.stdout ?? "";
        stderr = error.stderr ?? "";
        exitCode = error.code;
    }

    const match = stdout.match(
        /^GF_BEHAVIOR_REPORT:(.+)$/m
    );

    if (!match) {
        throw new Error(
            "Docker verification infrastructure failed:\n" +
            stderr + "\n" + stdout
        );
    }

    const report = JSON.parse(match[1]);

    if (
        report.infrastructureError ||
        !Array.isArray(report.tests)
    ) {
        throw new Error(
            "Behavior runner infrastructure error: " +
            (report.infrastructureError ?? "Invalid report")
        );
    }

    assert.equal(
        exitCode,
        report.passed ? 0 : 1,
        "Docker exit code does not match test report"
    );

    console.log("\nBEHAVIOR TEST RESULTS");

    for (const test of report.tests) {
        console.log(
            `${test.passed ? "PASS" : "FAIL"} ${test.name}` +
            (test.error ? `: ${test.error}` : "")
        );
    }

    console.log("\nSUMMARY");
    console.log("Total:", report.total);
    console.log("Failed:", report.failed);
    console.log(
        "Speed px/s:",
        report.speedPixelsPerSecond
    );

    assert.equal(report.total, 13);

    // This E2E deliberately targets the existing
    // accepted implementation with known defects.
    assert.equal(
        report.passed,
        false,
        "Expected the known buggy Paddle to fail behavior tests"
    );

    assert.ok(
        report.failed > 0,
        "At least one behavioral defect must be detected"
    );

    assert.equal(
        (await git("rev-parse", "HEAD")).stdout.trim(),
        originalHead
    );

    assert.equal(
        (
            await git(
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
            )
        ).stdout.trim(),
        originalStatus
    );

    console.log(
        "\nBEHAVIOR DEFECTS DETECTED — E2E PASSED"
    );
} finally {
    await rm(temporaryDirectory, {
        recursive: true,
        force: true
    });
}
