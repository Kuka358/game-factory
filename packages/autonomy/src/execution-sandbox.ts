import {
    execFile,
    spawn,
    type ChildProcess
} from "node:child_process";

import {
    isAbsolute,
    join,
    resolve
} from "node:path";

import {
    HOST_PROCESS_EXECUTION_POLICY,
    normalizeExecutionPolicy,
    type ExecutionPolicy
} from "./execution-policy.js";


export interface ExecutionEnvironmentPolicy {
    /**
     * Parent environment variables that may be copied into
     * the isolated process.
     *
     * Arbitrary parent environment variables are NOT inherited.
     */
    inherit?:
        readonly string[];

    /**
     * Explicit deterministic values supplied to the child.
     */
    set?:
        Readonly<
            Record<
                string,
                string
            >
        >;
}


export interface ExecutionSandboxInput {
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

    environment?:
        ExecutionEnvironmentPolicy;

    policy?:
        ExecutionPolicy;
}


export interface ExecutionSandboxResult {
    exitCode?:
        number;

    signal?:
        NodeJS.Signals;

    stdout:
        string;

    stderr:
        string;

    timedOut:
        boolean;

    outputLimitExceeded:
        boolean;

    errorMessage?:
        string;
}


export interface ExecutionSandbox {
    assertPolicySupported(
        policy:
            ExecutionPolicy
    ): void;

    execute(
        input:
            ExecutionSandboxInput
    ): Promise<ExecutionSandboxResult>;
}


export interface LocalProcessExecutionSandboxOptions {
    /**
     * Injectable for deterministic tests.
     */
    parentEnvironment?:
        NodeJS.ProcessEnv;

    /**
     * Minimal non-secret environment inherited by every
     * verifier process.
     */
    defaultInheritedEnvironment?:
        readonly string[];
}


const DEFAULT_WINDOWS_ENVIRONMENT = [
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE"
] as const;


const DEFAULT_POSIX_ENVIRONMENT = [
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL"
] as const;


/*
 * Inheriting these variables can alter executable loading or
 * inject code into verifier processes.
 *
 * If a trusted verifier genuinely requires one of them it must
 * provide a deterministic value through environment.set instead.
 */
const FORBIDDEN_INHERITED_ENVIRONMENT =
    new Set(
        [
            "NODE_OPTIONS",
            "NODE_PATH",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH"
        ].map(
            name =>
                name.toLowerCase()
        )
    );


export class LocalProcessExecutionSandbox
    implements ExecutionSandbox
{
    private readonly parentEnvironment:
        NodeJS.ProcessEnv;

    private readonly defaultInheritedEnvironment:
        readonly string[];


    constructor(
        options:
            LocalProcessExecutionSandboxOptions = {}
    ) {
        this.parentEnvironment =
            options.parentEnvironment ??
            process.env;

        this.defaultInheritedEnvironment =
            options.defaultInheritedEnvironment ??
            (
                process.platform ===
                    "win32"
                    ? DEFAULT_WINDOWS_ENVIRONMENT
                    : DEFAULT_POSIX_ENVIRONMENT
            );
    }

    assertPolicySupported(
        policy:
            ExecutionPolicy
    ): void {
        if (
            policy.network !==
            HOST_PROCESS_EXECUTION_POLICY.network
        ) {
            throw new Error(
                [
                    "Local process execution sandbox cannot enforce",
                    `network=${policy.network};`,
                    "a stronger execution backend is required"
                ].join(
                    " "
                )
            );
        }


        if (
            policy.filesystem !==
            HOST_PROCESS_EXECUTION_POLICY.filesystem
        ) {
            throw new Error(
                [
                    "Local process execution sandbox cannot enforce",
                    `filesystem=${policy.filesystem};`,
                    "a stronger execution backend is required"
                ].join(
                    " "
                )
            );
        }


        if (
            policy.childProcesses !==
            HOST_PROCESS_EXECUTION_POLICY.childProcesses
        ) {
            throw new Error(
                [
                    "Local process execution sandbox cannot enforce",
                    `childProcesses=${policy.childProcesses};`,
                    "a stronger execution backend is required"
                ].join(
                    " "
                )
            );
        }
    }


    async execute(
        input:
            ExecutionSandboxInput
    ): Promise<ExecutionSandboxResult> {
        validateInput(
            input
        );


        const policy =
            normalizeExecutionPolicy(
                input.policy
            );


        this.assertPolicySupported(
            policy
        );


        const cwd =
            resolve(
                input.cwd
            );


        const environment =
            createEnvironment(
                this.parentEnvironment,
                [
                    ...this.defaultInheritedEnvironment,
                    ...(
                        input.environment
                            ?.inherit ??
                        []
                    )
                ],
                input.environment
                    ?.set ??
                    {}
            );


        return executeProcess({
            ...input,

            cwd,

            environment
        });
    }
}


