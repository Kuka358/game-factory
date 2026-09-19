import {
    isAbsolute,
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

import {
    LocalProcessExecutionSandbox,
    type ExecutionEnvironmentPolicy,
    type ExecutionSandbox
} from "./execution-sandbox.js";


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

    environment?:
        ExecutionEnvironmentPolicy;
}


export interface DeterministicCommandVerifierOptions {
    commands:
        readonly VerificationCommandDefinition[];

    defaultTimeoutMs?:
        number;

    maxOutputBytes?:
        number;
    
    sandbox?:
        ExecutionSandbox;
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

    private readonly sandbox:
        ExecutionSandbox;


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

        this.sandbox =
            options.sandbox ??
            new LocalProcessExecutionSandbox();

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
                !isAbsolute(
                    executable
                )
            ) {
                throw new Error(
                    `Verification executable must be absolute: ${command}`
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
            await this.sandbox
                .execute({
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
                        this.maxOutputBytes,

                    environment:
                        definition.environment
                });


        const passed =
            execution.exitCode ===
                0 &&
            !execution.timedOut &&
            !execution.outputLimitExceeded &&
            execution.errorMessage ===
                undefined;

        return {
            id:
                step.id,

            command:
                step.command,

            passed,

            exitCode:
                execution.exitCode,

            stdout:
                execution.stdout,

            stderr:
                !passed &&
                execution.stderr
                    .trim()
                    .length ===
                    0
                    ? execution.errorMessage ??
                        (
                            execution.exitCode !==
                            undefined
                                ? `Process exited with code ${execution.exitCode}`
                                : "Verification process failed"
                        )
                    : execution.stderr,

            durationMs:
                Date.now() -
                startedAt
        };
    }
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