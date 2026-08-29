import {
    fileURLToPath
} from "node:url";

import {
    dirname,
    resolve
} from "node:path";

import {
    runGenerationPipeline,
    runPromptGenerationPipeline
} from "@game-factory/orchestrator";

async function main():
    Promise<void>
{
    const rawInput =
        process.argv
            .slice(2)
            .join(" ")
            .trim();

    if (!rawInput) {
        throw new Error(
            [
                "Game Factory input is required.",
                "",
                "Generate from GameSpec:",
                "",
                "  pnpm generate examples/runner-basic.json",
                "",
                "Generate from prompt:",
                "",
                '  pnpm generate "Игра про рыцаря, который убегает от дракона"'
            ].join(
                "\n"
            )
        );
    }

    const repoRoot =
        resolveRepoRoot();

    const outputRoot =
        resolve(
            repoRoot,
            "generated"
        );

    const isGameSpecFile =
        rawInput
            .toLowerCase()
            .endsWith(
                ".json"
            );

    const result =
        isGameSpecFile
            ? await runGenerationPipeline(
                resolve(
                    repoRoot,
                    rawInput
                ),

                outputRoot
            )
            : await runPromptGenerationPipeline(
                rawInput,
                outputRoot
            );

    console.log("");

    console.log(
        `Title: ${result.generation.spec.metadata.title}`
    );

    console.log(
        `Workspace: ${result.generation.workspace.root}`
    );

    console.log(
        `Build: ${result.generation.workspace.buildDir}`
    );

    console.log(
        `QA Report: ${result.generation.workspace.qaDir}`
    );

    console.log("");

    console.log(
        "RESULT: PASS"
    );
}

function resolveRepoRoot():
    string
{
    const currentFile =
        fileURLToPath(
            import.meta.url
        );

    const currentDirectory =
        dirname(
            currentFile
        );

    /*
     * apps/cli/src/main.ts
     *
     * src -> cli -> apps -> repo root
     */
    return resolve(
        currentDirectory,
        "../../.."
    );
}

main().catch(
    (error: unknown) => {
        if (
            error instanceof
            Error
        ) {
            console.error(
                error.message
            );

            if (
                error.cause instanceof
                Error
            ) {
                console.error(
                    error.cause.message
                );
            }
        } else {
            console.error(
                error
            );
        }

        process.exitCode =
            1;
    }
);