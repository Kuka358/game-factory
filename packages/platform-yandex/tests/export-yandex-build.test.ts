import {
    mkdtemp,
    mkdir,
    readFile,
    writeFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import {
    tmpdir
} from "node:os";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    exportYandexBuild
} from "../src/exporter/index.js";

describe(
    "exportYandexBuild",
    () => {
        it(
            "creates Yandex-ready build",
            async () => {
                const root =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-yandex-"
                        )
                    );

                const sourceBuildDir =
                    join(
                        root,
                        "build"
                    );

                const outputDir =
                    join(
                        root,
                        "yandex"
                    );

                await mkdir(
                    join(
                        sourceBuildDir,
                        "assets"
                    ),
                    {
                        recursive:
                            true
                    }
                );

                await writeFile(
                    join(
                        sourceBuildDir,
                        "index.html"
                    ),

                    [
                        "<!doctype html>",
                        "<html>",
                        "<head>",
                        "<title>Test</title>",
                        "</head>",
                        "<body>",
                        '<script type="module" src="./assets/game.js"></script>',
                        "</body>",
                        "</html>"
                    ].join(
                        "\n"
                    ),

                    "utf8"
                );

                await writeFile(
                    join(
                        sourceBuildDir,
                        "assets",
                        "game.js"
                    ),

                    "console.log('game');",

                    "utf8"
                );

                const result =
                    await exportYandexBuild({
                        sourceBuildDir,
                        outputDir
                    });

                const html =
                    await readFile(
                        result.indexPath,
                        "utf8"
                    );

                expect(
                    html
                ).toContain(
                    '__GAME_FACTORY_PLATFORM__ = "yandex"'
                );

                expect(
                    html
                ).toContain(
                    '<script src="/sdk.js"></script>'
                );

                expect(
                    html.indexOf(
                        "/sdk.js"
                    )
                ).toBeLessThan(
                    html.indexOf(
                        "./assets/game.js"
                    )
                );

                const copiedAsset =
                    await readFile(
                        join(
                            outputDir,
                            "assets",
                            "game.js"
                        ),
                        "utf8"
                    );

                expect(
                    copiedAsset
                ).toBe(
                    "console.log('game');"
                );
            }
        );

        it(
            "does not inject SDK twice",
            async () => {
                const root =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-yandex-"
                        )
                    );

                const sourceBuildDir =
                    join(
                        root,
                        "build"
                    );

                const outputDir =
                    join(
                        root,
                        "yandex"
                    );

                await mkdir(
                    sourceBuildDir,
                    {
                        recursive:
                            true
                    }
                );

                await writeFile(
                    join(
                        sourceBuildDir,
                        "index.html"
                    ),

                    `<!doctype html>
<html>
<head>
    <!-- Game Factory: Yandex Games -->
    <script src="/sdk.js"></script>
</head>
<body></body>
</html>`,

                    "utf8"
                );

                await exportYandexBuild({
                    sourceBuildDir,
                    outputDir
                });

                const html =
                    await readFile(
                        join(
                            outputDir,
                            "index.html"
                        ),
                        "utf8"
                    );

                expect(
                    html.match(
                        /Game Factory: Yandex Games/g
                    )
                ).toHaveLength(
                    1
                );
            }
        );
    }
);