
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
    copyFile,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    realpath,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const requireFromFreeform = createRequire(
    new URL(
        "../../packages/freeform/package.json",
        import.meta.url
    )
);

const ts = requireFromFreeform("typescript");

const MARKER = "GF_BEHAVIOR_REPORT:";

const EXPECTED_CHECKS = [
    "initial_center_x",
    "initial_horizontal_bounds",
    "idle_no_drift",
    "right_displacement",
    "left_displacement",
    "release_stops_movement",
    "simultaneous_inputs_cancel",
    "y_remains_fixed",
    "left_boundary_clamp",
    "right_boundary_clamp",
    "constant_speed",
    "immediate_direction_reversal",
    "frame_rate_independence"
];

const SOURCE_PATTERN =
    /^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/;

function emit(report, exitCode) {
    process.stdout.write(
        MARKER + JSON.stringify(report) + "\n"
    );

    process.exitCode = exitCode;
}

function infrastructureFailure(error) {
    emit({
        passed: false,
        total: 0,
        failed: 0,
        tests: [],
        infrastructureError:
            error instanceof Error
                ? error.message
                : String(error)
    }, 2);
}

function ensureInside(root, candidate) {
    const relativePath = relative(root, candidate);

    if (
        relativePath === ".." ||
        relativePath.startsWith(".." + sep) ||
        isAbsolute(relativePath)
    ) {
        throw new Error(
            "Path escapes the game workspace"
        );
    }
}

function validateSpec(spec, viewportWidth) {
    assert.equal(
        spec?.kind,
        "horizontal_boolean_controller"
    );

    assert.match(
        spec?.contractDigest,
        /^[a-f0-9]{64}$/
    );

    assert.match(
        spec?.sourcePath,
        SOURCE_PATTERN
    );

    assert.match(
        spec?.speed?.sourcePath,
        SOURCE_PATTERN
    );

    assert.match(
        spec?.className,
        /^[A-Za-z_$][A-Za-z0-9_$]*$/
    );

    assert.equal(
        spec?.update?.method,
        "update"
    );

    assert.equal(
        spec?.update?.deltaArgumentIndex,
        1
    );

    assert.equal(
        spec?.update?.deltaUnit,
        "milliseconds"
    );

    assert.equal(
        spec?.controls?.simultaneous,
        "cancel"
    );

    assert.equal(
        spec?.controls?.released,
        "stop"
    );

    assert.notEqual(
        spec?.controls?.negative,
        spec?.controls?.positive
    );

    for (const name of [
        spec?.controls?.negative,
        spec?.controls?.positive,
        spec?.speed?.exportName,
        spec?.speed?.property
    ]) {
        assert.match(
            name,
            /^[A-Za-z_$][A-Za-z0-9_$]*$/
        );
    }

    assert.ok(
        Number.isFinite(viewportWidth) &&
        viewportWidth > 0
    );

    if (
        spec.speed.unit ===
        "pixels_per_nominal_frame"
    ) {
        assert.ok(
            Number.isSafeInteger(
                spec.speed.referenceFps
            ) &&
            spec.speed.referenceFps >= 1 &&
            spec.speed.referenceFps <= 240
        );
    } else {
        assert.equal(
            spec.speed.unit,
            "pixels_per_second"
        );

        assert.equal(
            spec.speed.referenceFps,
            undefined
        );
    }
}

async function collectSources(workspaceRoot) {
    const root = await realpath(workspaceRoot);

    const src = join(root, "src");
    const srcStat = await lstat(src);

    assert.ok(
        srcStat.isDirectory() &&
        !srcStat.isSymbolicLink(),
        "Workspace src must be a real directory"
    );

    const files = [];

    async function visit(directory) {
        const entries = await readdir(directory, {
            withFileTypes: true
        });

        entries.sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        for (const entry of entries) {
            const absolutePath = join(
                directory,
                entry.name
            );

            ensureInside(root, absolutePath);

            // Never follow symlinks in an AI-written
            // workspace, even when the target exists.
            if (entry.isSymbolicLink()) {
                throw new Error(
                    `Symbolic link rejected: ${entry.name}`
                );
            }

            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }

            if (!entry.isFile()) {
                throw new Error(
                    `Unsupported workspace entry: ${entry.name}`
                );
            }

            if (
                !entry.name.endsWith(".ts") ||
                entry.name.endsWith(".d.ts")
            ) {
                continue;
            }

            const relativePath = relative(
                root,
                absolutePath
            ).replaceAll("\\", "/");

            if (!SOURCE_PATTERN.test(relativePath)) {
                throw new Error(
                    `Unsupported TypeScript path: ${relativePath}`
                );
            }

            files.push({
                absolutePath,
                relativePath
            });

            if (files.length > 128) {
                throw new Error(
                    "Behavior source file count exceeds limit"
                );
            }
        }
    }

    await visit(src);

    if (files.length === 0) {
        throw new Error(
            "No TypeScript sources found in workspace"
        );
    }

    return files;
}