interface ExecuteProcessInput {
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

    environment:
        NodeJS.ProcessEnv;
}


function executeProcess(
    input:
        ExecuteProcessInput
): Promise<ExecutionSandboxResult> {
    return new Promise(
        resolveResult => {
            let child:
                ChildProcess;

            try {
                child =
                    spawn(
                        input.executable,
                        [
                            ...input.args
                        ],
                        {
                            cwd:
                                input.cwd,

                            env:
                                input.environment,

                            shell:
                                false,

                            windowsHide:
                                true,

                            /*
                             * On POSIX this creates a process group so
                             * timeout termination can kill descendants too.
                             *
                             * Windows uses taskkill /T instead.
                             */
                            detached:
                                process.platform !==
                                "win32",

                            stdio: [
                                "ignore",
                                "pipe",
                                "pipe"
                            ]
                        }
                    );
            } catch (error) {
                resolveResult({
                    stdout:
                        "",

                    stderr:
                        "",

                    timedOut:
                        false,

                    outputLimitExceeded:
                        false,

                    errorMessage:
                        describeError(
                            error
                        )
                });

                return;
            }


            const stdoutChunks:
                Buffer[] = [];

            const stderrChunks:
                Buffer[] = [];

            let capturedBytes =
                0;

            let timedOut =
                false;

            let outputLimitExceeded =
                false;

            let spawnError:
                string |
                undefined;

            let settled =
                false;

            let terminationRequested =
                false;


            const requestTermination =
                () => {
                    if (
                        terminationRequested
                    ) {
                        return;
                    }

                    terminationRequested =
                        true;

                    void terminateProcessTree(
                        child
                    );
                };


            const capture =
                (
                    target:
                        Buffer[],

                    value:
                        unknown
                ) => {
                    const chunk =
                        Buffer.isBuffer(
                            value
                        )
                            ? value
                            : Buffer.from(
                                String(
                                    value
                                ),
                                "utf8"
                            );


                    const remaining =
                        Math.max(
                            0,
                            input.maxOutputBytes -
                            capturedBytes
                        );


                    if (
                        remaining >
                        0
                    ) {
                        target.push(
                            chunk.subarray(
                                0,
                                remaining
                            )
                        );
                    }


                    capturedBytes +=
                        chunk.length;


                    if (
                        capturedBytes >
                        input.maxOutputBytes
                    ) {
                        outputLimitExceeded =
                            true;

                        requestTermination();
                    }
                };


            child.stdout?.on(
                "data",
                chunk => {
                    capture(
                        stdoutChunks,
                        chunk
                    );
                }
            );


            child.stderr?.on(
                "data",
                chunk => {
                    capture(
                        stderrChunks,
                        chunk
                    );
                }
            );


            child.on(
                "error",
                error => {
                    spawnError =
                        describeError(
                            error
                        );
                }
            );


            const timeout =
                setTimeout(
                    () => {
                        timedOut =
                            true;

                        requestTermination();
                    },
                    input.timeoutMs
                );


            child.on(
                "close",
                (
                    code,
                    signal
                ) => {
                    if (
                        settled
                    ) {
                        return;
                    }

                    settled =
                        true;

                    clearTimeout(
                        timeout
                    );


                    const errorMessage =
                        createExecutionErrorMessage({
                            timedOut,

                            outputLimitExceeded,

                            spawnError,

                            signal,

                            timeoutMs:
                                input.timeoutMs,

                            maxOutputBytes:
                                input.maxOutputBytes
                        });


                    resolveResult({
                        exitCode:
                            typeof code ===
                                "number"
                                ? code
                                : undefined,

                        signal:
                            signal ??
                            undefined,

                        stdout:
                            Buffer.concat(
                                stdoutChunks
                            ).toString(
                                "utf8"
                            ),

                        stderr:
                            Buffer.concat(
                                stderrChunks
                            ).toString(
                                "utf8"
                            ),

                        timedOut,

                        outputLimitExceeded,

                        errorMessage
                    });
                }
            );
        }
    );
}


async function terminateProcessTree(
    child:
        ChildProcess
): Promise<void> {
    const pid =
        child.pid;


    if (!pid) {
        child.kill(
            "SIGKILL"
        );

        return;
    }


    if (
        process.platform ===
        "win32"
    ) {
        await terminateWindowsProcessTree(
            pid
        );

        /*
         * taskkill may race with a process that has already
         * exited. A direct kill is harmless as a fallback.
         */
        try {
            child.kill(
                "SIGKILL"
            );
        } catch {
            // Already gone.
        }

        return;
    }


    /*
     * detached:true creates a process group whose id is the
     * child's pid. Negative pid kills the entire group.
     */
    try {
        process.kill(
            -pid,
            "SIGKILL"
        );

        return;
    } catch {
        // Fall through to direct child kill.
    }


    try {
        child.kill(
            "SIGKILL"
        );
    } catch {
        // Already gone.
    }
}


