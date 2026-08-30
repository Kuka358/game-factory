import {
    createHash
} from "node:crypto";

import {
    mkdir,
    readFile,
    writeFile
} from "node:fs/promises";

import {
    dirname,
    join,
    resolve
} from "node:path";

import {
    fileURLToPath
} from "node:url";

import {
    AssetProcessor,
    ComfyUIProvider,
    SingleSubjectAssetValidator,
    applyAssetGenerationProfilePolicy,
    buildAssetGenerationPrompt
} from "../dist/index.js";

import {
    benchmarkCases
} from "./benchmark-cases.mjs";


const MAX_SEED =
    2_147_483_647;


const scriptDirectory =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );

const packageRoot =
    resolve(
        scriptDirectory,
        ".."
    );

const repositoryRoot =
    resolve(
        packageRoot,
        "..",
        ".."
    );


const comfyUrl =
    process.env
        .GAME_FACTORY_COMFYUI_URL ??
    "http://127.0.0.1:8188";


const timeoutMs =
    parsePositiveInteger(
        process.env
            .GAME_FACTORY_COMFYUI_TIMEOUT_MS,

        600_000
    );


const outputNodeId =
    process.env
        .GAME_FACTORY_COMFYUI_OUTPUT_NODE ??
    "8";


const profileFilter =
    normalizeFilter(
        process.env
            .GAME_FACTORY_BENCHMARK_PROFILE
    );


const variantFilter =
    normalizeFilter(
        process.env
            .GAME_FACTORY_BENCHMARK_VARIANT
    );


const caseFilter =
    normalizeFilter(
        process.env
            .GAME_FACTORY_BENCHMARK_CASE
    );


const seedCount =
    parsePositiveInteger(
        process.env
            .GAME_FACTORY_BENCHMARK_SEED_COUNT,

        5
    );


const seedOffset =
    resolveSeedOffset();


const processor =
    new AssetProcessor();


const validator =
    new SingleSubjectAssetValidator();


const baselineWorkflowFiles = {
    character:
        "character-single.json",

    npc:
        "npc-single.json",

    item:
        "item-single.json",

    obstacle:
        "obstacle-single.json",

    ui:
        "ui-element.json"
};


const variants = [
    {
        id:
            "baseline",

        model:
            "sdxl-base+pixel-art-xl",

        workflowForProfile(
            profile
        ) {
            const filename =
                baselineWorkflowFiles[
                    profile
                ];

            if (
                !filename
            ) {
                throw new Error(
                    `No baseline workflow for profile "${profile}"`
                );
            }

            return filename;
        }
    },

    {
        id:
            "flux-klein",

        model:
            "flux2-klein-4b+pixel-art-lora",

        workflowForProfile() {
            return "benchmark/sprite-flux-klein.json";
        }
    }
];


const selectedCases =
    benchmarkCases.filter(
        testCase =>
            (
                !profileFilter ||
                testCase.profile ===
                    profileFilter
            ) &&
            (
                !caseFilter ||
                testCase.id ===
                    caseFilter ||
                testCase.id.includes(
                    caseFilter
                )
            )
    );


const selectedVariants =
    variants.filter(
        variant =>
            !variantFilter ||
            variant.id ===
                variantFilter
    );


if (
    selectedCases.length ===
    0
) {
    throw new Error(
        [
            "No benchmark cases matched.",
            `profile=${profileFilter ?? "*"}`,
            `case=${caseFilter ?? "*"}`
        ].join(
            " "
        )
    );
}


if (
    selectedVariants.length ===
    0
) {
    throw new Error(
        `No benchmark variant matched "${variantFilter}"`
    );
}


const timestamp =
    new Date()
        .toISOString()
        .replace(
            /[:.]/g,
            "-"
        );


const outputRoot =
    join(
        repositoryRoot,
        ".game-factory",
        "benchmarks",
        "asset-quality",
        timestamp
    );


await mkdir(
    outputRoot,
    {
        recursive:
            true
    }
);


const runConfiguration = {
    generatedAt:
        new Date()
            .toISOString(),

    comfyUrl,

    timeoutMs,

    outputNodeId,

    seedCount,

    seedOffset,

    profileFilter,

    caseFilter,

    variantFilter,

    cases:
        selectedCases.map(
            testCase =>
                testCase.id
        ),

    variants:
        selectedVariants.map(
            variant =>
                variant.id
        )
};


