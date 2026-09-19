import {
    execFile
} from "node:child_process";

import {
    resolve
} from "node:path";

import type {
    VerificationStep
} from "./contracts.js";

import type {
    VerificationInput,
    Verifier
} from "./providers.js";

import type {
    VerificationCheckResult,
    VerificationReport
} from "./state.js";

import {
    WorkspaceGuard
} from "./workspace.js";


export interface VerificationCommandDefinition {
    /**
     * Exact command string allowed in IterationContract.verification.
     *
     * This string is used as an identifier / allowlist key.
     * It is NOT passed to a shell.
     */
    command:
        string;

    executable:
        string;

    args?:
        readonly string[];

    timeoutMs?:
        number;
}


export interface DeterministicCommandVerifierOptions {
    commands:
        readonly VerificationCommandDefinition[];

    defaultTimeoutMs?:
        number;

    maxOutputBytes?:
        number;
}


export class DeterministicCommandVerifier
    implements Verifier
{
    private readonly commands =
        new Map<
            string,
            VerificationCommandDefinition
        >();

    private readonly guard:
        WorkspaceGuard;

    private readonly defaultTimeoutMs:
        number;

    private readonly maxOutputBytes:
        number;


    constructor(
        options:
            DeterministicCommandVerifierOptions
    ) {
        this.defaultTimeoutMs =
            positiveInteger(
                options.defaultTimeoutMs ??
                120_000,

                "defaultTimeoutMs"
            );

        this.maxOutputBytes =
            positiveInteger(
                options.maxOutputBytes ??
                1_000_000,

                "maxOutputBytes"
            );

        const allowedCommands:
            string[] = [];

        for (
            const definition of
            options.commands
        ) {
            const command =
                definition.command
                    .trim();

            const executable =
                definition.executable
                    .trim();

            if (
                command.length ===
                0
            ) {
                throw new Error(
                    "Verification command must not be empty"
                );
            }

            if (
                executable.length ===
                0
            ) {
                throw new Error(
                    `Verification executable must not be empty: ${command}`
                );
            }

            if (
                definition.timeoutMs !==
                undefined
            ) {
                positiveInteger(
                    definition.timeoutMs,
                    `timeoutMs for ${command}`
                );
            }

            if (
                this.commands.has(
                    command
                )
            ) {
                throw new Error(
                    `Duplicate verification command: ${command}`
                );
            }

            this.commands.set(
                command,
                {
                    ...definition,

                    command,

                    executable
                }
            );

            allowedCommands.push(
                command
            );
        }

        this.guard =
            new WorkspaceGuard({
                allowedCommands
            });
    }


    async verify(
        input:
            VerificationInput
    ): Promise<VerificationReport> {
        const workspace =
            input.workspace;

        if (!workspace) {
            throw new Error(
                "DeterministicCommandVerifier requires an isolated workspace"
            );
        }

        const workspaceRoot =
            resolve(
                workspace.root
            );

        /*
         * Validate the COMPLETE command batch before executing
         * anything.
         *
         * A contract such as:
         *
         *   1. allowed command
         *   2. malicious command
         *
         * must not execute command #1 and fail only afterwards.
         */
        for (
            const step of
            input.contract.verification
        ) {
            this.assertStepConfigured(
                step
            );
        }

        const checks:
            VerificationCheckResult[] = [];

        for (
            const step of
            input.contract.verification
        ) {
            checks.push(
                await this.runStep(
                    workspaceRoot,
                    step
                )
            );
        }

        const passed =
            input.contract
                .verification
                .every(
                    (
                        step,
                        index
                    ) =>
                        !step.required ||
                        checks[index]
                            ?.passed ===
                            true
                );

        return {
            passed,

            checks
        };
    }


    private assertStepConfigured(
        step:
            VerificationStep
    ): void {
        this.guard
            .assertCommandAllowed(
                step.command
            );

        const command =
            step.command
                .trim();

        if (
            !this.commands.has(
                command
            )
        ) {
            /*
             * Should normally be unreachable because WorkspaceGuard
             * uses the same allowlist, but keep the invariant local.
             */
            throw new Error(
                `Verification command is not configured: ${command}`
            );
        }
    }


    private async runStep(
        workspaceRoot:
            string,

        step:
            VerificationStep
    ): Promise<VerificationCheckResult> {
        const command =
            step.command
                .trim();

        const definition =
            this.commands.get(
                command
            );

        if (!definition) {
            throw new Error(
                `Verification command is not configured: ${command}`
            );
        }

        const startedAt =
            Date.now();

        const execution =
            await executeCommand({
                executable:
                    definition.executable,

                args:
                    definition.args ??
                    [],

                cwd:
                    workspaceRoot,

                timeoutMs:
                    definition.timeoutMs ??
                    this.defaultTimeoutMs,

                maxOutputBytes:
                    this.maxOutputBytes
            });

        return {
            id:
                step.id,

            command:
                step.command,

            passed:
                execution.error ===
                null,

            exitCode:
                execution.error ===
                null
                    ? 0
                    : getNumericExitCode(
                        execution.error
                    ),

            stdout:
                execution.stdout,

            stderr:
                execution.error !==
                    null &&
                execution.stderr
                    .trim()
                    .length ===
                    0
                    ? execution.error
                        .message
                    : execution.stderr,

            durationMs:
                Date.now() -
                startedAt
        };
    }
}


interface ExecuteCommandInput {
    executable:
        string;

    args:
        readonly string[];

    cwd:
        string;

    timeoutMs:
        number;

    maxOutputBytes:
        number;
}


interface CommandExecutionResult {
    error:
        Error | null;

    stdout:
        string;

    stderr:
        string;
}


function executeCommand(
    input:
        ExecuteCommandInput
): Promise<CommandExecutionResult> {
    return new Promise(
        resolveResult => {
            execFile(
                input.executable,

                [
                    ...input.args
                ],

                {
                    cwd:
                        input.cwd,

                    encoding:
                        "utf8",

                    windowsHide:
                        true,

                    timeout:
                        input.timeoutMs,

                    killSignal:
                        "SIGKILL",

                    maxBuffer:
                        input.maxOutputBytes
                },

                (
                    error,
                    stdout,
                    stderr
                ) => {
                    resolveResult({
                        error,

                        stdout:
                            toText(
                                stdout
                            ),

                        stderr:
                            toText(
                                stderr
                            )
                    });
                }
            );
        }
    );
}


function toText(
    value:
        string | Buffer
): string {
    return typeof value ===
        "string"
        ? value
        : value.toString(
            "utf8"
        );
}


function getNumericExitCode(
    error:
        Error
): number | undefined {
    if (
        !(
            "code" in
            error
        )
    ) {
        return undefined;
    }

    const code =
        (
            error as Error & {
                code?:
                    string | number;
            }
        ).code;

    return typeof code ===
        "number"
        ? code
        : undefined;
}


function positiveInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive integer`
        );
    }

    return value;
}