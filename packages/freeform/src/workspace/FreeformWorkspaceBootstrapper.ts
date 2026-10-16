
import { execFile } from "node:child_process";
import {
    mkdir,
    readFile,
    realpath,
    rm,
    writeFile
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
    validateFreeformBlueprint
} from "../validation/FreeformBlueprintValidator.js";

const execFileAsync = promisify(execFile);

export interface FreeformWorkspaceBootstrapperOptions {
    // Trusted application configuration, never model output.
    gamesDirectory: string;
}

export interface FreeformWorkspaceResult {
    root: string;
    blueprintId: string;
    headSha: string;
}

export class FreeformWorkspaceBootstrapper {
    private readonly gamesDirectory: string;

    constructor(
        options: FreeformWorkspaceBootstrapperOptions
    ) {
        if (
            !options.gamesDirectory ||
            !isAbsolute(options.gamesDirectory)
        ) {
            throw new Error(
                "gamesDirectory must be an absolute path"
            );
        }

        this.gamesDirectory = resolve(
            options.gamesDirectory
        );
    }

    async create(
        input: unknown
    ): Promise<FreeformWorkspaceResult> {
        const result = validateFreeformBlueprint(input);

        if (!result.valid) {
            throw new Error(
                "Cannot bootstrap invalid Blueprint: " +
                result.errors.map(error =>
                    `${error.path}: ${error.message}`
                ).join("; ")
            );
        }

        const blueprint = result.data;

        if (!blueprint.constraints.offlineRuntime) {
            throw new Error(
                "Freeform workspace requires offline runtime"
            );
        }

        // Windows device names are not valid directory names.
        if (
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/
                .test(blueprint.id)
        ) {
            throw new Error(
                "Reserved workspace directory name"
            );
        }

        await mkdir(this.gamesDirectory, {
            recursive: true
        });

        const parent = await realpath(
            this.gamesDirectory
        );

        // Blueprint ID has already passed a strict regex.
        const root = join(parent, blueprint.id);

        // Non-recursive mkdir: never reuse or overwrite a game.
        await mkdir(root);

        try {
            await mkdir(join(root, "src"));
            await mkdir(join(root, "src", "game"));

            const files: Array<[string, string]> = [
                [
                    "package.json",
                    JSON.stringify({
                        name: `game-${blueprint.id}`,
                        version: "0.1.0",
                        private: true,
                        type: "module",
                        scripts: {
                            dev: "vite --host 127.0.0.1",
                            build: "vite build",
                            typecheck: "tsc --noEmit"
                        },
                        dependencies: {
                            phaser: "3.90.0"
                        },
                        devDependencies: {
                            typescript: "5.9.3",
                            vite: "7.3.6"
                        }
                    }, null, 2) + "\n"
                ],
                [
                    "tsconfig.json",
                    JSON.stringify({
                        compilerOptions: {
                            target: "ES2022",
                            lib: ["ES2022", "DOM"],
                            module: "ESNext",
                            moduleResolution: "Bundler",
                            strict: true,
                            skipLibCheck: true,
                            noEmit: true,
                            isolatedModules: true
                        },
                        include: ["src/**/*.ts"]
                    }, null, 2) + "\n"
                ],
                [
                    "vite.config.ts",
                    [
                        'import { defineConfig } from "vite";',
                        "",
                        "export default defineConfig({",
                        '    base: "./",',
                        "    server: {",
                        '        host: "127.0.0.1"',
                        "    },",
                        "    build: {",
                        '        outDir: "dist"',
                        "    }",
                        "});",
                        ""
                    ].join("\n")
                ],
                [
                    ".gitignore",
                    [
                        "node_modules/",
                        "dist/",
                        ".vite/",
                        ".game-factory/",
                        ".env",
                        ".env.*",
                        "!.env.example",
                        "",
                    ].join("\n")
                ],
                [
                    "index.html",
                    createHtml(blueprint.title)
                ],
                [
                    "src/main.ts",
                    createEntryPoint(
                        blueprint.title,
                        blueprint.viewport.width,
                        blueprint.viewport.height
                    )
                ],
                [
                    "src/game/.gitkeep",
                    ""
                ]
            ];

            for (const [filename, contents] of files) {
                await writeFile(
                    join(root, filename),
                    contents,
                    {
                        encoding: "utf8",
                        flag: "wx"
                    }
                );
            }

            // Initial Git revision is required by
            // GitWorktreeManager in @game-factory/autonomy.
            await git(root, [
                "init",
                "--initial-branch=main"
            ]);

            await git(root, ["add", "-A"]);

            await git(root, [
                "-c", "user.name=Game Factory",
                "-c", "user.email=game-factory@localhost",
                "-c", "commit.gpgsign=false",
                "commit",
                "-m", "chore: bootstrap freeform game"
            ]);

            const headSha = await git(root, [
                "rev-parse",
                "HEAD"
            ]);

            return {
                root,
                blueprintId: blueprint.id,
                headSha
            };
        } catch (error) {
            // This directory was created exclusively by us.
            // Never remove a pre-existing workspace.
            try {
                await rm(root, {
                    recursive: true,
                    force: true
                });
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    `Workspace bootstrap failed and cleanup failed: ${root}`
                );
            }

            throw error;
        }
    }
}

async function git(
    cwd: string,
    args: string[]
): Promise<string> {
    const result = await execFileAsync(
        "git",
        [
            ...(process.platform === "win32"
                ? ["-c", "core.longpaths=true"]
                : []),
            ...args
        ],
        {
            cwd,
            encoding: "utf8",
            windowsHide: true
        }
    );

    return result.stdout.trim();
}

function createHtml(title: string): string {
    const escapedTitle = title
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport"
          content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <style>
        html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            background: #101827;
            overflow: hidden;
        }
        #game {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
    </style>
</head>
<body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;
}

function createEntryPoint(
    title: string,
    width: number,
    height: number
): string {
    const message = JSON.stringify(
        `${title}\nReady for generation`
    );

    return `import Phaser from "phaser";

class BootstrapScene extends Phaser.Scene {
    constructor() {
        super("BootstrapScene");
    }

    create(): void {
        this.cameras.main.setBackgroundColor("#101827");

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,
            ${message},
            {
                color: "#ffffff",
                fontSize: "24px",
                align: "center"
            }
        ).setOrigin(0.5);
    }
}

new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: ${width},
    height: ${height},
    backgroundColor: "#101827",
    scene: [BootstrapScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
});
`;
}
