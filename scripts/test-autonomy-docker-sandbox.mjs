import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    isAbsolute,
    join
} from "node:path";

import {
    execFile
} from "node:child_process";

import {
    promisify
} from "node:util";

import {
    DockerExecutionSandbox,
    STRICT_VERIFICATION_EXECUTION_POLICY
} from "../packages/autonomy/dist/index.js";


const execFileAsync =
    promisify(
        execFile
    );


const dockerExecutable =
    process.argv[2];


if (
    !dockerExecutable
) {
    throw new Error(
        [
            "Docker executable path is required.",
            "",
            "PowerShell:",
            '$docker = (Get-Command docker).Source',
            'node scripts/test-autonomy-docker-sandbox.mjs "$docker"'
        ].join(
            "\n"
        )
    );
}


if (
    !isAbsolute(
        dockerExecutable
    )
) {
    throw new Error(
        `Docker executable must be absolute: ${dockerExecutable}`
    );
}


const image =
    "node:22.20.0-bookworm-slim";


const root =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-docker-smoke-"
        )
    );


const workspace =
    join(
        root,
        "workspace"
    );


const outsideSecretPath =
    join(
        root,
        "outside-secret.txt"
    );


const workspaceInputPath =
    join(
        workspace,
        "input.txt"
    );


const workspaceOutputPath =
    join(
        workspace,
        "output.txt"
    );


const normalContainerName =
    "game-factory-autonomy-smoke";


const timeoutContainerName =
    "game-factory-autonomy-smoke-timeout";


let containerNumber =
    0;


process.env.GAME_FACTORY_HOST_SECRET =
    "must-not-reach-container";


try {
    await mkdir(
        workspace
    );


    await writeFile(
        workspaceInputPath,
        "workspace-visible\n",
        "utf8"
    );


    /*
     * This file is deliberately OUTSIDE the mounted workspace.
     * The container must never see it.
     */
    await writeFile(
        outsideSecretPath,
        "host-only-secret\n",
        "utf8"
    );


    const sandbox =
        new DockerExecutionSandbox({
            dockerExecutable,

            image,

            executableMap: {
                [process.execPath]:
                    "/usr/local/bin/node"
            },

            memoryMb:
                512,

            cpus:
                1,

            pidsLimit:
                64,

            tmpfsSizeMb:
                32,

            containerNameFactory:
                () => {
                    containerNumber +=
                        1;


                    return containerNumber ===
                        1
                        ? normalContainerName
                        : timeoutContainerName;
                }
        });


    console.log(
        "Running real Docker isolation smoke..."
    );


    const workload =
        [
            'const fs = require("node:fs");',
            'const net = require("node:net");',

            "",

            "const input =",
            '    fs.readFileSync("/workspace/input.txt", "utf8");',

            "",

            "if (input !== \"workspace-visible\\n\") {",
            '    console.error("workspace input is unavailable");',
            "    process.exit(10);",
            "}",

            "",

            "if (process.env.GAME_FACTORY_HOST_SECRET !== undefined) {",
            '    console.error("host secret leaked into container");',
            "    process.exit(11);",
            "}",

            "",

            /*
             * /workspace is the only host bind mount.
             *
             * workspace/.. inside the container resolves to /,
             * not to the parent directory on the Windows host.
             */
            'if (fs.existsSync("/outside-secret.txt")) {',
            '    console.error("host file outside workspace is visible");',
            "    process.exit(12);",
            "}",

            "",

            "let completed = false;",

            "",

            "const finish = blocked => {",
            "    if (completed) return;",
            "    completed = true;",
            "    socket.destroy();",

            "",

            "    if (!blocked) {",
            '        console.error("external network unexpectedly reachable");',
            "        process.exit(13);",
            "    }",

            "",

            "    fs.writeFileSync(",
            '        "/workspace/output.txt",',
            '        "sandbox-ok\\n"',
            "    );",

            "",

            '    process.stdout.write("sandbox-smoke-ok");',
            "};",

            "",

            /*
             * Use a raw TCP attempt rather than DNS so a DNS failure
             * cannot be mistaken for the network boundary itself.
             */
            "const socket =",
            "    net.connect({",
            '        host: "1.1.1.1",',
            "        port: 80",
            "    });",

            "",

            "socket.once(",
            '    "connect",',
            "    () => finish(false)",
            ");",

            "",

            "socket.once(",
            '    "error",',
            "    () => finish(true)",
            ");",

            "",

            "socket.setTimeout(",
            "    1500,",
            "    () => finish(true)",
            ");"
        ].join(
            "\n"
        );


    const result =
        await sandbox
            .execute({
                executable:
                    process.execPath,

                args: [
                    "-e",
                    workload
                ],

                cwd:
                    workspace,

                timeoutMs:
                    15_000,

                maxOutputBytes:
                    100_000,

                policy:
                    STRICT_VERIFICATION_EXECUTION_POLICY
            });


    printResult(
        "Isolation smoke",
        result
    );


    assertSuccessful(
        result,
        "Real Docker isolation smoke failed"
    );


    if (
        result.stdout !==
        "sandbox-smoke-ok"
    ) {
        throw new Error(
            [
                "Unexpected Docker smoke stdout:",
                JSON.stringify(
                    result.stdout
                )
            ].join(
                " "
            )
        );
    }


    const output =
        await readFile(
            workspaceOutputPath,
            "utf8"
        );


    if (
        output !==
        "sandbox-ok\n"
    ) {
        throw new Error(
            `Container did not write expected workspace output: ${JSON.stringify(
                output
            )}`
        );
    }


    console.log(
        "PASS workspace is available inside container"
    );


    console.log(
        "PASS container can write verified workspace"
    );


    console.log(
        "PASS host environment secret was not inherited"
    );


    console.log(
        "PASS host file outside workspace was not exposed"
    );


    console.log(
        "PASS external network was unavailable"
    );


    /*
     * Now prove that killing the Docker CLI through the outer
     * execution sandbox does not leave a daemon-side container
     * running.
     */
    console.log(
        ""
    );


    console.log(
        "Running real Docker timeout cleanup smoke..."
    );


    const timeoutResult =
        await sandbox
            .execute({
                executable:
                    process.execPath,

                args: [
                    "-e",
                    "setTimeout(() => {}, 10_000);"
                ],

                cwd:
                    workspace,

                /*
                 * The first run above warms Docker/image startup,
                 * so two seconds is enough to start this container
                 * before intentionally terminating the CLI.
                 */
                timeoutMs:
                    2_000,

                maxOutputBytes:
                    100_000,

                policy:
                    STRICT_VERIFICATION_EXECUTION_POLICY
            });


    printResult(
        "Timeout smoke",
        timeoutResult
    );


    if (
        !timeoutResult.timedOut
    ) {
        throw new Error(
            "Docker timeout smoke did not time out as expected"
        );
    }


    /*
     * Give Docker daemon a brief moment to finish rm -f.
     */
    await delay(
        500
    );


    const remainingContainers =
        await findContainers(
            dockerExecutable,
            timeoutContainerName
        );


    if (
        remainingContainers.length >
        0
    ) {
        throw new Error(
            [
                "Timed-out Docker sandbox left a container behind:",
                ...remainingContainers
            ].join(
                "\n"
            )
        );
    }


    console.log(
        "PASS timed-out daemon-side container was removed"
    );


    /*
     * Normal --rm execution should also leave no container.
     */
    const normalRemaining =
        await findContainers(
            dockerExecutable,
            normalContainerName
        );


    if (
        normalRemaining.length >
        0
    ) {
        throw new Error(
            [
                "Successful Docker sandbox left a container behind:",
                ...normalRemaining
            ].join(
                "\n"
            )
        );
    }


    console.log(
        "PASS successful container was removed"
    );


    /*
     * Sanity check: the host-only file still exists on the host.
     * Its absence inside the container was therefore meaningful.
     */
    await access(
        outsideSecretPath
    );


    console.log(
        ""
    );


    console.log(
        "REAL AUTONOMY DOCKER SANDBOX SMOKE PASSED"
    );
} finally {
    delete process.env
        .GAME_FACTORY_HOST_SECRET;


    await removeContainerIfPresent(
        dockerExecutable,
        normalContainerName
    );


    await removeContainerIfPresent(
        dockerExecutable,
        timeoutContainerName
    );


    await rm(
        root,
        {
            recursive:
                true,

            force:
                true
        }
    );
}


