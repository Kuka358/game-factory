import {
    cp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    join
} from "node:path";

export interface ExportYandexBuildInput {
    sourceBuildDir:
        string;

    outputDir:
        string;
}

export interface ExportYandexBuildResult {
    outputDir:
        string;

    indexPath:
        string;
}

const YANDEX_MARKER =
    "Game Factory: Yandex Games";

export async function exportYandexBuild(
    input:
        ExportYandexBuildInput
): Promise<ExportYandexBuildResult> {
    await rm(
        input.outputDir,
        {
            recursive:
                true,

            force:
                true
        }
    );

    await mkdir(
        input.outputDir,
        {
            recursive:
                true
        }
    );

    await cp(
        input.sourceBuildDir,
        input.outputDir,
        {
            recursive:
                true
        }
    );

    const indexPath =
        join(
            input.outputDir,
            "index.html"
        );

    const originalHtml =
        await readFile(
            indexPath,
            "utf8"
        );

    const yandexHtml =
        injectYandexSdk(
            originalHtml
        );

    await writeFile(
        indexPath,
        yandexHtml,
        "utf8"
    );

    return {
        outputDir:
            input.outputDir,

        indexPath
    };
}

function injectYandexSdk(
    html:
        string
): string {
    if (
        html.includes(
            YANDEX_MARKER
        )
    ) {
        return html;
    }

    const headEnd =
        html.indexOf(
            "</head>"
        );

    if (
        headEnd === -1
    ) {
        throw new Error(
            "Generated index.html does not contain </head>"
        );
    }

    const integration =
        createYandexIntegration();

    return [
        html.slice(
            0,
            headEnd
        ),

        integration,

        html.slice(
            headEnd
        )
    ].join(
        ""
    );
}

function createYandexIntegration():
    string
{
    return `
    <!-- ${YANDEX_MARKER} -->

    <script>
        globalThis.__GAME_FACTORY_PLATFORM__ = "yandex";
    </script>

    <script src="/sdk.js"></script>

`;
}