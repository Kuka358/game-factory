import {
    randomUUID
} from "node:crypto";

import {
    isAbsolute,
    resolve
} from "node:path";

import {
    HOST_PROCESS_EXECUTION_POLICY,
    STRICT_VERIFICATION_EXECUTION_POLICY,
    normalizeExecutionPolicy,
    type ExecutionPolicy
} from "./execution-policy.js";

import {
    LocalProcessExecutionSandbox,
    type ExecutionEnvironmentPolicy,
    type ExecutionSandbox,
    type ExecutionSandboxInput,
    type ExecutionSandboxResult
} from "./execution-sandbox.js";


export interface DockerExecutionSandboxOptions {
    dockerExecutable:
        string;

    image:
        string;

    /**
     * Maps host executable paths used by verifier definitions
     * to executable paths inside the container.
     *
     * Example:
     *
     * process.execPath -> /usr/local/bin/node
     */
    executableMap?:
        Readonly<
            Record<
                string,
                string
            >
        >;

    executor?:
        ExecutionSandbox;

    dockerClientEnvironment?:
        ExecutionEnvironmentPolicy;

    memoryMb?:
        number;

    cpus?:
        number;

    pidsLimit?:
        number;

    tmpfsSizeMb?:
        number;

    user?:
        string;

    containerNameFactory?:
        () => string;
}


