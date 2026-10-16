import {
    access,
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
    DeterministicCommandVerifier,
    DockerExecutionSandbox,
    STRICT_VERIFICATION_EXECUTION_POLICY,
    createAutonomousRun
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
            'node scripts/test-autonomy-docker-verifier.mjs "$docker"'
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


const containerName =
    "game-factory-autonomy-verifier-e2e";


const workspace =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-docker-verifier-"
        )
    );


const inputPath =
    join(
        workspace,
        "input.txt"
    );


const outputPath =
    join(
        workspace,
        "verified-output.txt"
    );


process.env.GAME_FACTORY_HOST_SECRET =
    "must-not-reach-verifier";


try {
    await writeFile(
        inputPath,
        "verification-input\n",
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
                () =>
                    containerName
        });


    const verifierScript =
        [
            'const fs = require("node:fs");',
            'const net = require("node:net");',

            "",

            "const input =",
            '    fs.readFileSync("/workspace/input.txt", "utf8");',

            "",

            "if (input !== \"verification-input\\n\") {",
            '    console.error("workspace input mismatch");',
            "    process.exit(10);",
            "}",

            "",

            "if (process.env.GAME_FACTORY_HOST_SECRET !== undefined) {",
            '    console.error("host environment leaked into verifier");',
            "    process.exit(11);",
            "}",

            "",

            "if (process.env.VERIFIER_MARKER !== \"allowed\") {",
            '    console.error("explicit verifier environment missing");',
            "    process.exit(12);",
            "}",

            "",

            "let finished = false;",

            "",

            "const finish = blocked => {",
            "    if (finished) return;",
            "    finished = true;",

            "",

            "    socket.destroy();",

            "",

            "    if (!blocked) {",
            '        console.error("network unexpectedly reachable");',
            "        process.exit(13);",
            "    }",

            "",

            "    fs.writeFileSync(",
            '        "/workspace/verified-output.txt",',
            '        "verified-inside-sandbox\\n"',
            "    );",

            "",

            '    process.stdout.write("strict-verifier-ok");',
            "};",

            "",

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


    const verifier =
        new DeterministicCommandVerifier({
            sandbox,

            defaultTimeoutMs:
                15_000,

            maxOutputBytes:
                100_000,

            commands: [
                {
                    command:
                        "verify:strict-docker",

                    executable:
                        process.execPath,

                    args: [
                        "-e",
                        verifierScript
                    ],

                    environment: {
                        set: {
                            VERIFIER_MARKER:
                                "allowed"
                        }
                    },

                    policy:
                        STRICT_VERIFICATION_EXECUTION_POLICY
                }
            ]
        });


    const contract = {
        id:
            "docker-verifier-e2e",

        objective:
            "Verify code inside strict Docker execution isolation",

        rationale:
            "Execution isolation integration dogfood",

        scope: {
            allowedPaths: [
                "input.txt",
                "verified-output.txt"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    "Exercise deterministic verification"
            }
        ],

        acceptanceCriteria: [
            "Strict Docker verifier passes"
        ],

        verification: [
            {
                id:
                    "strict-docker",

                command:
                    "verify:strict-docker",

                required:
                    true
            }
        ],

        architecturalConstraints: [
            "Verification must execute without external network access",
            "Verification must not inherit host secrets",
            "Verification must see only the mounted workspace as host project data"
        ],

        maxLocalAttempts:
            1,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                0
        }
    };


    const run =
        createAutonomousRun({
            id:
                "docker-verifier-e2e-run",

            goal:
                "Exercise strict deterministic verifier",

            maxIterations:
                1
        });


    console.log(
        "Running DeterministicCommandVerifier through real Docker sandbox..."
    );


    const report =
        await verifier.verify({
            run,

            contract,

            attempt:
                1,

            workerResult: {
                summary:
                    "Prepared verification fixture",

                changedFiles: [
                    "input.txt"
                ]
            },

            workspace: {
                id:
                    "docker-verifier-workspace",

                root:
                    workspace,

                baseRevision:
                    "docker-verifier-base"
            }
        });


    console.log(
        JSON.stringify(
            report,
            null,
            2
        )
    );


    if (
        !report.passed
    ) {
        throw new Error(
            "Strict Docker DeterministicCommandVerifier report failed"
        );
    }


    if (
        report.checks.length !==
        1
    ) {
        throw new Error(
            `Expected exactly one verification check, received ${report.checks.length}`
        );
    }


    const check =
        report.checks[0];


    if (
        !check ||
        !check.passed
    ) {
        throw new Error(
            "Strict Docker verification check did not pass"
        );
    }


    if (
        check.stdout !==
        "strict-verifier-ok"
    ) {
        throw new Error(
            `Unexpected verifier stdout: ${JSON.stringify(
                check.stdout
            )}`
        );
    }


    const output =
        await readFile(
            outputPath,
            "utf8"
        );


    if (
        output !==
        "verified-inside-sandbox\n"
    ) {
        throw new Error(
            `Unexpected verifier workspace output: ${JSON.stringify(
                output
            )}`
        );
    }


    console.log(
        "PASS DeterministicCommandVerifier used DockerExecutionSandbox"
    );


    console.log(
        "PASS strict execution policy was accepted by Docker backend"
    );


    console.log(
        "PASS workspace was mounted and writable"
    );


    console.log(
        "PASS explicit verifier environment reached the container"
    );


    console.log(
        "PASS host secret environment did not reach the container"
    );


    console.log(
        "PASS external network was unavailable"
    );


    await access(
        outputPath
    );


    await delay(
        300
    );


    const remaining =
        await findContainers(
            dockerExecutable,
            containerName
        );


    if (
        remaining.length >
        0
    ) {
        throw new Error(
            [
                "Verifier left Docker container behind:",
                ...remaining
            ].join(
                "\n"
            )
        );
    }


    console.log(
        "PASS verifier container was removed"
    );


    console.log(
        ""
    );


    console.log(
        "REAL STRICT DOCKER VERIFIER E2E PASSED"
    );
} finally {
    delete process.env
        .GAME_FACTORY_HOST_SECRET;


    await removeContainerIfPresent(
        dockerExecutable,
        containerName
    );


    await rm(
        workspace,
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
        // Expected when the container is already gone.
    }
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