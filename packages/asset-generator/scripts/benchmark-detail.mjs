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
    relative,
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


const DETAIL_CASE_IDS =
    new Set([
        "character-astronaut",
        "character-knight",
        "character-cyberpunk-runner",
        "character-dwarf-miner",

        "npc-dragon",
        "npc-skeleton-warrior",
        "npc-stone-golem",
        "npc-robot-drone",

        "item-health-potion",
        "item-treasure-chest",

        "obstacle-land-mine",
        "obstacle-barricade"
    ]);


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
    positiveInteger(
        process.env
            .GAME_FACTORY_COMFYUI_TIMEOUT_MS,

        600_000
    );


const outputNodeId =
    process.env
        .GAME_FACTORY_COMFYUI_OUTPUT_NODE ??
    "8";


const seedCount =
    positiveInteger(
        process.env
            .GAME_FACTORY_DETAIL_SEED_COUNT,

        3
    );


const variantFilter =
    process.env
        .GAME_FACTORY_DETAIL_VARIANT
        ?.trim() ||
    undefined;


const seedOffset =
    resolveSeedOffset();


const processor =
    new AssetProcessor();


const validator =
    new SingleSubjectAssetValidator();


const workflowPath =
    join(
        repositoryRoot,
        "config",
        "comfyui",
        "benchmark",
        "sprite-flux-klein.json"
    );


const workflowSource =
    await readFile(
        workflowPath,
        "utf8"
    );


const baseWorkflow =
    JSON.parse(
        workflowSource
    );


/*
 * A — current production candidate.
 *
 * B — same generation settings, detail-oriented prompt.
 *
 * C — detail prompt with weaker LoRA, allowing the base
 *     model slightly more influence over internal detail.
 *
 * D — same as C, but the diffusion process runs at 768x768
 *     before the existing workflow scales the final sprite
 *     back to the requested 512x512 output.
 */
const variants = [
    {
        id:
            "flux-current",

        detail:
            false,

        loraStrength:
            1,

        generationResolution:
            512
    },

    {
        id:
            "flux-detail",

        detail:
            true,

        loraStrength:
            1,

        generationResolution:
            512
    },

    {
        id:
            "flux-detail-lora085",

        detail:
            true,

        loraStrength:
            0.85,

        generationResolution:
            512
    },

    {
        id:
            "flux-detail-lora085-768",

        detail:
            true,

        loraStrength:
            0.85,

        generationResolution:
            768
    }
];


const selectedVariants =
    variants.filter(
        variant =>
            !variantFilter ||
            variant.id ===
                variantFilter
    );


if (
    selectedVariants.length ===
    0
) {
    throw new Error(
        `Unknown detail benchmark variant "${variantFilter}"`
    );
}


const detailCases =
    benchmarkCases.filter(
        testCase =>
            DETAIL_CASE_IDS.has(
                testCase.id
            )
    );