await writeJson(
    join(
        outputRoot,
        "config.json"
    ),
    runConfiguration
);


const totalRuns =
    selectedCases.length *
    selectedVariants.length *
    seedCount;


console.log(
    [
        "Asset quality benchmark",
        `cases=${selectedCases.length}`,
        `seeds=${seedCount}`,
        `variants=${selectedVariants.length}`,
        `runs=${totalRuns}`,
        `seedOffset=${seedOffset}`,
        `output=${outputRoot}`
    ].join(
        "\n"
    )
);


const workflowCache =
    new Map();


const results =
    [];


let completedRuns =
    0;


/*
 * IMPORTANT:
 *
 * Variants are the outer loop intentionally.
 *
 * This lets ComfyUI keep the same heavy model loaded while
 * we benchmark all cases/seeds for that model.
 */
for (
    const variant of
    selectedVariants
) {
    console.log(
        [
            "",
            "==================================================",
            `MODEL: ${variant.id}`,
            `IDENTITY: ${variant.model}`,
            "=================================================="
        ].join(
            "\n"
        )
    );


    for (
        const testCase of
        selectedCases
    ) {
        console.log(
            `\n[${testCase.profile}] ${testCase.id}`
        );


        const workflowFilename =
            variant.workflowForProfile(
                testCase.profile
            );


        const workflow =
            await loadWorkflowCached(
                workflowFilename
            );


        const provider =
            new ComfyUIProvider({
                baseUrl:
                    comfyUrl,

                model:
                    variant.model,

                workflow,

                outputNodeId,

                timeoutMs
            });


        const caseSeeds =
            createCaseSeeds(
                testCase.id,
                seedCount,
                seedOffset
            );


        for (
            let seedIndex =
                0;

            seedIndex <
                caseSeeds.length;

            seedIndex +=
                1
        ) {
            const seed =
                caseSeeds[
                    seedIndex
                ];


            const result =
                await runBenchmarkCase({
                    testCase,
                    variant,
                    provider,
                    seed,
                    seedIndex
                });


            results.push(
                result
            );


            completedRuns +=
                1;


            console.log(
                [
                    `  seed ${seedIndex + 1}/${seedCount}`,
                    `seed=${seed}`,
                    formatResult(
                        result
                    ),
                    `[${completedRuns}/${totalRuns}]`
                ].join(
                    " "
                )
            );


            /*
             * Write checkpoint data after every generation.
             *
             * If ComfyUI or the script crashes during a huge run,
             * completed results are not lost.
             */
            await writeJson(
                join(
                    outputRoot,
                    "partial-results.json"
                ),
                results
            );
        }
    }
}


const summary =
    buildSummary(
        results,
        runConfiguration
    );


await writeJson(
    join(
        outputRoot,
        "results.json"
    ),
    results
);


await writeJson(
    join(
        outputRoot,
        "summary.json"
    ),
    summary
);


await writeFile(
    join(
        outputRoot,
        "runs.csv"
    ),
    createRunsCsv(
        results
    ),
    "utf8"
);


await writeFile(
    join(
        outputRoot,
        "summary.csv"
    ),
    createSummaryCsv(
        summary
    ),
    "utf8"
);


console.log(
    [
        "",
        "==================================================",
        "BENCHMARK COMPLETE",
        "==================================================",
        "",
        formatSummaryForConsole(
            summary
        ),
        "",
        `Results: ${outputRoot}`
    ].join(
        "\n"
    )
);


