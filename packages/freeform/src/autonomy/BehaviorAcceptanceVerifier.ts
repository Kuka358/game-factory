
import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import type {
    Verifier,
    VerificationInput,
    VerificationReport,
    VerificationCheckResult
} from "@game-factory/autonomy";

const execFileAsync = promisify(execFile);

const REPORT_MARKER = "GF_BEHAVIOR_REPORT:";

const EXPECTED_CHECK_NAMES = [
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

export interface BehaviorVerificationBinding {
    specPath: string;
    viewportWidth: number;
}

export interface BehaviorAcceptanceVerifierOptions {
    technicalVerifier: Verifier;

    // Absolute path to a trusted host-side script
    // that prepares an isolated Docker test run.
    runnerScriptPath: string;

    // Tasks for which behavior verification is mandatory.
    requiredTaskIds: readonly string[];

    // Specs are registered by the trusted orchestrator.
    bindings: Readonly<
        Record<string, BehaviorVerificationBinding>
    >;

    timeoutMs?: number;
}

interface BehaviorReport {
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

function parseReport(output: string): BehaviorReport {
    const line = output
        .split(/\r?\n/)
        .find(item =>
            item.startsWith(REPORT_MARKER)
        );

    if (!line) {
        throw new Error(
            "Behavior runner did not return a verification report"
        );
    }

    const value: unknown = JSON.parse(
        line.slice(REPORT_MARKER.length)
    );

    if (
        typeof value !== "object" ||
        value === null ||
        !("tests" in value) ||
        !Array.isArray(value.tests) ||
        !("passed" in value) ||
        typeof value.passed !== "boolean" ||
        !("total" in value) ||
        !Number.isSafeInteger(value.total) ||
        !("failed" in value) ||
        !Number.isSafeInteger(value.failed)
    ) {
        throw new Error("Malformed behavior report");
    }

    const report = value as BehaviorReport;

    if (
        report.total !== 13 ||
        report.tests.length !== 13 ||
        report.failed !== report.tests.filter(
            test => !test.passed
        ).length ||
        report.tests.some((test, index) =>
            typeof test?.name !== "string" ||
            typeof test?.passed !== "boolean" ||
            test.name !== EXPECTED_CHECK_NAMES[index]
        ) ||
        report.passed !== (report.failed === 0)
    ) {
        throw new Error(
            "Incomplete or inconsistent behavior report"
        );
    }

    return report;
}

export class BehaviorAcceptanceVerifier
    implements Verifier
{
    private readonly required: ReadonlySet<string>;

    constructor(
        private readonly options:
            BehaviorAcceptanceVerifierOptions
    ) {
        if (!isAbsolute(options.runnerScriptPath)) {
            throw new Error(
                "Behavior runner path must be absolute"
            );
        }

        this.required = new Set(
            options.requiredTaskIds
        );

        for (const [taskId, binding] of
            Object.entries(options.bindings)) {
            if (!this.required.has(taskId)) {
                throw new Error(
                    `Unexpected behavior binding: ${taskId}`
                );
            }

            if (
                !isAbsolute(binding.specPath) ||
                !Number.isFinite(binding.viewportWidth) ||
                binding.viewportWidth <= 0
            ) {
                throw new Error(
                    `Invalid behavior binding: ${taskId}`
                );
            }
        }
    }

    async verify(
        input: VerificationInput
    ): Promise<VerificationReport> {
        const technical =
            await this.options.technicalVerifier.verify(
                input
            );

        // Do not run gameplay tests on code that
        // fails the technical verification gate.
        if (!technical.passed) {
            return technical;
        }

        const taskId = input.contract.id;

        if (!this.required.has(taskId)) {
            return technical;
        }

        const binding = this.options.bindings[taskId];

        if (!binding || !input.workspace) {
            return this.appendCheck(technical, {
                id: `${taskId}-behavior`,
                command: "verify:behavior",
                passed: false,
                stderr:
                    "Required behavior spec or isolated workspace missing"
            });
        }

        const startedAt = Date.now();

        let stdout = "";
        let stderr = "";
        let exitCode: number | undefined;

        try {
            const result = await execFileAsync(
                process.execPath,
                [
                    this.options.runnerScriptPath,
                    input.workspace.root,
                    binding.specPath,
                    String(binding.viewportWidth)
                ],
                {
                    timeout:
                        this.options.timeoutMs ?? 90000,
                    windowsHide: true,
                    maxBuffer: 1024 * 1024
                }
            );

            stdout = result.stdout;
            stderr = result.stderr;
            exitCode = 0;
        } catch (error) {
            const failure = error as Error & {
                stdout?: string;
                stderr?: string;
                code?: string | number;
            };

            stdout = failure.stdout ?? "";
            stderr = failure.stderr ??
                failure.message;

            exitCode = typeof failure.code === "number"
                ? failure.code
                : undefined;
        }

        let check: VerificationCheckResult;

        try {
            const report = parseReport(stdout);

            const passed =
                report.passed &&
                exitCode === 0 &&
                !report.infrastructureError;

            const failures = report.tests
                .filter(test => !test.passed)
                .map(test =>
                    `${test.name}: ${test.error ?? "failed"}`
                );

            check = {
                id: `${taskId}-behavior`,
                command: "verify:behavior",
                passed,
                exitCode,
                stdout: JSON.stringify({
                    total: report.total,
                    failed: report.failed,
                    tests: report.tests
                }).slice(0, 16000),
                stderr: (
                    report.infrastructureError ??
                    (
                        failures.length > 0
                            ? failures.join("\n")
                            : (
                                passed
                                    ? ""
                                    : (
                                        stderr.trim() ||
                                        `Behavior runner exited with code ${exitCode ?? "unknown"}`
                                    )
                            )
                    )
                ).slice(0, 16000),
                durationMs: Date.now() - startedAt
            };
        } catch (error) {
            check = {
                id: `${taskId}-behavior`,
                command: "verify:behavior",
                passed: false,
                exitCode,
                stderr: [
                    error instanceof Error
                        ? error.message
                        : String(error),
                    stderr
                ].join("\n").slice(0, 16000),
                durationMs: Date.now() - startedAt
            };
        }

        return this.appendCheck(technical, check);
    }

    private appendCheck(
        technical: VerificationReport,
        behavior: VerificationCheckResult
    ): VerificationReport {
        return {
            passed:
                technical.passed && behavior.passed,
            checks: [
                ...technical.checks,
                behavior
            ]
        };
    }
}