if (
    detailCases.length !==
    DETAIL_CASE_IDS.size
) {
    const found =
        new Set(
            detailCases.map(
                testCase =>
                    testCase.id
            )
        );


    const missing =
        [
            ...DETAIL_CASE_IDS
        ].filter(
            id =>
                !found.has(
                    id
                )
        );


    throw new Error(
        [
            "Detail benchmark cases are missing from benchmark-cases.mjs:",
            missing.join(
                ", "
            )
        ].join(
            " "
        )
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
        "asset-detail",
        timestamp
    );


await mkdir(
    outputRoot,
    {
        recursive:
            true
    }
);


const totalRuns =
    detailCases.length *
    seedCount *
    selectedVariants.length;


const results =
    [];


let completed =
    0;


console.log(
    [
        "FLUX sprite detail benchmark",
        `cases=${detailCases.length}`,
        `seeds=${seedCount}`,
        `variants=${selectedVariants.length}`,
        `runs=${totalRuns}`,
        `seedOffset=${seedOffset}`,
        `output=${outputRoot}`
    ].join(
        "\n"
    )
);


/*
 * Variant outer-loop:
 * ComfyUI can keep the same FLUX model in memory.
 */
for (
    const variant of
    selectedVariants
) {
    console.log(
        [
            "",
            "==================================================",
            `VARIANT: ${variant.id}`,
            `LoRA: ${variant.loraStrength}`,
            `generation: ${variant.generationResolution}x${variant.generationResolution}`,
            `detail prompt: ${variant.detail ? "yes" : "no"}`,
            "=================================================="
        ].join(
            "\n"
        )
    );


    const workflow =
        prepareWorkflow(
            baseWorkflow,
            variant
        );


    const provider =
        new ComfyUIProvider({
            baseUrl:
                comfyUrl,

            model:
                [
                    "flux2-klein-4b",
                    "pixel-art-lora",
                    variant.id
                ].join(
                    "+"
                ),

            workflow,

            outputNodeId,

            timeoutMs
        });


    for (
        const testCase of
        detailCases
    ) {
        const seeds =
            createSeeds(
                testCase.id,
                seedCount,
                seedOffset
            );


        console.log(
            `\n[${testCase.profile}] ${testCase.id}`
        );


        for (
            let seedIndex =
                0;

            seedIndex <
                seeds.length;

            seedIndex +=
                1
        ) {
            const seed =
                seeds[
                    seedIndex
                ];


            const result =
                await runCase({
                    provider,
                    variant,
                    testCase,
                    seed,
                    seedIndex
                });


            results.push(
                result
            );


            completed +=
                1;


            console.log(
                [
                    `  ${seedIndex + 1}/${seedCount}`,
                    `seed=${seed}`,
                    formatRun(
                        result
                    ),
                    `[${completed}/${totalRuns}]`
                ].join(
                    " "
                )
            );


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
        results
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
        "summary.csv"
    ),

    createSummaryCsv(
        summary
    ),

    "utf8"
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
        "gallery.html"
    ),

    createGalleryHtml(
        results,
        selectedVariants
    ),

    "utf8"
);


console.log(
    [
        "",
        "==================================================",
        "DETAIL BENCHMARK COMPLETE",
        "==================================================",
        "",
        formatSummary(
            summary
        ),
        "",
        `Results: ${outputRoot}`,
        `Gallery: ${join(
            outputRoot,
            "gallery.html"
        )}`
    ].join(
        "\n"
    )
);


async function runCase({
    provider,
    variant,
    testCase,
    seed,
    seedIndex
}) {
    /*
     * Final game-facing output remains 512x512 for every
     * variant. Only diffusion generation resolution changes.
     */
    const outputResolution =
        512;


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
            outputResolution,

        height:
            outputResolution,

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


    const basePrompt =
        applyAssetGenerationProfilePolicy(
            buildAssetGenerationPrompt(
                request
            ),
            request
        );


    const positivePrompt =
        variant.detail
            ? [
                basePrompt.positive,

                detailInstruction(
                    testCase.profile
                )
            ].join(
                "\n"
            )
            : basePrompt.positive;


    const directory =
        join(
            outputRoot,
            testCase.id,
            `seed-${seedIndex + 1}-${seed}`,
            variant.id
        );


    await mkdir(
        directory,
        {
            recursive:
                true
        }
    );


    const metadata = {
        caseId:
            testCase.id,

        profile:
            testCase.profile,

        variant:
            variant.id,

        seed,

        seedIndex,

        loraStrength:
            variant.loraStrength,

        generationResolution:
            variant.generationResolution,

        outputResolution,

        detailPrompt:
            variant.detail,

        prompt:
            positivePrompt,

        negativePrompt:
            basePrompt.negative,

        tags:
            testCase.tags
    };


    const started =
        performance.now();


    let generated;


    const generationStarted =
        performance.now();


    try {
        generated =
            await provider.generate({
                profile:
                    request.profile,

                prompt:
                    positivePrompt,

                negativePrompt:
                    basePrompt.negative,

                width:
                    outputResolution,

                height:
                    outputResolution,

                format:
                    "png",

                seed
            });
    } catch (
        error
    ) {
        const result = {
            ...metadata,

            status:
                "generation_failed",

            generationMs:
                elapsed(
                    generationStarted
                ),

            totalMs:
                elapsed(
                    started
                ),

            issues:
                [],

            error:
                errorMessage(
                    error
                ),

            image:
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


    const generationMs =
        elapsed(
            generationStarted
        );


    await writeFile(
        join(
            directory,
            "raw.png"
        ),

        generated.bytes
    );


    let processed;


    try {
        processed =
            await processor.process(
                generated,
                request
            );
    } catch (
        error
    ) {
        const result = {
            ...metadata,

            status:
                "processing_failed",

            generationMs,

            totalMs:
                elapsed(
                    started
                ),

            issues:
                [],

            error:
                errorMessage(
                    error
                ),

            image:
                relative(
                    outputRoot,
                    join(
                        directory,
                        "raw.png"
                    )
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


    const processedPath =
        join(
            directory,
            "processed.png"
        );


    await writeFile(
        processedPath,
        processed.image.bytes
    );


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
        const result = {
            ...metadata,

            status:
                "validation_error",

            generationMs,

            totalMs:
                elapsed(
                    started
                ),

            issues:
                [],

            error:
                errorMessage(
                    error
                ),

            image:
                normalizeRelativePath(
                    relative(
                        outputRoot,
                        processedPath
                    )
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

        totalMs:
            elapsed(
                started
            ),

        issues,

        error:
            null,

        image:
            normalizeRelativePath(
                relative(
                    outputRoot,
                    processedPath
                )
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


function prepareWorkflow(
    source,
    variant
) {
    const workflow =
        structuredClone(
            source
        );


    const lora =
        workflow[
            "11"
        ];


    if (
        !lora?.inputs
    ) {
        throw new Error(
            "FLUX benchmark workflow is missing LoraLoader node 11"
        );
    }


    lora.inputs.strength_model =
        variant.loraStrength;

    lora.inputs.strength_clip =
        variant.loraStrength;


    const latent =
        workflow[
            "5"
        ];


    if (
        !latent?.inputs
    ) {
        throw new Error(
            "FLUX benchmark workflow is missing latent node 5"
        );
    }


    latent.inputs.width =
        variant.generationResolution;

    latent.inputs.height =
        variant.generationResolution;


    const scheduler =
        workflow[
            "16"
        ];


    if (
        !scheduler?.inputs
    ) {
        throw new Error(
            "FLUX benchmark workflow is missing Flux2Scheduler node 16"
        );
    }


    scheduler.inputs.width =
        variant.generationResolution;

    scheduler.inputs.height =
        variant.generationResolution;


    return workflow;
}


function detailInstruction(
    profile
) {
    const common = [
        "32-bit pixel art.",
        "High-detail production-quality game sprite.",
        "Use rich but readable internal pixel detail.",
        "Use controlled pixel clusters rather than large empty flat regions.",
        "Include clear internal shadows and highlights.",
        "Use multiple coherent color shades within each material.",
        "Preserve the clean outer silhouette and exactly one subject.",
        "Do not add extra objects merely to increase detail."
    ];


    switch (
        profile
    ) {
        case "character":
            return [
                ...common,

                "Add layered clothing, armor, equipment, accessories, seams, straps, buckles, or mechanical features where appropriate.",
                "Render distinct materials such as cloth, metal, leather, glass, skin, hair, or glowing technology differently.",
                "Give the face, headgear, torso, arms, and legs readable internal features."
            ].join(
                " "
            );


        case "npc":
            return [
                ...common,

                "Add distinctive anatomy, armor, clothing, scales, bones, mechanical parts, markings, horns, claws, or equipment where appropriate.",
                "Make the creature visually specific rather than a generic silhouette.",
                "Use detailed internal anatomy and material separation without creating additional subjects."
            ].join(
                " "
            );


        case "item":
            return [
                ...common,

                "Add decorative edges, material texture, engravings, caps, handles, bands, facets, reflections, wear, or magical accents where appropriate.",
                "Make the object visually rich while remaining readable as one game item."
            ].join(
                " "
            );


        case "obstacle":
            return [
                ...common,

                "Add visible construction details, joints, cracks, bolts, planks, spikes, surface wear, material texture, or mechanical parts where appropriate.",
                "Make the obstacle feel physically constructed and game-ready rather than like a simple icon."
            ].join(
                " "
            );


        default:
            return common.join(
                " "
            );
    }
}


function createSeeds(
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
                index *
                    1_000_003
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
    return Math.max(
        1,
        value %
            MAX_SEED
    );
}


function resolveSeedOffset() {
    const configured =
        process.env
            .GAME_FACTORY_DETAIL_SEED_OFFSET;


    if (
        configured
    ) {
        return positiveInteger(
            configured,
            1
        );
    }


    return Math.max(
        1,
        Date.now() %
            1_000_000_000
    );
}


function buildSummary(
    runResults
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


    return [
        ...aggregates.values()
    ]
        .map(
            aggregate => ({
                variant:
                    aggregate.variant,

                profile:
                    aggregate.profile,

                runs:
                    aggregate.runs,

                passes:
                    aggregate.passes,

                passRate:
                    aggregate.runs === 0
                        ? 0
                        : Number(
                            (
                                aggregate.passes /
                                aggregate.runs *
                                100
                            ).toFixed(
                                2
                            )
                        ),

                averageGenerationMs:
                    aggregate.generationSamples ===
                    0
                        ? 0
                        : Math.round(
                            aggregate.totalGenerationMs /
                            aggregate.generationSamples
                        ),

                issueCounts:
                    aggregate.issueCounts
            })
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
}


function addAggregate(
    aggregates,
    variant,
    profile,
    result
) {
    const key =
        `${variant}:${profile}`;


    let value =
        aggregates.get(
            key
        );


    if (
        !value
    ) {
        value = {
            variant,
            profile,

            runs:
                0,

            passes:
                0,

            totalGenerationMs:
                0,

            generationSamples:
                0,

            issueCounts: {}
        };


        aggregates.set(
            key,
            value
        );
    }


    value.runs +=
        1;


    if (
        result.status ===
        "valid"
    ) {
        value.passes +=
            1;
    }


    if (
        typeof result.generationMs ===
        "number"
    ) {
        value.totalGenerationMs +=
            result.generationMs;

        value.generationSamples +=
            1;
    }


    for (
        const issue of
        result.issues ??
        []
    ) {
        value.issueCounts[
            issue.code
        ] =
            (
                value.issueCounts[
                    issue.code
                ] ??
                0
            ) +
            1;
    }
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
            "pass_rate_percent",
            "avg_generation_ms",
            "issues"
        ]
    ];


    for (
        const row of
        summary
    ) {
        rows.push([
            row.variant,
            row.profile,
            row.runs,
            row.passes,
            row.passRate,
            row.averageGenerationMs,

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


    return csvRows(
        rows
    );
}


function createRunsCsv(
    results
) {
    const rows = [
        [
            "variant",
            "profile",
            "case",
            "seed",
            "status",
            "lora_strength",
            "generation_resolution",
            "generation_ms",
            "issues"
        ]
    ];


    for (
        const result of
        results
    ) {
        rows.push([
            result.variant,
            result.profile,
            result.caseId,
            result.seed,
            result.status,
            result.loraStrength,
            result.generationResolution,
            result.generationMs,

            result.issues
                .map(
                    issue =>
                        issue.code
                )
                .join(
                    "|"
                )
        ]);
    }


    return csvRows(
        rows
    );
}


function createGalleryHtml(
    results,
    activeVariants
) {
    const variantIds =
        activeVariants.map(
            variant =>
                variant.id
        );


    const rowKeys =
        [
            ...new Set(
                results.map(
                    result =>
                        [
                            result.caseId,
                            result.seed
                        ].join(
                            "::"
                        )
                )
            )
        ];


    const cards =
        rowKeys.map(
            key => {
                const [
                    caseId,
                    seed
                ] =
                    key.split(
                        "::"
                    );


                const matching =
                    results.filter(
                        result =>
                            result.caseId ===
                                caseId &&
                            String(
                                result.seed
                            ) ===
                                seed
                    );


                const columns =
                    variantIds.map(
                        variantId => {
                            const result =
                                matching.find(
                                    entry =>
                                        entry.variant ===
                                            variantId
                                );


                            if (
                                !result
                            ) {
                                return `
                                    <div class="variant missing">
                                        <h3>${escapeHtml(variantId)}</h3>
                                        <p>Missing result</p>
                                    </div>
                                `;
                            }


                            const image =
                                result.image
                                    ? `
                                        <img
                                            src="${escapeHtml(result.image)}"
                                            alt="${escapeHtml(caseId)} ${escapeHtml(variantId)}"
                                        >
                                    `
                                    : `
                                        <div class="no-image">
                                            No image
                                        </div>
                                    `;


                            const issues =
                                result.issues.length >
                                0
                                    ? result.issues
                                        .map(
                                            issue =>
                                                issue.code
                                        )
                                        .join(
                                            ", "
                                        )
                                    : "none";


                            return `
                                <div class="variant">
                                    <h3>${escapeHtml(variantId)}</h3>

                                    ${image}

                                    <p>
                                        <strong>${escapeHtml(result.status)}</strong>
                                    </p>

                                    <p>
                                        LoRA ${escapeHtml(result.loraStrength)}
                                        ·
                                        ${escapeHtml(result.generationResolution)}px
                                    </p>

                                    <p>
                                        issues: ${escapeHtml(issues)}
                                    </p>
                                </div>
                            `;
                        }
                    )
                    .join(
                        "\n"
                    );


                return `
                    <section class="case">
                        <h2>
                            ${escapeHtml(caseId)}
                            <small>seed ${escapeHtml(seed)}</small>
                        </h2>

                        <div class="variants">
                            ${columns}
                        </div>
                    </section>
                `;
            }
        )
        .join(
            "\n"
        );


    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Game Factory FLUX Detail Benchmark</title>

<style>
    body {
        font-family:
            system-ui,
            sans-serif;

        margin:
            24px;

        background:
            #111;

        color:
            #eee;
    }

    h1 {
        margin-bottom:
            32px;
    }

    h2 {
        margin:
            0 0 16px;
    }

    h2 small {
        opacity:
            0.55;

        font-weight:
            normal;
    }

    .case {
        margin-bottom:
            48px;

        padding-bottom:
            32px;

        border-bottom:
            1px solid #333;
    }

    .variants {
        display:
            grid;

        grid-template-columns:
            repeat(4, minmax(0, 1fr));

        gap:
            16px;
    }

    .variant {
        padding:
            12px;

        background:
            #1d1d1d;

        border-radius:
            8px;
    }

    .variant h3 {
        margin-top:
            0;

        font-size:
            14px;
    }

    img {
        width:
            100%;

        aspect-ratio:
            1;

        object-fit:
            contain;

        image-rendering:
            pixelated;

        background:
            repeating-conic-gradient(
                #333 0 25%,
                #222 0 50%
            )
            50% / 20px 20px;
    }

    p {
        font-size:
            12px;

        opacity:
            0.8;
    }

    .no-image {
        aspect-ratio:
            1;

        display:
            grid;

        place-items:
            center;

        background:
            #271919;
    }

    @media (
        max-width:
            1000px
    ) {
        .variants {
            grid-template-columns:
                repeat(2, minmax(0, 1fr));
        }
    }
</style>
</head>

<body>

<h1>
    Game Factory — FLUX Sprite Detail Benchmark
</h1>

${cards}

</body>
</html>`;
}


function formatSummary(
    summary
) {
    return summary
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
                    row.variant.padEnd(
                        26
                    ),

                    row.profile.padEnd(
                        10
                    ),

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


function formatRun(
    result
) {
    if (
        result.status ===
        "valid"
    ) {
        return `PASS ${(result.generationMs / 1000).toFixed(1)}s`;
    }


    const issues =
        result.issues
            .map(
                issue =>
                    issue.code
            )
            .join(
                ","
            );


    return issues
        ? `FAIL ${issues}`
        : `FAIL ${result.status}`;
}


function elapsed(
    start
) {
    return Math.round(
        performance.now() -
        start
    );
}


function positiveInteger(
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
            `Expected positive integer, got "${value}"`
        );
    }


    return parsed;
}


function csvRows(
    rows
) {
    return rows
        .map(
            row =>
                row
                    .map(
                        value =>
                            `"${String(
                                value ??
                                ""
                            ).replace(
                                /"/g,
                                "\"\""
                            )}"`
                    )
                    .join(
                        ","
                    )
        )
        .join(
            "\n"
        );
}


function normalizeRelativePath(
    path
) {
    return path.replace(
        /\\/g,
        "/"
    );
}


function escapeHtml(
    value
) {
    return String(
        value
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
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