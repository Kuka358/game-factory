
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = "/verify/src";
const MARKER = "GF_BEHAVIOR_REPORT:";

const config = JSON.parse(
    fs.readFileSync("/verify/context.json", "utf8")
);

const { spec, viewportWidth } = config;
const cache = new Map();

function loadModule(filename) {
    const absolute = path.resolve(filename);
    const real = fs.realpathSync(absolute);

    if (
        !real.startsWith(ROOT + "/") ||
        !real.endsWith(".js")
    ) {
        throw new Error("Module outside verified source scope");
    }

    if (cache.has(real)) {
        return cache.get(real).exports;
    }

    const module = { exports: {} };
    cache.set(real, module);

    function restrictedRequire(request) {
        if (!request.startsWith(".")) {
            throw new Error(
                `Unsupported external import: ${request}`
            );
        }

        const base = path.resolve(
            path.dirname(real),
            request
        );

        const candidates = [
            base,
            base + ".js",
            path.join(base, "index.js")
        ];

        const resolved = candidates.find(candidate =>
            fs.existsSync(candidate) &&
            fs.statSync(candidate).isFile()
        );

        if (!resolved) {
            throw new Error(
                `Unresolved relative import: ${request}`
            );
        }

        return loadModule(resolved);
    }

    // VM is a module-loading convenience, not a security
    // boundary. Docker provides process isolation.
    const context = vm.createContext({
        console: {
            log() {},
            warn() {},
            error() {}
        }
    });

    const source = fs.readFileSync(real, "utf8");

    const wrapper = new vm.Script(
        `(function(exports, require, module) {
            ${source}
        })`,
        { filename: real }
    );

    const execute = wrapper.runInContext(context, {
        timeout: 2000
    });

    execute(
        module.exports,
        restrictedRequire,
        module
    );

    return module.exports;
}

function jsPath(sourcePath) {
    if (!/^src\/[A-Za-z0-9_./-]+\.ts$/.test(sourcePath)) {
        throw new Error("Unsupported source path");
    }

    return path.join(
        "/verify",
        sourcePath.replace(/\.ts$/, ".js")
    );
}

function approximately(actual, expected, label) {
    const tolerance = Math.max(
        1e-6,
        Math.abs(expected) * 1e-6
    );

    assert.ok(
        Number.isFinite(actual) &&
        Math.abs(actual - expected) <= tolerance,
        `${label}: expected ${expected}, got ${actual}`
    );
}