async function buildSnapshot(
    files,
    directory
) {
    let totalBytes = 0;

    for (const file of files) {
        const source = await readFile(
            file.absolutePath,
            "utf8"
        );

        totalBytes += Buffer.byteLength(
            source,
            "utf8"
        );

        if (totalBytes > 1024 * 1024) {
            throw new Error(
                "Behavior source snapshot exceeds 1 MB"
            );
        }

        // Compilation is safe to perform on the host.
        // No generated game JavaScript runs here.
        const output = ts.transpileModule(
            source,
            {
                fileName: file.relativePath,
                compilerOptions: {
                    target: ts.ScriptTarget.ES2022,
                    module: ts.ModuleKind.CommonJS,
                    esModuleInterop: true
                }
            }
        );

        const destination = join(
            directory,
            file.relativePath.replace(
                /\.ts$/,
                ".js"
            )
        );

        await mkdir(
            dirname(destination),
            { recursive: true }
        );

        await writeFile(
            destination,
            output.outputText,
            "utf8"
        );
    }
}

function parseDockerReport(stdout, exitCode) {
    const lines = stdout
        .split(/\r?\n/)
        .filter(line =>
            line.startsWith(MARKER)
        );

    if (lines.length !== 1) {
        throw new Error(
            "Docker must return exactly one behavior report"
        );
    }

    const report = JSON.parse(
        lines[0].slice(MARKER.length)
    );

    if (report.infrastructureError) {
        throw new Error(
            String(report.infrastructureError)
        );
    }

    if (
        !Array.isArray(report.tests) ||
        report.total !== EXPECTED_CHECKS.length ||
        report.tests.length !== EXPECTED_CHECKS.length ||
        !Number.isSafeInteger(report.failed)
    ) {
        throw new Error(
            "Incomplete behavior verification report"
        );
    }

    for (let i = 0; i < EXPECTED_CHECKS.length; i++) {
        const test = report.tests[i];

        if (
            test?.name !== EXPECTED_CHECKS[i] ||
            typeof test.passed !== "boolean"
        ) {
            throw new Error(
                "Unexpected behavior check identity"
            );
        }
    }

    const failureCount = report.tests.filter(
        test => !test.passed
    ).length;

    if (
        report.failed !== failureCount ||
        report.passed !== (failureCount === 0)
    ) {
        throw new Error(
            "Inconsistent behavior verification result"
        );
    }

    if (
        exitCode !== (report.passed ? 0 : 1)
    ) {
        throw new Error(
            "Docker exit code disagrees with behavior report"
        );
    }

    return report;
}

async function runDocker(directory) {
    const image =
        process.env.FREEFORM_DOCKER_IMAGE ??
        "node:22-alpine";

    const docker =
        process.env.FREEFORM_DOCKER_EXECUTABLE ??
        "docker";

    const containerName =
        `gf-behavior-${randomUUID()}`;

    // Docker's mount syntax uses commas as delimiters.
    if (/[\r\n,]/.test(directory)) {
        throw new Error(
            "Unsupported Docker mount directory"
        );
    }

    const args = [
        "run",
        "--rm",
        "--pull", "never",
        "--name", containerName,
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
        `type=bind,source=${directory},target=/verify,readonly`,
        "--workdir", "/verify",
        image,
        "node",
        "/verify/runner.mjs"
    ];

    let stdout = "";
    let stderr = "";
    let exitCode;

    try {
        const result = await execFileAsync(
            docker,
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
        exitCode = 0;
    } catch (error) {
        stdout = error.stdout ?? "";
        stderr = error.stderr ??
            error.message;

        exitCode =
            typeof error.code === "number"
                ? error.code
                : undefined;

        // Killing the Docker CLI may not kill a
        // container still running in the daemon.
        // Explicit daemon-side cleanup is required.
        try {
            await execFileAsync(
                docker,
                ["rm", "-f", containerName],
                {
                    windowsHide: true,
                    timeout: 15000
                }
            );
        } catch {
            // No container may exist, or it may
            // already have been removed by --rm.
        }
    }

    try {
        return parseDockerReport(
            stdout,
            exitCode
        );
    } catch (error) {
        throw new Error(
            `${error.message}\n${stderr.slice(0, 4000)}`
        );
    }
}

async function main() {
    const [
        workspaceRoot,
        specPath,
        viewportArgument
    ] = process.argv.slice(2);

    if (
        !workspaceRoot ||
        !specPath ||
        !isAbsolute(workspaceRoot) ||
        !isAbsolute(specPath)
    ) {
        throw new Error(
            "Usage: verify-horizontal-workspace.mjs " +
            "<workspace-root> <spec-path> <viewport-width>"
        );
    }

    const viewportWidth = Number(
        viewportArgument
    );

    const spec = JSON.parse(
        await readFile(specPath, "utf8")
    );

    validateSpec(spec, viewportWidth);

    const files = await collectSources(
        resolve(workspaceRoot)
    );

    const paths = new Set(
        files.map(file => file.relativePath)
    );

    if (
        !paths.has(spec.sourcePath) ||
        !paths.has(spec.speed.sourcePath)
    ) {
        throw new Error(
            "Behavior target or speed source is missing"
        );
    }

    const temp = await mkdtemp(
        join(tmpdir(), "gf-behavior-workspace-")
    );

    try {
        await buildSnapshot(files, temp);

        const harness = fileURLToPath(
            new URL(
                "./run-horizontal-controller.mjs",
                import.meta.url
            )
        );

        await copyFile(
            harness,
            join(temp, "runner.mjs")
        );

        await writeFile(
            join(temp, "context.json"),
            JSON.stringify({
                spec,
                viewportWidth
            }),
            "utf8"
        );

        return await runDocker(temp);
    } finally {
        await rm(temp, {
            recursive: true,
            force: true
        });
    }
}

try {
    const report = await main();

    emit(
        report,
        report.passed ? 0 : 1
    );
} catch (error) {
    infrastructureFailure(error);
}
