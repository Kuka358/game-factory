import {
    spawn
} from "node:child_process";

import path from "node:path";

import {
    fileURLToPath
} from "node:url";

export interface RunQaOptions {
    buildDir: string;
    headed?: boolean;
}

export interface RunQaResult {
    exitCode: number;
    reportPath: string;
}

export async function runQa(
    options: RunQaOptions
): Promise<RunQaResult> {
    const absoluteBuildPath =
        path.resolve(
            options.buildDir
        );

    const workspaceRoot =
        path.dirname(
            absoluteBuildPath
        );

    const reportPath =
        path.join(
            workspaceRoot,
            "qa",
            "qa-report.json"
        );

    const currentFile =
        fileURLToPath(
            import.meta.url
        );

    const qaPackageDir =
        path.dirname(
            path.dirname(currentFile)
        );

    const env = {
        ...process.env,

        GAME_FACTORY_BUILD_DIR:
            absoluteBuildPath,

        GAME_FACTORY_QA_REPORT:
            reportPath
    };

    const playwrightArgs = [
        "exec",
        "playwright",
        "test"
    ];

    if (options.headed) {
        playwrightArgs.push(
            "--headed"
        );
    }

    const exitCode =
        await runProcess(
            qaPackageDir,
            env,
            playwrightArgs
        );

    return {
        exitCode,
        reportPath
    };
}

function runProcess(
    cwd: string,
    env: NodeJS.ProcessEnv,
    args: string[]
): Promise<number> {
    return new Promise(
        (resolve, reject) => {
            const command =
                process.platform === "win32"
                    ? process.env.ComSpec ??
                      "cmd.exe"
                    : "pnpm";

            const child =
                process.platform === "win32"
                    ? spawn(
                          command,
                          [
                              "/d",
                              "/s",
                              "/c",
                              [
                                  "pnpm",
                                  ...args
                              ].join(" ")
                          ],
                          {
                              cwd,
                              env,
                              stdio: "inherit"
                          }
                      )
                    : spawn(
                          command,
                          args,
                          {
                              cwd,
                              env,
                              stdio: "inherit"
                          }
                      );

            child.once(
                "error",
                reject
            );

            child.once(
                "exit",
                (code) => {
                    resolve(
                        code ?? 1
                    );
                }
            );
        }
    );
}