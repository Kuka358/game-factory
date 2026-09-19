import {
    mkdtemp,
    rm
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join,
    resolve
} from "node:path";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    DockerExecutionSandbox,
    HOST_PROCESS_EXECUTION_POLICY,
    STRICT_VERIFICATION_EXECUTION_POLICY,
    type ExecutionPolicy,
    type ExecutionSandbox,
    type ExecutionSandboxInput,
    type ExecutionSandboxResult
} from "../src/index.js";


describe(
    "DockerExecutionSandbox",
    () => {
        it(
            "accepts strict verification policy and rejects host-process policy",
            () => {
                const executor =
                    new RecordingExecutionSandbox();


                const sandbox =
                    createSandbox(
                        executor
                    );


                expect(
                    () =>
                        sandbox
                            .assertPolicySupported(
                                STRICT_VERIFICATION_EXECUTION_POLICY
                            )
                ).not.toThrow();


                expect(
                    () =>
                        sandbox
                            .assertPolicySupported(
                                HOST_PROCESS_EXECUTION_POLICY
                            )
                ).toThrow(
                    "network=deny"
                );
            }
        );


        it(
            "builds a networkless workspace-only Docker invocation",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const executor =
                        new RecordingExecutionSandbox();


                    const sandbox =
                        createSandbox(
                            executor
                        );


                    const result =
                        await sandbox
                            .execute({
                                executable:
                                    process.execPath,

                                args: [
                                    "-e",
                                    'process.stdout.write("ok")'
                                ],

                                cwd:
                                    repository,

                                timeoutMs:
                                    10_000,

                                maxOutputBytes:
                                    50_000,

                                environment: {
                                    set: {
                                        GAME_FACTORY_TEST:
                                            "visible"
                                    }
                                },

                                policy:
                                    STRICT_VERIFICATION_EXECUTION_POLICY
                            });


                    expect(
                        result.exitCode
                    ).toBe(
                        0
                    );


                    expect(
                        executor.calls
                    ).toHaveLength(
                        1
                    );


                    const call =
                        executor.calls[0];


                    expect(
                        call
                    ).toBeDefined();


                    const args =
                        call?.args ??
                        [];


                    expect(
                        args
                    ).toContain(
                        "--pull"
                    );


                    expect(
                        args
                    ).toContain(
                        "never"
                    );


                    expect(
                        args
                    ).toContain(
                        "--network"
                    );


                    expect(
                        args
                    ).toContain(
                        "none"
                    );


                    expect(
                        args
                    ).toContain(
                        "--read-only"
                    );


                    expect(
                        args
                    ).toContain(
                        "--cap-drop"
                    );


                    expect(
                        args
                    ).toContain(
                        "ALL"
                    );


                    expect(
                        args
                    ).toContain(
                        "--security-opt"
                    );


                    expect(
                        args
                    ).toContain(
                        "no-new-privileges"
                    );


                    expect(
                        args
                    ).toContain(
                        `${resolve(
                            repository
                        )}:/workspace`
                    );


                    expect(
                        args
                    ).toContain(
                        "GAME_FACTORY_TEST=visible"
                    );


                    expect(
                        args
                    ).toContain(
                        "node:22.20.0-bookworm-slim"
                    );


                    expect(
                        args
                    ).toContain(
                        "/usr/local/bin/node"
                    );


                    expect(
                        call?.policy
                    ).toEqual(
                        HOST_PROCESS_EXECUTION_POLICY
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "refuses to inherit host environment variables into the container",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const executor =
                        new RecordingExecutionSandbox();


                    const sandbox =
                        createSandbox(
                            executor
                        );


                    await expect(
                        sandbox.execute({
                            executable:
                                process.execPath,

                            args:
                                [],

                            cwd:
                                repository,

                            timeoutMs:
                                10_000,

                            maxOutputBytes:
                                50_000,

                            environment: {
                                inherit: [
                                    "HOME"
                                ]
                            },

                            policy:
                                STRICT_VERIFICATION_EXECUTION_POLICY
                        })
                    ).rejects.toThrow(
                        "does not inherit host environment"
                    );


                    expect(
                        executor.calls
                    ).toHaveLength(
                        0
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "force-removes the daemon-side container after timeout",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const executor =
                        new RecordingExecutionSandbox([
                            {
                                stdout:
                                    "",

                                stderr:
                                    "",

                                timedOut:
                                    true,

                                outputLimitExceeded:
                                    false,

                                errorMessage:
                                    "Process timed out after 1000ms"
                            },

                            successfulResult()
                        ]);


                    const sandbox =
                        new DockerExecutionSandbox({
                            dockerExecutable:
                                process.execPath,

                            image:
                                "node:22.20.0-bookworm-slim",

                            executableMap: {
                                [process.execPath]:
                                    "/usr/local/bin/node"
                            },

                            executor,

                            containerNameFactory:
                                () =>
                                    "game-factory-test-container"
                        });


                    const result =
                        await sandbox
                            .execute({
                                executable:
                                    process.execPath,

                                args: [
                                    "-e",
                                    "setTimeout(() => {}, 10000)"
                                ],

                                cwd:
                                    repository,

                                timeoutMs:
                                    1_000,

                                maxOutputBytes:
                                    50_000,

                                policy:
                                    STRICT_VERIFICATION_EXECUTION_POLICY
                            });


                    expect(
                        result.timedOut
                    ).toBe(
                        true
                    );


                    expect(
                        executor.calls
                    ).toHaveLength(
                        2
                    );


                    expect(
                        executor.calls[1]
                            ?.args
                    ).toEqual([
                        "rm",
                        "-f",
                        "game-factory-test-container"
                    ]);
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );
    }
);


class RecordingExecutionSandbox
    implements ExecutionSandbox
{
    readonly calls:
        ExecutionSandboxInput[] = [];


    private readonly results:
        ExecutionSandboxResult[];


    constructor(
        results:
            readonly ExecutionSandboxResult[] = [
                successfulResult()
            ]
    ) {
        this.results = [
            ...results
        ];
    }


    assertPolicySupported(
        policy:
            ExecutionPolicy
    ): void {
        if (
            policy.network !==
                "allow" ||
            policy.filesystem !==
                "host" ||
            policy.childProcesses !==
                "allow"
        ) {
            throw new Error(
                "Recording executor only supports host process execution"
            );
        }
    }


    async execute(
        input:
            ExecutionSandboxInput
    ): Promise<ExecutionSandboxResult> {
        this.assertPolicySupported(
            input.policy ??
            HOST_PROCESS_EXECUTION_POLICY
        );


        this.calls.push({
            ...input,

            args: [
                ...input.args
            ]
        });


        return (
            this.results.shift() ??
            successfulResult()
        );
    }
}


function createSandbox(
    executor:
        ExecutionSandbox
): DockerExecutionSandbox {
    return new DockerExecutionSandbox({
        dockerExecutable:
            process.execPath,

        image:
            "node:22.20.0-bookworm-slim",

        executableMap: {
            [process.execPath]:
                "/usr/local/bin/node"
        },

        executor,

        containerNameFactory:
            () =>
                "game-factory-test-container"
    });
}


function successfulResult():
    ExecutionSandboxResult
{
    return {
        exitCode:
            0,

        stdout:
            "",

        stderr:
            "",

        timedOut:
            false,

        outputLimitExceeded:
            false
    };
}


async function createRepository():
    Promise<string>
{
    return mkdtemp(
        join(
            tmpdir(),
            "game-factory-docker-sandbox-"
        )
    );
}