function terminateWindowsProcessTree(
    pid:
        number
): Promise<void> {
    return new Promise(
        resolveTermination => {
            const windowsRoot =
                process.env.SystemRoot ??
                process.env.WINDIR ??
                "C:\\Windows";


            const taskkill =
                join(
                    windowsRoot,
                    "System32",
                    "taskkill.exe"
                );


            execFile(
                taskkill,
                [
                    "/PID",
                    String(
                        pid
                    ),
                    "/T",
                    "/F"
                ],
                {
                    windowsHide:
                        true
                },
                () => {
                    /*
                     * Non-zero taskkill exit usually means that the
                     * process exited between timeout and termination.
                     */
                    resolveTermination();
                }
            );
        }
    );
}


function createEnvironment(
    parent:
        NodeJS.ProcessEnv,

    inherited:
        readonly string[],

    explicit:
        Readonly<
            Record<
                string,
                string
            >
        >
): NodeJS.ProcessEnv {
    const result:
        NodeJS.ProcessEnv = {};


    const seen =
        new Set<string>();


    for (
        const rawName of
        inherited
    ) {
        const name =
            validateEnvironmentName(
                rawName
            );


        const normalized =
            name.toLowerCase();


        if (
            seen.has(
                normalized
            )
        ) {
            continue;
        }


        seen.add(
            normalized
        );


        if (
            FORBIDDEN_INHERITED_ENVIRONMENT
                .has(
                    normalized
                )
        ) {
            throw new Error(
                `Execution sandbox refuses to inherit dangerous environment variable: ${name}`
            );
        }


        const value =
            findEnvironmentValue(
                parent,
                name
            );


        if (
            value !==
            undefined
        ) {
            result[name] =
                value;
        }
    }


    for (
        const [
            rawName,
            value
        ] of
        Object.entries(
            explicit
        )
    ) {
        const name =
            validateEnvironmentName(
                rawName
            );


        result[name] =
            value;
    }


    /*
     * Make verifier subprocesses deterministic and non-interactive
     * unless a trusted definition explicitly overrides CI.
     */
    if (
        result.CI ===
        undefined
    ) {
        result.CI =
            "1";
    }


    return result;
}


function findEnvironmentValue(
    environment:
        NodeJS.ProcessEnv,

    requestedName:
        string
): string | undefined {
    if (
        process.platform !==
        "win32"
    ) {
        return environment[
            requestedName
        ];
    }


    const requested =
        requestedName
            .toLowerCase();


    for (
        const [
            name,
            value
        ] of
        Object.entries(
            environment
        )
    ) {
        if (
            name.toLowerCase() ===
            requested
        ) {
            return value;
        }
    }


    return undefined;
}


function validateEnvironmentName(
    value:
        string
): string {
    const normalized =
        value.trim();


    if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/
            .test(
                normalized
            )
    ) {
        throw new Error(
            `Invalid execution environment variable name: ${value}`
        );
    }


    return normalized;
}


function validateInput(
    input:
        ExecutionSandboxInput
): void {
    if (
        !isAbsolute(
            input.executable
        )
    ) {
        throw new Error(
            `Execution sandbox requires an absolute executable path: ${input.executable}`
        );
    }


    positiveInteger(
        input.timeoutMs,
        "timeoutMs"
    );


    positiveInteger(
        input.maxOutputBytes,
        "maxOutputBytes"
    );


    if (
        input.cwd.trim()
            .length ===
        0
    ) {
        throw new Error(
            "Execution sandbox cwd must not be empty"
        );
    }
}


function createExecutionErrorMessage(
    input:
        {
            timedOut:
                boolean;

            outputLimitExceeded:
                boolean;

            spawnError?:
                string;

            signal:
                NodeJS.Signals |
                null;

            timeoutMs:
                number;

            maxOutputBytes:
                number;
        }
): string | undefined {
    if (
        input.timedOut
    ) {
        return (
            `Process timed out after ${input.timeoutMs}ms`
        );
    }


    if (
        input.outputLimitExceeded
    ) {
        return (
            `Process output exceeded ${input.maxOutputBytes} bytes`
        );
    }


    if (
        input.spawnError
    ) {
        return input.spawnError;
    }


    if (
        input.signal
    ) {
        return (
            `Process terminated by signal ${input.signal}`
        );
    }


    return undefined;
}


function describeError(
    value:
        unknown
): string {
    return value instanceof
        Error
        ? value.message
        : String(
            value
        );
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