async function runBenchmarkCase({
    testCase,
    variant,
    provider,
    seed,
    seedIndex
}) {
    const directory =
        join(
            outputRoot,
            testCase.profile,
            testCase.id,
            variant.id,
            `seed-${seedIndex + 1}-${seed}`
        );


    await mkdir(
        directory,
        {
            recursive:
                true
        }
    );


    const request = {
        role:
            testCase.role,

        profile:
            testCase.profile,

        kind:
            "sprite",

        tags:
            testCase.tags,

        style:
            "pixel-art",

        width:
            512,

        height:
            512,

        transparent:
            true,

        singleSubject:
            true,

        allowSpritesheet:
            false,

        uiKind:
            testCase.uiKind,

        seed,

        format:
            "png"
    };


    const initialPrompt =
        buildAssetGenerationPrompt(
            request
        );


    const prompt =
        applyAssetGenerationProfilePolicy(
            initialPrompt,
            request
        );


    const metadata = {
        caseId:
            testCase.id,

        profile:
            testCase.profile,

        role:
            testCase.role,

        variant:
            variant.id,

        model:
            variant.model,

        seed,

        seedIndex,

        tags:
            testCase.tags,

        uiKind:
            testCase.uiKind ??
            null,

        prompt:
            prompt.positive,

        negativePrompt:
            prompt.negative
    };


    const totalStart =
        performance.now();


    let generated;


    const generationStart =
        performance.now();


    try {
        generated =
            await provider.generate({
                profile:
                    request.profile,

                prompt:
                    prompt.positive,

                negativePrompt:
                    prompt.negative,

                width:
                    request.width,

                height:
                    request.height,

                format:
                    request.format,

                seed:
                    request.seed
            });
    } catch (
        error
    ) {
        const generationMs =
            elapsed(
                generationStart
            );


        const result = {
            ...metadata,

            status:
                "generation_failed",

            generationMs,

            processingMs:
                null,

            validationMs:
                null,

            totalMs:
                elapsed(
                    totalStart
                ),

            issues:
                [],

            error:
                errorMessage(
                    error
                )
        };


        await writeJson(
            join(
                directory,
                "result.json"
            ),
            result
        );


        return result;
    }


    const generationMs =
        elapsed(
            generationStart
        );


    await writeFile(
        join(
            directory,
            "raw.png"
        ),
        generated.bytes
    );


    let processed;


    const processingStart =
        performance.now();


    try {
        processed =
            await processor.process(
                generated,
                request
            );
    } catch (
        error
    ) {
        const processingMs =
            elapsed(
                processingStart
            );


        const result = {
            ...metadata,

            status:
                "processing_failed",

            generationMs,

            processingMs,

            validationMs:
                null,

            totalMs:
                elapsed(
                    totalStart
                ),

            issues:
                [],

            error:
                errorMessage(
                    error
                )
        };


        await writeJson(
            join(
                directory,
                "result.json"
            ),
            result
        );


        return result;
    }


    const processingMs =
        elapsed(
            processingStart
        );


    await writeFile(
        join(
            directory,
            "processed.png"
        ),
        processed.image.bytes
    );


    const validationStart =
        performance.now();


    let validation;


    try {
        validation =
            await validator.validate(
                processed.image,
                request
            );
    } catch (
        error
    ) {
        const validationMs =
            elapsed(
                validationStart
            );


        const result = {
            ...metadata,

            status:
                "validation_error",

            generationMs,

            processingMs,

            validationMs,

            totalMs:
                elapsed(
                    totalStart
                ),

            issues:
                [],

            processing:
                processed.metadata,

            error:
                errorMessage(
                    error
                )
        };


        await writeJson(
            join(
                directory,
                "result.json"
            ),
            result
        );


        return result;
    }


    const validationMs =
        elapsed(
            validationStart
        );


    const issues =
        validation.issues.map(
            issue => ({
                code:
                    issue.code,

                message:
                    issue.message
            })
        );


    const result = {
        ...metadata,

        status:
            validation.valid
                ? "valid"
                : "validation_failed",

        generationMs,

        processingMs,

        validationMs,

        totalMs:
            elapsed(
                totalStart
            ),

        issues,

        processing:
            processed.metadata,

        error:
            null
    };


    await writeJson(
        join(
            directory,
            "result.json"
        ),
        result
    );


    return result;
}


async function loadWorkflowCached(
    filename
) {
    if (
        workflowCache.has(
            filename
        )
    ) {
        return workflowCache.get(
            filename
        );
    }


    const path =
        join(
            repositoryRoot,
            "config",
            "comfyui",
            filename
        );


    const source =
        await readFile(
            path,
            "utf8"
        );


    const workflow =
        JSON.parse(
            source
        );


    workflowCache.set(
        filename,
        workflow
    );


    return workflow;
}


function createCaseSeeds(
    caseId,
    count,
    offset
) {
    const base =
        hashToSeed(
            caseId
        );


    return Array.from(
        {
            length:
                count
        },

        (
            _,
            index
        ) =>
            normalizeSeed(
                base +
                offset +
                (
                    index *
                    1_000_003
                )
            )
    );
}


function hashToSeed(
    value
) {
    const hex =
        createHash(
            "sha256"
        )
            .update(
                value
            )
            .digest(
                "hex"
            )
            .slice(
                0,
                8
            );


    return normalizeSeed(
        Number.parseInt(
            hex,
            16
        )
    );
}