function runVerification() {
    const target = loadModule(
        jsPath(spec.sourcePath)
    );

    const constants = loadModule(
        jsPath(spec.speed.sourcePath)
    );

    const Controller = target[spec.className];

    assert.equal(
        typeof Controller,
        "function",
        `Class ${spec.className} was not exported`
    );

    const speedObject =
        constants[spec.speed.exportName];

    assert.ok(
        speedObject &&
        typeof speedObject === "object",
        "Speed constant export not found"
    );

    const rawSpeed = speedObject[
        spec.speed.property
    ];

    assert.ok(
        typeof rawSpeed === "number" &&
        Number.isFinite(rawSpeed) &&
        rawSpeed > 0,
        "Speed must be a positive finite number"
    );

    const speed = spec.speed.unit ===
        "pixels_per_nominal_frame"
        ? rawSpeed * spec.speed.referenceFps
        : rawSpeed;

    assert.ok(
        Number.isFinite(speed) && speed > 0,
        "Resolved speed is invalid"
    );

    function create() {
        const object = new Controller();

        assert.ok(
            Number.isFinite(object.x) &&
            Number.isFinite(object.y) &&
            Number.isFinite(object.width) &&
            object.width > 0 &&
            object.width < viewportWidth,
            "Invalid controller geometry"
        );

        return object;
    }

    function update(
        object,
        left,
        right,
        deltaMs
    ) {
        const input = {
            [spec.controls.negative]: left,
            [spec.controls.positive]: right
        };

        object[spec.update.method](
            input,
            deltaMs
        );
    }

    const probe = create();
    const available = (
        viewportWidth - probe.width
    ) / 2;

    const shortDelta = Math.min(
        100,
        available * 0.2 / speed * 1000
    );

    assert.ok(shortDelta > 0);

    const tests = [];

    function check(name, fn) {
        try {
            fn();

            tests.push({
                name,
                passed: true
            });
        } catch (error) {
            tests.push({
                name,
                passed: false,
                error: error instanceof Error
                    ? error.message
                    : String(error)
            });
        }
    }

    check("initial_center_x", () => {
        const p = create();

        approximately(
            p.x,
            viewportWidth / 2,
            "Initial X"
        );
    });

    check("initial_horizontal_bounds", () => {
        const p = create();

        assert.ok(
            p.x >= p.width / 2 &&
            p.x <= viewportWidth - p.width / 2
        );
    });

    check("idle_no_drift", () => {
        const p = create();
        const x = p.x;
        const y = p.y;

        for (let i = 0; i < 10; i++) {
            update(p, false, false, shortDelta);
        }

        approximately(p.x, x, "Idle X");
        approximately(p.y, y, "Idle Y");
    });

    check("right_displacement", () => {
        const p = create();
        const before = p.x;

        update(p, false, true, shortDelta);

        approximately(
            p.x,
            before + speed * shortDelta / 1000,
            "Right displacement"
        );
    });

    check("left_displacement", () => {
        const p = create();
        const before = p.x;

        update(p, true, false, shortDelta);

        approximately(
            p.x,
            before - speed * shortDelta / 1000,
            "Left displacement"
        );
    });

    check("release_stops_movement", () => {
        const p = create();

        update(p, false, true, shortDelta);
        const x = p.x;

        for (let i = 0; i < 5; i++) {
            update(p, false, false, shortDelta);
        }

        approximately(p.x, x, "Released X");
    });

    check("simultaneous_inputs_cancel", () => {
        const p = create();
        const x = p.x;

        update(p, true, true, shortDelta);

        approximately(p.x, x, "Both inputs");
    });

    check("y_remains_fixed", () => {
        const p = create();
        const y = p.y;

        update(p, true, false, shortDelta);
        update(p, false, true, shortDelta);
        update(p, false, false, shortDelta);

        approximately(p.y, y, "Fixed Y");
    });

    check("left_boundary_clamp", () => {
        const p = create();

        update(p, true, false, 100_000);

        approximately(
            p.x,
            p.width / 2,
            "Left boundary"
        );
    });

    check("right_boundary_clamp", () => {
        const p = create();

        update(p, false, true, 100_000);

        approximately(
            p.x,
            viewportWidth - p.width / 2,
            "Right boundary"
        );
    });

    check("constant_speed", () => {
        const p = create();

        const x0 = p.x;
        update(p, false, true, shortDelta);
        const x1 = p.x;
        update(p, false, true, shortDelta);
        const x2 = p.x;

        approximately(
            x2 - x1,
            x1 - x0,
            "Constant speed"
        );
    });

    check("immediate_direction_reversal", () => {
        const p = create();

        update(p, false, true, shortDelta);
        const x = p.x;

        update(p, true, false, shortDelta);

        approximately(
            p.x,
            x - speed * shortDelta / 1000,
            "Reversed movement"
        );
    });

    check("frame_rate_independence", () => {
        const totalMs = Math.min(
            300,
            available * 0.4 / speed * 1000
        );

        const a = create();
        const b = create();

        for (let i = 0; i < 30; i++) {
            update(a, false, true, totalMs / 30);
        }

        for (let i = 0; i < 10; i++) {
            update(b, false, true, totalMs / 10);
        }

        approximately(
            a.x,
            b.x,
            "Different frame subdivisions"
        );

        approximately(
            a.x,
            viewportWidth / 2 + speed * totalMs / 1000,
            "Time-based displacement"
        );
    });

    return {
        passed: tests.every(test => test.passed),
        total: tests.length,
        failed: tests.filter(test => !test.passed).length,
        speedPixelsPerSecond: speed,
        tests
    };
}

try {
    const report = runVerification();

    console.log(
        MARKER + JSON.stringify(report)
    );

    process.exitCode = report.passed ? 0 : 1;
} catch (error) {
    console.log(
        MARKER + JSON.stringify({
            passed: false,
            infrastructureError:
                error instanceof Error
                    ? error.message
                    : String(error),
            tests: []
        })
    );

    process.exitCode = 2;
}