export class DockerExecutionSandbox
    implements ExecutionSandbox
{
    private readonly dockerExecutable:
        string;

    private readonly image:
        string;

    private readonly executableMap =
        new Map<
            string,
            string
        >();

    private readonly executor:
        ExecutionSandbox;

    private readonly dockerClientEnvironment?:
        ExecutionEnvironmentPolicy;

    private readonly memoryMb:
        number;

    private readonly cpus:
        number;

    private readonly pidsLimit:
        number;

    private readonly tmpfsSizeMb:
        number;

    private readonly user?:
        string;

    private readonly containerNameFactory:
        () => string;


    constructor(
        options:
            DockerExecutionSandboxOptions
    ) {
        if (
            !isAbsolute(
                options.dockerExecutable
            )
        ) {
            throw new Error(
                "Docker executable path must be absolute"
            );
        }


        const image =
            options.image
                .trim();


        if (
            image.length ===
            0
        ) {
            throw new Error(
                "Docker sandbox image must not be empty"
            );
        }


        this.dockerExecutable =
            options.dockerExecutable;

        this.image =
            image;

        this.memoryMb =
            positiveInteger(
                options.memoryMb ??
                1024,

                "memoryMb"
            );

        this.cpus =
            positiveNumber(
                options.cpus ??
                2,

                "cpus"
            );

        this.pidsLimit =
            positiveInteger(
                options.pidsLimit ??
                128,

                "pidsLimit"
            );

        this.tmpfsSizeMb =
            positiveInteger(
                options.tmpfsSizeMb ??
                64,

                "tmpfsSizeMb"
            );

        this.user =
            normalizeOptionalString(
                options.user
            );

        this.executor =
            options.executor ??
            new LocalProcessExecutionSandbox();

        this.dockerClientEnvironment =
            options.dockerClientEnvironment;

        this.containerNameFactory =
            options.containerNameFactory ??
            (() =>
                `game-factory-autonomy-${randomUUID()}`);


        for (
            const [
                hostExecutable,
                containerExecutable
            ] of
            Object.entries(
                options.executableMap ??
                {}
            )
        ) {
            if (
                !isAbsolute(
                    hostExecutable
                )
            ) {
                throw new Error(
                    `Host executable mapping must use an absolute path: ${hostExecutable}`
                );
            }


            if (
                !containerExecutable
                    .startsWith(
                        "/"
                    )
            ) {
                throw new Error(
                    `Container executable must be an absolute POSIX path: ${containerExecutable}`
                );
            }


            this.executableMap.set(
                normalizeHostExecutable(
                    hostExecutable
                ),

                containerExecutable
            );
        }
    }


    assertPolicySupported(
        policy:
            ExecutionPolicy
    ): void {
        if (
            policy.network !==
            STRICT_VERIFICATION_EXECUTION_POLICY.network
        ) {
            throw new Error(
                [
                    "Docker execution sandbox requires",
                    "network=deny"
                ].join(
                    " "
                )
            );
        }


        if (
            policy.filesystem !==
            STRICT_VERIFICATION_EXECUTION_POLICY.filesystem
        ) {
            throw new Error(
                [
                    "Docker execution sandbox requires",
                    "filesystem=workspace-only"
                ].join(
                    " "
                )
            );
        }


        if (
            policy.childProcesses !==
            STRICT_VERIFICATION_EXECUTION_POLICY.childProcesses
        ) {
            throw new Error(
                [
                    "Docker execution sandbox currently requires",
                    "childProcesses=allow"
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
        const policy =
            normalizeExecutionPolicy(
                input.policy
            );


        this.assertPolicySupported(
            policy
        );


        if (
            (
                input.environment
                    ?.inherit
                    ?.length ??
                0
            ) >
            0
        ) {
            throw new Error(
                [
                    "Docker execution sandbox does not inherit",
                    "host environment variables into the workload"
                ].join(
                    " "
                )
            );
        }


        const workspaceRoot =
            resolve(
                input.cwd
            );


        const containerExecutable =
            this.resolveContainerExecutable(
                input.executable
            );


        const containerName =
            sanitizeContainerName(
                this.containerNameFactory()
            );


        const args =
            this.createRunArguments({
                containerName,

                workspaceRoot,

                executable:
                    containerExecutable,

                args:
                    input.args,

                explicitEnvironment:
                    input.environment
                        ?.set ??
                        {}
            });


        const result =
            await this.executor
                .execute({
                    executable:
                        this.dockerExecutable,

                    args,

                    cwd:
                        workspaceRoot,

                    timeoutMs:
                        input.timeoutMs,

                    maxOutputBytes:
                        input.maxOutputBytes,

                    environment:
                        this.dockerClientEnvironment,

                    policy:
                        HOST_PROCESS_EXECUTION_POLICY
                });


        /*
         * Killing the Docker CLI itself does not guarantee that
         * the daemon-side container died too.
         *
         * Therefore timeout/output termination is followed by an
         * explicit docker rm -f.
         */
        if (
            result.timedOut ||
            result.outputLimitExceeded
        ) {
            const cleanup =
                await this.removeContainer(
                    containerName,
                    workspaceRoot
                );


            if (
                !executionSucceeded(
                    cleanup
                )
            ) {
                return {
                    ...result,

                    errorMessage:
                        [
                            result.errorMessage ??
                                "Docker execution was terminated",

                            `container cleanup failed: ${describeExecutionFailure(
                                cleanup
                            )}`
                        ].join(
                            "; "
                        )
                };
            }
        }


        return result;
    }


    private createRunArguments(
        input:
            {
                containerName:
                    string;

                workspaceRoot:
                    string;

                executable:
                    string;

                args:
                    readonly string[];

                explicitEnvironment:
                    Readonly<
                        Record<
                            string,
                            string
                        >
                    >;
            }
    ): string[] {
        const args = [
            "run",

            "--rm",

            "--pull",
            "never",

            "--name",
            input.containerName,

            "--network",
            "none",

            "--read-only",

            "--cap-drop",
            "ALL",

            "--security-opt",
            "no-new-privileges",

            "--pids-limit",
            String(
                this.pidsLimit
            ),

            "--memory",
            `${this.memoryMb}m`,

            "--cpus",
            String(
                this.cpus
            ),

            "--tmpfs",
            `/tmp:rw,noexec,nosuid,nodev,size=${this.tmpfsSizeMb}m`,

            "--volume",
            `${input.workspaceRoot}:/workspace`,

            "--workdir",
            "/workspace",

            "--env",
            "CI=1",

            "--env",
            "HOME=/tmp"
        ];


        if (
            this.user
        ) {
            args.push(
                "--user",
                this.user
            );
        }


        for (
            const [
                rawName,
                value
            ] of
            Object.entries(
                input.explicitEnvironment
            ).sort(
                (
                    left,
                    right
                ) =>
                    left[0]
                        .localeCompare(
                            right[0]
                        )
            )
        ) {
            const name =
                validateEnvironmentName(
                    rawName
                );


            args.push(
                "--env",
                `${name}=${value}`
            );
        }


        args.push(
            this.image,

            input.executable,

            ...input.args
        );


        return args;
    }


    private resolveContainerExecutable(
        executable:
            string
    ): string {
        const mapped =
            this.executableMap
                .get(
                    normalizeHostExecutable(
                        executable
                    )
                );


        if (
            mapped
        ) {
            return mapped;
        }


        /*
         * A POSIX absolute path may already describe the
         * executable inside the container.
         */
        if (
            executable.startsWith(
                "/"
            )
        ) {
            return executable;
        }


        throw new Error(
            [
                "Docker execution sandbox cannot map host executable",
                executable,
                "to a container executable"
            ].join(
                " "
            )
        );
    }


    private async removeContainer(
        containerName:
            string,

        workspaceRoot:
            string
    ): Promise<ExecutionSandboxResult> {
        return this.executor
            .execute({
                executable:
                    this.dockerExecutable,

                args: [
                    "rm",
                    "-f",
                    containerName
                ],

                cwd:
                    workspaceRoot,

                timeoutMs:
                    15_000,

                maxOutputBytes:
                    64_000,

                environment:
                    this.dockerClientEnvironment,

                policy:
                    HOST_PROCESS_EXECUTION_POLICY
            });
    }
}


function normalizeHostExecutable(
    executable:
        string
): string {
    const normalized =
        resolve(
            executable
        );


    return process.platform ===
        "win32"
        ? normalized.toLowerCase()
        : normalized;
}


function sanitizeContainerName(
    value:
        string
): string {
    const normalized =
        value
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9_.-]+/g,
                "-"
            )
            .replace(
                /^[-_.]+/,
                ""
            )
            .slice(
                0,
                120
            );


    if (
        normalized.length ===
        0
    ) {
        throw new Error(
            "Docker container name must not be empty"
        );
    }


    return normalized;
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
            `Invalid Docker workload environment variable name: ${value}`
        );
    }


    return normalized;
}


function normalizeOptionalString(
    value:
        string |
        undefined
): string | undefined {
    const normalized =
        value
            ?.trim();


    return normalized &&
        normalized.length >
            0
        ? normalized
        : undefined;
}


function executionSucceeded(
    result:
        ExecutionSandboxResult
): boolean {
    return (
        result.exitCode ===
            0 &&
        !result.timedOut &&
        !result.outputLimitExceeded &&
        result.errorMessage ===
            undefined
    );
}


function describeExecutionFailure(
    result:
        ExecutionSandboxResult
): string {
    if (
        result.errorMessage
    ) {
        return result.errorMessage;
    }


    if (
        result.stderr
            .trim()
            .length >
        0
    ) {
        return result.stderr
            .trim();
    }


    if (
        result.exitCode !==
        undefined
    ) {
        return (
            `exit code ${result.exitCode}`
        );
    }


    return "unknown Docker execution failure";
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


function positiveNumber(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isFinite(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive number`
        );
    }


    return value;
}