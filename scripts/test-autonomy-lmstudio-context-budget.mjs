import {
    mkdtemp,
    mkdir,
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
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AICodingHarness
} from "../packages/autonomy/dist/index.js";


const model =
    process.env.LM_STUDIO_MODEL;


if (!model) {
    throw new Error(
        "LM_STUDIO_MODEL is required"
    );
}


const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";


const timeoutMs =
    Number(
        process.env.LM_STUDIO_TIMEOUT_MS ??
        "600000"
    );


const repository =
    await mkdtemp(
        join(
            tmpdir(),
            "game-factory-context-budget-"
        )
    );


try {
    await mkdir(
        join(
            repository,
            "src"
        ),
        {
            recursive:
                true
        }
    );


    await writeFile(
        join(
            repository,
            "src",
            "target.ts"
        ),
        [
            "export function add(",
            "    a: number,",
            "    b: number",
            "): number {",
            "    return a + b;",
            "}",
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );


    const provider =
        new LMStudioProvider({
            baseUrl,
            timeoutMs
        });


    let budgetObserved =
        false;


    const harness =
        new AICodingHarness({
            provider,

            model,

            temperature:
                0.1,

            maxTokens:
                8_192,

            modelContext: {
                contextWindowTokens:
                    32_768,

                safetyMarginTokens:
                    2_048,

                requestOverheadTokens:
                    512
            },

            contextBudgetObserver(
                report
            ) {
                budgetObserved =
                    true;


                console.log(
                    "\nMODEL CONTEXT BUDGET"
                );


                console.log(
                    "===================="
                );


                console.log(
                    `context window:      ${report.contextWindowTokens}`
                );


                console.log(
                    `reserved output:     ${report.reservedOutputTokens}`
                );


                console.log(
                    `safety margin:       ${report.safetyMarginTokens}`
                );


                console.log(
                    `request overhead:    ${report.requestOverheadTokens}`
                );


                console.log(
                    `max input:           ${report.maxInputTokens}`
                );


                console.log(
                    `estimated input:     ${report.estimatedInputTokens}`
                );


                console.log(
                    `remaining headroom:  ${report.remainingHeadroomTokens}`
                );


                console.log(
                    `files selected:      ${report.selectedFileCount}`
                );


                console.log(
                    `files skipped:       ${report.skippedFileCount}`
                );


                console.log(
                    "===================="
                );
            }
        });


    const result =
        await harness.executeIteration({
            repositoryRoot:
                repository,

            runId:
                "context-budget-smoke",

            goal:
                "Make no code changes and inspect the supplied source",

            attempt:
                1,

            contract: {
                id:
                    "context-budget-smoke",

                objective:
                    "Inspect target.ts without modifying it",

                rationale:
                    "Validate real LM Studio context budgeting",

                scope: {
                    allowedPaths: [
                        "src/target.ts"
                    ],

                    forbiddenPaths:
                        []
                },

                changes: [
                    {
                        description:
                            "Inspect target.ts and return no edits",

                        filesHint: [
                            "src/target.ts"
                        ]
                    }
                ],

                acceptanceCriteria: [
                    "No file changes are produced"
                ],

                verification:
                    [],

                architecturalConstraints: [
                    "Do not modify files"
                ],

                maxLocalAttempts:
                    1,

                escalation: {
                    onRepeatedFailure:
                        false,

                    onArchitectureConflict:
                        false,

                    maxRepairRounds:
                        0
                }
            }
        });


    if (
        !budgetObserved
    ) {
        throw new Error(
            "Context budget observer was not called"
        );
    }


    if (
        result.changedFiles.length !==
        0
    ) {
        throw new Error(
            `Context budget smoke unexpectedly modified files: ${result.changedFiles.join(", ")}`
        );
    }


    console.log(
        "\nREAL LM STUDIO CONTEXT BUDGET SMOKE PASSED"
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