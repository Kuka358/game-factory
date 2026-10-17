
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from "vitest";

import {
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
    VerificationInput,
    VerificationReport,
    Verifier
} from "@game-factory/autonomy";

import {
    BehaviorAcceptanceVerifier
} from "../src/autonomy/BehaviorAcceptanceVerifier.js";

const TASK_ID = "paddle_semantic_repair";

const CHECK_NAMES = [
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
] as const;

const KNOWN_FAILURES = [
    "initial_center_x",
    "right_displacement",
    "left_displacement",
    "simultaneous_inputs_cancel",
    "left_boundary_clamp",
    "right_boundary_clamp",
    "constant_speed",
    "immediate_direction_reversal",
    "frame_rate_independence"
] as const;

interface MockBehaviorReport {
    passed: boolean;
    total: number;
    failed: number;

    tests: Array<{
        name: string;
        passed: boolean;
        error?: string;
    }>;

    infrastructureError?: string;
}

let temporaryRoot: string;

beforeEach(async () => {
    temporaryRoot = await mkdtemp(
        join(tmpdir(), "gf-behavior-verifier-test-")
    );
});

afterEach(async () => {
    await rm(temporaryRoot, {
        recursive: true,
        force: true
    });
});

function makeReport(
    failures: readonly string[] = []
): MockBehaviorReport {
    const failedNames = new Set(failures);

    return {
        passed: failures.length === 0,
        total: CHECK_NAMES.length,
        failed: failures.length,

        tests: CHECK_NAMES.map(name => ({
            name,
            passed: !failedNames.has(name),

            ...(failedNames.has(name)
                ? {
                    error: `${name}: incorrect movement`
                }
                : {})
        }))
    };
}

function makeInput(
    taskId: string = TASK_ID
): VerificationInput {
    return {
        run: {
            id: "test-run",
            goal: "Repair Paddle movement",
            status: "verifying",
            currentIteration: 0,
            maxIterations: 3,
            iterations: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
        },

        contract: {
            id: taskId,
            objective: "Repair horizontal movement",
            rationale: "Behavioral acceptance",
            scope: {
                allowedPaths: [
                    "src/game/Paddle.ts"
                ],
                forbiddenPaths: []
            },
            changes: [{
                description: "Fix movement behavior"
            }],
            acceptanceCriteria: [
                "Movement is frame-rate independent"
            ],
            verification: [{
                id: "technical-check",
                command: "verify:tsc",
                required: true
            }],
            architecturalConstraints: [],
            maxLocalAttempts: 2,
            escalation: {
                onRepeatedFailure: true,
                onArchitectureConflict: true,
                maxRepairRounds: 1
            }
        },

        attempt: 1,

        workerResult: {
            summary: "Updated Paddle implementation",
            changedFiles: [
                "src/game/Paddle.ts"
            ]
        },

        workspace: {
            id: "test-worktree",
            root: temporaryRoot,
            baseRevision: "a".repeat(40)
        }
    };
}

function makeTechnicalVerifier(
    passed: boolean
): Verifier {
    return {
        async verify(): Promise<VerificationReport> {
            return {
                passed,
                checks: [{
                    id: "technical-check",
                    command: "verify:tsc",
                    passed,
                    exitCode: passed ? 0 : 1,
                    stdout: passed
                        ? "TypeScript passed"
                        : "",
                    stderr: passed
                        ? ""
                        : "TypeScript failed"
                }]
            };
        }
    };
}

function makeVerifier(options: {
    technicalPassed?: boolean;
    required?: boolean;
    binding?: boolean;
} = {}): BehaviorAcceptanceVerifier {
    return new BehaviorAcceptanceVerifier({
        technicalVerifier: makeTechnicalVerifier(
            options.technicalPassed ?? true
        ),

        runnerScriptPath: join(
            temporaryRoot,
            "fake-runner.mjs"
        ),

        requiredTaskIds:
            options.required === false
                ? []
                : [TASK_ID],

        bindings:
            options.binding === false ||
            options.required === false
                ? {}
                : {
                    [TASK_ID]: {
                        specPath: join(
                            temporaryRoot,
                            "spec.json"
                        ),
                        viewportWidth: 800
                    }
                },

        timeoutMs: 10_000
    });
}

async function writeFakeRunner(
    report: MockBehaviorReport | null,
    exitCode: number
): Promise<void> {
    const marker = join(
        temporaryRoot,
        "runner-invoked.json"
    );

    const source = [
        'import { writeFileSync } from "node:fs";',

        `writeFileSync(
            ${JSON.stringify(marker)},
            JSON.stringify(process.argv.slice(2))
        );`,

        ...(report === null
            ? ['console.log("No behavior report");']
            : [
                `console.log(${
                    JSON.stringify(
                        "GF_BEHAVIOR_REPORT:" +
                        JSON.stringify(report)
                    )
                });`
            ]),

        `process.exitCode = ${exitCode};`
    ].join("\n");

    await writeFile(
        join(temporaryRoot, "fake-runner.mjs"),
        source,
        "utf8"
    );
}