function normalizeSeed(
    value
) {
    const normalized =
        value %
        MAX_SEED;


    return Math.max(
        1,
        normalized
    );
}


function resolveSeedOffset() {
    const configured =
        process.env
            .GAME_FACTORY_BENCHMARK_SEED_OFFSET;


    if (
        configured !==
        undefined
    ) {
        return parsePositiveInteger(
            configured,
            1
        );
    }


    /*
     * Every benchmark invocation gets a fresh seed family.
     *
     * Within the same run both variants still receive
     * exactly the same seeds.
     */
    return Math.max(
        1,

        Date.now() %
            1_000_000_000
    );
}


function buildSummary(
    runResults,
    configuration
) {
    const aggregates =
        new Map();


    for (
        const result of
        runResults
    ) {
        addAggregate(
            aggregates,
            result.variant,
            "ALL",
            result
        );


        addAggregate(
            aggregates,
            result.variant,
            result.profile,
            result
        );
    }


    const rows =
        [
            ...aggregates
                .values()
        ]
            .map(
                finalizeAggregate
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.variant.localeCompare(
                        b.variant
                    ) ||
                    a.profile.localeCompare(
                        b.profile
                    )
            );


    return {
        configuration,

        totalRuns:
            runResults.length,

        rows
    };
}


function addAggregate(
    aggregates,
    variant,
    profile,
    result
) {
    const key =
        `${variant}:${profile}`;


    let aggregate =
        aggregates.get(
            key
        );


    if (
        !aggregate
    ) {
        aggregate = {
            variant,
            profile,

            runs:
                0,

            passes:
                0,

            generationFailed:
                0,

            processingFailed:
                0,

            validationFailed:
                0,

            validationError:
                0,

            totalGenerationMs:
                0,

            generationSamples:
                0,

            totalTotalMs:
                0,

            totalSamples:
                0,

            issueCounts: {}
        };


        aggregates.set(
            key,
            aggregate
        );
    }


    aggregate.runs +=
        1;


    if (
        result.status ===
        "valid"
    ) {
        aggregate.passes +=
            1;
    }


    if (
        result.status ===
        "generation_failed"
    ) {
        aggregate.generationFailed +=
            1;
    }


    if (
        result.status ===
        "processing_failed"
    ) {
        aggregate.processingFailed +=
            1;
    }


    if (
        result.status ===
        "validation_failed"
    ) {
        aggregate.validationFailed +=
            1;
    }


    if (
        result.status ===
        "validation_error"
    ) {
        aggregate.validationError +=
            1;
    }


    if (
        typeof result.generationMs ===
        "number"
    ) {
        aggregate.totalGenerationMs +=
            result.generationMs;

        aggregate.generationSamples +=
            1;
    }


    if (
        typeof result.totalMs ===
        "number"
    ) {
        aggregate.totalTotalMs +=
            result.totalMs;

        aggregate.totalSamples +=
            1;
    }


    for (
        const issue of
        result.issues ??
        []
    ) {
        aggregate.issueCounts[
            issue.code
        ] =
            (
                aggregate.issueCounts[
                    issue.code
                ] ??
                0
            ) +
            1;
    }
}


function finalizeAggregate(
    aggregate
) {
    return {
        variant:
            aggregate.variant,

        profile:
            aggregate.profile,

        runs:
            aggregate.runs,

        passes:
            aggregate.passes,

        failures:
            aggregate.runs -
            aggregate.passes,

        passRate:
            percentage(
                aggregate.passes,
                aggregate.runs
            ),

        generationFailed:
            aggregate.generationFailed,

        processingFailed:
            aggregate.processingFailed,

        validationFailed:
            aggregate.validationFailed,

        validationError:
            aggregate.validationError,

        averageGenerationMs:
            average(
                aggregate.totalGenerationMs,
                aggregate.generationSamples
            ),

        averageTotalMs:
            average(
                aggregate.totalTotalMs,
                aggregate.totalSamples
            ),

        issueCounts:
            aggregate.issueCounts
    };
}


