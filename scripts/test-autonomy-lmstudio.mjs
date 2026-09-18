import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    pathToFileURL
} from "node:url";

import ts from "typescript";

import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AICodingHarness
} from "../packages/autonomy/dist/index.js";


const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";

const model =
    process.env.LM_STUDIO_MODEL;

if (!model) {
    throw new Error(
        "LM_STUDIO_MODEL is required"
    );
}

const timeoutMs =
    Number(
        process.env
            .LM_STUDIO_TIMEOUT_MS ??
        "180000"
    );

if (
    !Number.isFinite(
        timeoutMs
    ) ||
    timeoutMs <= 0
) {
    throw new Error(
        "LM_STUDIO_TIMEOUT_MS must be a positive number"
    );
}


const repositoryRoot =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-qwen-coding-"
        )
    );

let succeeded =
    false;


try {
    await mkdir(
        join(
            repositoryRoot,
            "src"
        ),
        {
            recursive:
                true
        }
    );

    const initialSource =
        [
            "export function add(",
            "    left: number,",
            "    right: number",
            "): number {",
            "    return left + right;",
            "}",
            ""
        ].join(
            "\n"
        );

    await writeFile(
        join(
            repositoryRoot,
            "src",
            "math.ts"
        ),
        initialSource,
        "utf8"
    );

    /*
     * This file is deliberately outside the iteration scope.
     * The model must never touch it.
     */
    await writeFile(
        join(
            repositoryRoot,
            "do-not-touch.txt"
        ),
        "protected\n",
        "utf8"
    );


    const provider =
        new LMStudioProvider({
            baseUrl,
            timeoutMs
        });


    const harness =
        new AICodingHarness({
            provider,

            model,

            temperature:
                0.1,

            maxTokens:
                4096
        });


    const contract = {
        id:
            "qwen-clamp-smoke",

        objective:
            "Add a clamp function to the existing TypeScript math module",

        rationale:
            "Verify that the local coding model can safely implement a real source edit",

        scope: {
            /*
             * Deliberately allow ONE file only.
             */
            allowedPaths: [
                "src/math.ts"
            ],

            forbiddenPaths:
                []
        },

        changes: [
            {
                description:
                    [
                        "Preserve the existing exported add function.",
                        "Add an exported function named clamp.",
                        "Its signature must accept value, min and max as numbers.",
                        "It must return min when value is below min.",
                        "It must return max when value is above max.",
                        "Otherwise it must return value.",
                        "Keep the implementation simple and idiomatic TypeScript."
                    ].join(
                        " "
                    ),

                filesHint: [
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "The existing add function still works",
            "clamp(5, 0, 10) returns 5",
            "clamp(-2, 0, 10) returns 0",
            "clamp(42, 0, 10) returns 10"
        ],

        verification:
            [],

        architecturalConstraints: [
            "Do not add dependencies",
            "Do not modify files other than src/math.ts"
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


    console.log(
        "Running live Qwen coding smoke..."
    );

    console.log(
        `Provider URL: ${baseUrl}`
    );

    console.log(
        `Model: ${model}`
    );

    console.log(
        `Temporary repository: ${repositoryRoot}`
    );


    const result =
        await harness.executeIteration({
            repositoryRoot,

            runId:
                "qwen-live-smoke",

            goal:
                "Verify local Qwen coding through AICodingHarness",

            contract,

            attempt:
                1
        });


    console.log(
        "\nHarness result:"
    );

    console.log(
        JSON.stringify(
            result,
            null,
            2
        )
    );


    if (
        !result.changedFiles
            .includes(
                "src/math.ts"
            )
    ) {
        throw new Error(
            "Qwen did not return an edit for src/math.ts"
        );
    }


    const generatedSource =
        await readFile(
            join(
                repositoryRoot,
                "src",
                "math.ts"
            ),
            "utf8"
        );


    console.log(
        "\nGenerated src/math.ts:"
    );

    console.log(
        "----------------------------------------"
    );

    console.log(
        generatedSource
    );

    console.log(
        "----------------------------------------"
    );


    if (
        generatedSource ===
        initialSource
    ) {
        throw new Error(
            "src/math.ts was not actually changed"
        );
    }


    const protectedFile =
        await readFile(
            join(
                repositoryRoot,
                "do-not-touch.txt"
            ),
            "utf8"
        );

    if (
        protectedFile !==
        "protected\n"
    ) {
        throw new Error(
            "File outside iteration scope was modified"
        );
    }


    /*
     * Compile the generated TypeScript to ESM.
     *
     * This verifies that the model did not merely produce
     * plausible-looking text.
     */
    const transpiled =
        ts.transpileModule(
            generatedSource,
            {
                fileName:
                    "math.ts",

                reportDiagnostics:
                    true,

                compilerOptions: {
                    target:
                        ts.ScriptTarget
                            .ES2022,

                    module:
                        ts.ModuleKind
                            .ES2022,

                    strict:
                        true
                }
            }
        );


    const errors =
        (
            transpiled
                .diagnostics ??
            []
        ).filter(
            diagnostic =>
                diagnostic.category ===
                ts.DiagnosticCategory
                    .Error
        );


    if (
        errors.length >
        0
    ) {
        const messages =
            errors.map(
                diagnostic =>
                    ts.flattenDiagnosticMessageText(
                        diagnostic.messageText,
                        "\n"
                    )
            );

        throw new Error(
            [
                "Generated TypeScript contains compilation errors:",
                ...messages
            ].join(
                "\n"
            )
        );
    }


    const compiledPath =
        join(
            repositoryRoot,
            "math.mjs"
        );

    await writeFile(
        compiledPath,
        transpiled.outputText,
        "utf8"
    );


    const moduleUrl =
        pathToFileURL(
            compiledPath
        );

    const generatedModule =
        await import(
            moduleUrl.href
        );


    if (
        typeof generatedModule.add !==
        "function"
    ) {
        throw new Error(
            "Generated module no longer exports add()"
        );
    }

    if (
        typeof generatedModule.clamp !==
        "function"
    ) {
        throw new Error(
            "Generated module does not export clamp()"
        );
    }


    const checks = [
        {
            name:
                "add(2, 3)",

            actual:
                generatedModule.add(
                    2,
                    3
                ),

            expected:
                5
        },

        {
            name:
                "clamp(5, 0, 10)",

            actual:
                generatedModule.clamp(
                    5,
                    0,
                    10
                ),

            expected:
                5
        },

        {
            name:
                "clamp(-2, 0, 10)",

            actual:
                generatedModule.clamp(
                    -2,
                    0,
                    10
                ),

            expected:
                0
        },

        {
            name:
                "clamp(42, 0, 10)",

            actual:
                generatedModule.clamp(
                    42,
                    0,
                    10
                ),

            expected:
                10
        }
    ];


    for (
        const check of
        checks
    ) {
        if (
            check.actual !==
            check.expected
        ) {
            throw new Error(
                `${check.name}: expected ${check.expected}, got ${check.actual}`
            );
        }

        console.log(
            `PASS ${check.name} = ${check.actual}`
        );
    }


    succeeded =
        true;

    console.log(
        "\nLIVE QWEN CODING SMOKE PASSED"
    );
} finally {
    if (succeeded) {
        await rm(
            repositoryRoot,
            {
                recursive:
                    true,

                force:
                    true
            }
        );
    } else {
        /*
         * Keep the failed fixture so it can be inspected manually.
         */
        console.error(
            `\nSmoke fixture preserved for debugging: ${repositoryRoot}`
        );
    }
}