describe("BehaviorAcceptanceVerifier", () => {
    it("preserves technical checks for non-required tasks", async () => {
        const verifier = makeVerifier({
            required: false
        });

        const result = await verifier.verify(
            makeInput("foundation")
        );

        expect(result.passed).toBe(true);
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.id).toBe(
            "technical-check"
        );
    });

    it("does not execute behavior when TypeScript fails", async () => {
        const verifier = makeVerifier({
            technicalPassed: false
        });

        const result = await verifier.verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.passed).toBe(false);
    });

    it("fails closed when a required spec is missing", async () => {
        const verifier = makeVerifier({
            binding: false
        });

        const result = await verifier.verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks).toHaveLength(2);

        expect(result.checks[1]).toMatchObject({
            id: `${TASK_ID}-behavior`,
            command: "verify:behavior",
            passed: false
        });

        expect(result.checks[1]?.stderr).toContain(
            "Required behavior spec"
        );
    });

    it("fails closed when workspace is missing", async () => {
        const verifier = makeVerifier();

        const input = makeInput();
        delete input.workspace;

        const result = await verifier.verify(input);

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
    });

    it("accepts all 13 passing behavior checks", async () => {
        await writeFakeRunner(
            makeReport(),
            0
        );

        const verifier = makeVerifier();

        const result = await verifier.verify(
            makeInput()
        );

        expect(result.passed).toBe(true);
        expect(result.checks).toHaveLength(2);

        expect(result.checks[0]?.passed).toBe(true);
        expect(result.checks[1]?.passed).toBe(true);
        expect(result.checks[1]?.exitCode).toBe(0);

        const argumentsPassed = JSON.parse(
            await readFile(
                join(
                    temporaryRoot,
                    "runner-invoked.json"
                ),
                "utf8"
            )
        ) as string[];

        expect(argumentsPassed).toEqual([
            temporaryRoot,
            join(temporaryRoot, "spec.json"),
            "800"
        ]);
    });

    it("rejects the nine known Paddle behavior defects", async () => {
        await writeFakeRunner(
            makeReport(KNOWN_FAILURES),
            1
        );

        const verifier = makeVerifier();

        const result = await verifier.verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks).toHaveLength(2);

        // Compilation succeeded, but behavior failed.
        expect(result.checks[0]?.passed).toBe(true);
        expect(result.checks[1]?.passed).toBe(false);

        expect(result.checks[1]?.exitCode).toBe(1);
        expect(result.checks[1]?.stderr).toContain(
            "initial_center_x"
        );
        expect(result.checks[1]?.stderr).toContain(
            "frame_rate_independence"
        );

        const output = JSON.parse(
            result.checks[1]!.stdout!
        ) as {
            total: number;
            failed: number;
        };

        expect(output.total).toBe(13);
        expect(output.failed).toBe(9);
    });

    it("rejects infrastructure errors", async () => {
        const report = makeReport([
            "initial_center_x"
        ]);

        report.infrastructureError =
            "Docker daemon unavailable";

        await writeFakeRunner(report, 2);

        const result = await makeVerifier().verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
        expect(result.checks[1]?.stderr).toContain(
            "Docker daemon unavailable"
        );
    });

    it("rejects incomplete behavior reports", async () => {
        const report = makeReport();

        report.tests.pop();
        report.total = 12;

        await writeFakeRunner(report, 0);

        const result = await makeVerifier().verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
        expect(result.checks[1]?.stderr).toContain(
            "Incomplete or inconsistent"
        );
    });

    it("rejects a runner that emits no report", async () => {
        await writeFakeRunner(null, 0);

        const result = await makeVerifier().verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
        expect(result.checks[1]?.stderr).toContain(
            "did not return a verification report"
        );
    });

    it("rejects passing results with a failing process exit", async () => {
        await writeFakeRunner(
            makeReport(),
            1
        );

        const result = await makeVerifier().verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
        expect(result.checks[1]?.exitCode).toBe(1);
    });

    it("rejects forged behavior check identities", async () => {
        const report = makeReport();

        report.tests[0]!.name = "fake_success_check";

        await writeFakeRunner(report, 0);

        const result = await makeVerifier().verify(
            makeInput()
        );

        expect(result.passed).toBe(false);
        expect(result.checks[1]?.passed).toBe(false);
        expect(result.checks[1]?.stderr).toContain(
            "Incomplete or inconsistent"
        );
    });
});