function createRunsCsv(
    runResults
) {
    const rows = [
        [
            "variant",
            "profile",
            "case_id",
            "seed",
            "status",
            "generation_ms",
            "processing_ms",
            "validation_ms",
            "total_ms",
            "issues",
            "error"
        ]
    ];


    for (
        const result of
        runResults
    ) {
        rows.push([
            result.variant,
            result.profile,
            result.caseId,
            result.seed,
            result.status,
            result.generationMs,
            result.processingMs,
            result.validationMs,
            result.totalMs,

            (
                result.issues ??
                []
            )
                .map(
                    issue =>
                        issue.code
                )
                .join(
                    "|"
                ),

            result.error ??
                ""
        ]);
    }


    return rows
        .map(
            row =>
                row
                    .map(
                        csvCell
                    )
                    .join(
                        ","
                    )
        )
        .join(
            "\n"
        );
}


function createSummaryCsv(
    summary
) {
    const rows = [
        [
            "variant",
            "profile",
            "runs",
            "passes",
            "failures",
            "pass_rate_percent",
            "generation_failed",
            "processing_failed",
            "validation_failed",
            "validation_error",
            "avg_generation_ms",
            "avg_total_ms",
            "issue_counts"
        ]
    ];


    for (
        const row of
        summary.rows
    ) {
        rows.push([
            row.variant,
            row.profile,
            row.runs,
            row.passes,
            row.failures,
            row.passRate,
            row.generationFailed,
            row.processingFailed,
            row.validationFailed,
            row.validationError,
            row.averageGenerationMs,
            row.averageTotalMs,

            Object.entries(
                row.issueCounts
            )
                .map(
                    (
                        [
                            code,
                            count
                        ]
                    ) =>
                        `${code}:${count}`
                )
                .join(
                    "|"
                )
        ]);
    }


    return rows
        .map(
            row =>
                row
                    .map(
                        csvCell
                    )
                    .join(
                        ","
                    )
        )
        .join(
            "\n"
        );
}


function formatSummaryForConsole(
    summary
) {
    return summary.rows
        .map(
            row => {
                const issues =
                    Object.entries(
                        row.issueCounts
                    )
                        .map(
                            (
                                [
                                    code,
                                    count
                                ]
                            ) =>
                                `${code}=${count}`
                        )
                        .join(
                            ", "
                        ) ||
                    "none";


                return [
                    `${row.variant.padEnd(12)} ${row.profile.padEnd(10)}`,
                    `${String(row.passes).padStart(3)}/${String(row.runs).padEnd(3)}`,
                    `PASS ${row.passRate.toFixed(1).padStart(5)}%`,
                    `avg ${(row.averageGenerationMs / 1000).toFixed(1)}s`,
                    `issues: ${issues}`
                ].join(
                    " | "
                );
            }
        )
        .join(
            "\n"
        );
}


function formatResult(
    result
) {
    if (
        result.status ===
        "valid"
    ) {
        return `PASS ${(result.totalMs / 1000).toFixed(1)}s`;
    }


    const issues =
        (
            result.issues ??
            []
        )
            .map(
                issue =>
                    issue.code
            )
            .join(
                ","
            );


    if (
        issues
    ) {
        return `FAIL ${issues}`;
    }


    return `FAIL ${result.status}`;
}


function percentage(
    value,
    total
) {
    if (
        total ===
        0
    ) {
        return 0;
    }


    return Number(
        (
            value /
            total *
            100
        ).toFixed(
            2
        )
    );
}


function average(
    total,
    samples
) {
    if (
        samples ===
        0
    ) {
        return 0;
    }


    return Math.round(
        total /
        samples
    );
}


function elapsed(
    startedAt
) {
    return Math.round(
        performance.now() -
        startedAt
    );
}


function normalizeFilter(
    value
) {
    const normalized =
        value
            ?.trim();


    return normalized ||
        undefined;
}


function parsePositiveInteger(
    value,
    fallback
) {
    if (
        value ===
        undefined
    ) {
        return fallback;
    }


    const parsed =
        Number.parseInt(
            value,
            10
        );


    if (
        !Number.isFinite(
            parsed
        ) ||
        parsed <=
            0
    ) {
        throw new Error(
            `Expected positive integer, received "${value}"`
        );
    }


    return parsed;
}


function csvCell(
    value
) {
    const text =
        value ===
            null ||
        value ===
            undefined
            ? ""
            : String(
                value
            );


    return `"${text.replace(
        /"/g,
        "\"\""
    )}"`;
}


function errorMessage(
    error
) {
    return error instanceof Error
        ? error.message
        : String(
            error
        );
}


async function writeJson(
    path,
    value
) {
    await writeFile(
        path,

        JSON.stringify(
            value,
            null,
            2
        ),

        "utf8"
    );
}