async function findContainers(
    dockerExecutable,
    name
) {
    const {
        stdout
    } =
        await execFileAsync(
            dockerExecutable,
            [
                "ps",
                "-a",

                "--filter",
                `name=^/${name}$`,

                "--format",
                "{{.Names}}"
            ],
            {
                windowsHide:
                    true,

                timeout:
                    15_000
            }
        );


    return stdout
        .split(
            /\r?\n/
        )
        .map(
            value =>
                value.trim()
        )
        .filter(
            Boolean
        );
}


async function removeContainerIfPresent(
    dockerExecutable,
    name
) {
    try {
        await execFileAsync(
            dockerExecutable,
            [
                "rm",
                "-f",
                name
            ],
            {
                windowsHide:
                    true,

                timeout:
                    15_000
            }
        );
    } catch {
        /*
         * Cleanup is best-effort. "No such container" is the
         * expected state after a successful smoke.
         */
    }
}


function assertSuccessful(
    result,
    message
) {
    const passed =
        result.exitCode ===
            0 &&
        !result.timedOut &&
        !result.outputLimitExceeded &&
        result.errorMessage ===
            undefined;


    if (
        passed
    ) {
        return;
    }


    throw new Error(
        [
            message,

            `exitCode=${String(
                result.exitCode
            )}`,

            `timedOut=${String(
                result.timedOut
            )}`,

            `outputLimitExceeded=${String(
                result.outputLimitExceeded
            )}`,

            `errorMessage=${result.errorMessage ?? "<none>"}`,

            `stdout=${JSON.stringify(
                result.stdout
            )}`,

            `stderr=${JSON.stringify(
                result.stderr
            )}`
        ].join(
            "\n"
        )
    );
}


function printResult(
    label,
    result
) {
    console.log(
        `${label}:`
    );


    console.log({
        exitCode:
            result.exitCode,

        signal:
            result.signal,

        timedOut:
            result.timedOut,

        outputLimitExceeded:
            result.outputLimitExceeded,

        errorMessage:
            result.errorMessage,

        stdout:
            result.stdout,

        stderr:
            result.stderr
    });
}


function delay(
    milliseconds
) {
    return new Promise(
        resolveDelay => {
            setTimeout(
                resolveDelay,
                milliseconds
            );
        }
    );
}