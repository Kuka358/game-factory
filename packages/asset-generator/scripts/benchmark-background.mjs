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
    ComfyUIProvider,
    applyAssetGenerationProfilePolicy,
    buildAssetGenerationPrompt
} from "../dist/index.js";


const scriptDirectory =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );

const repositoryRoot =
    resolve(
        scriptDirectory,
        "..",
        "..",
        ".."
    );

const comfyUrl =
    process.env.GAME_FACTORY_COMFYUI_URL ??
    "http://127.0.0.1:8188";

const timeoutMs =
    Number(
        process.env.GAME_FACTORY_COMFYUI_TIMEOUT_MS ??
        "600000"
    );

const seedCount =
    Number(
        process.env.GAME_FACTORY_BACKGROUND_SEED_COUNT ??
        "3"
    );


const cases = [
    {
        id: "desert-sunset",
        tags: [
            "wild west desert",
            "red mesas",
            "cacti",
            "dramatic sunset",
            "dusty horizon"
        ],
        orientation: "landscape"
    },
    {
        id: "alien-planet",
        tags: [
            "alien planet",
            "strange rock formations",
            "two moons",
            "colorful nebula sky",
            "science fiction"
        ],
        orientation: "landscape"
    },
    {
        id: "enchanted-forest",
        tags: [
            "enchanted fantasy forest",
            "ancient trees",
            "glowing mushrooms",
            "magical mist"
        ],
        orientation: "landscape"
    },
    {
        id: "snow-mountains",
        tags: [
            "snowy mountain landscape",
            "pine forest",
            "icy cliffs",
            "cold blue atmosphere"
        ],
        orientation: "landscape"
    },
    {
        id: "cyberpunk-city",
        tags: [
            "cyberpunk city",
            "neon skyscrapers",
            "rainy night",
            "industrial streets",
            "futuristic skyline"
        ],
        orientation: "landscape"
    },
    {
        id: "lava-cavern",
        tags: [
            "volcanic cavern",
            "lava rivers",
            "black volcanic rock",
            "glowing magma",
            "underground environment"
        ],
        orientation: "landscape"
    },
    {
        id: "tropical-jungle",
        tags: [
            "tropical jungle",
            "dense green vegetation",
            "ancient ruins",
            "waterfalls",
            "humid atmosphere"
        ],
        orientation: "landscape"
    },
    {
        id: "underwater-ruins",
        tags: [
            "underwater ancient ruins",
            "coral reef",
            "sun rays through water",
            "deep blue ocean"
        ],
        orientation: "landscape"
    },

    {
        id: "vertical-space-tower",
        tags: [
            "futuristic space elevator",
            "tower rising through clouds",
            "planet horizon",
            "science fiction"
        ],
        orientation: "portrait"
    },
    {
        id: "vertical-fantasy-cliffs",
        tags: [
            "fantasy cliffs",
            "floating islands",
            "waterfalls",
            "distant castle",
            "dramatic vertical depth"
        ],
        orientation: "portrait"
    },
    {
        id: "vertical-city",
        tags: [
            "dense futuristic megacity",
            "towering skyscrapers",
            "neon signs",
            "vertical city canyon"
        ],
        orientation: "portrait"
    },
    {
        id: "vertical-jungle-temple",
        tags: [
            "ancient jungle temple",
            "massive stone tower",
            "vines",
            "tropical vegetation"
        ],
        orientation: "portrait"
    }
];


const variants = [
    {
        id: "sdxl-current",
        model: "sdxl-base+pixel-art-xl",
        workflow:
            "background-scene.json"
    },
    {
        id: "flux-klein",
        model: "flux2-klein-4b-fp8",
        workflow:
            "benchmark/background-flux-klein.json"
    }
];


const runOffset =
    Date.now() %
    1_000_000_000;


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
        "background-quality",
        timestamp
    );


await mkdir(
    outputRoot,
    {
        recursive: true
    }
);


const results = [];


console.log(
    [
        "Background benchmark",
        `cases=${cases.length}`,
        `seeds=${seedCount}`,
        `variants=${variants.length}`,
        `runs=${cases.length * seedCount * variants.length}`,
        `output=${outputRoot}`
    ].join("\n")
);


/*
 * Variant first so ComfyUI does not constantly switch
 * between SDXL and FLUX.
 */
for (
    const variant of
    variants
) {
    const workflow =
        await loadWorkflow(
            variant.workflow
        );


    const provider =
        new ComfyUIProvider({
            baseUrl: comfyUrl,
            model: variant.model,
            workflow,
            outputNodeId: "8",
            timeoutMs
        });


    console.log(
        `\n=== ${variant.id} ===`
    );


    for (
        const testCase of
        cases
    ) {
        const {
            width,
            height
        } =
            dimensions(
                testCase.orientation
            );


        for (
            let index = 0;
            index < seedCount;
            index += 1
        ) {
            const seed =
                createSeed(
                    testCase.id,
                    index
                );


            const request = {
                role: "background",
                profile: "background",
                kind: "background",

                tags:
                    testCase.tags,

                style:
                    "pixel-art",

                width,
                height,

                transparent:
                    false,

                singleSubject:
                    false,

                allowSpritesheet:
                    false,

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


            const positivePrompt = [
                basePrompt.positive,

                testCase.orientation ===
                    "landscape"
                    ? [
                        "16:9 landscape game background.",
                        "Side-scrolling gameplay composition.",
                        "Strong horizontal visual flow."
                    ].join(" ")
                    : [
                        "9:16 portrait game background.",
                        "Vertical gameplay composition.",
                        "Strong vertical visual depth."
                    ].join(" "),

                [
                    "32-bit pixel art environment.",
                    "Rich production-quality environmental detail.",
                    "Clear foreground, middle ground and distant background.",
                    "Strong atmospheric depth.",
                    "Distinct environmental materials and landmarks.",
                    "Coherent lighting and color palette.",
                    "No main character.",
                    "No isolated foreground sprite.",
                    "No HUD or UI.",
                    "No text."
                ].join(" ")
            ].join("\n");


            const directory =
                join(
                    outputRoot,
                    testCase.id,
                    `seed-${index + 1}-${seed}`,
                    variant.id
                );


            await mkdir(
                directory,
                {
                    recursive: true
                }
            );


            const started =
                performance.now();


            try {
                const generated =
                    await provider.generate({
                        profile: "background",
                        prompt: positivePrompt,
                        negativePrompt:
                            basePrompt.negative,

                        width,
                        height,

                        format: "png",
                        seed
                    });


                const imagePath =
                    join(
                        directory,
                        "background.png"
                    );


                await writeFile(
                    imagePath,
                    generated.bytes
                );


                const result = {
                    caseId:
                        testCase.id,

                    orientation:
                        testCase.orientation,

                    variant:
                        variant.id,

                    seed,

                    width,
                    height,

                    status:
                        "generated",

                    generationMs:
                        Math.round(
                            performance.now() -
                            started
                        ),

                    image:
                        normalizePath(
                            relative(
                                outputRoot,
                                imagePath
                            )
                        ),

                    prompt:
                        positivePrompt,

                    error:
                        null
                };


                results.push(
                    result
                );


                console.log(
                    [
                        testCase.id,
                        `seed=${index + 1}/${seedCount}`,
                        "PASS",
                        `${(
                            result.generationMs /
                            1000
                        ).toFixed(1)}s`
                    ].join(" ")
                );
            } catch (
                error
            ) {
                const result = {
                    caseId:
                        testCase.id,

                    orientation:
                        testCase.orientation,

                    variant:
                        variant.id,

                    seed,

                    width,
                    height,

                    status:
                        "failed",

                    generationMs:
                        Math.round(
                            performance.now() -
                            started
                        ),

                    image:
                        null,

                    prompt:
                        positivePrompt,

                    error:
                        error instanceof Error
                            ? error.message
                            : String(error)
                };


                results.push(
                    result
                );


                console.log(
                    `${testCase.id} FAIL ${result.error}`
                );
            }


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


await writeJson(
    join(
        outputRoot,
        "results.json"
    ),
    results
);


await writeFile(
    join(
        outputRoot,
        "gallery.html"
    ),
    createGallery(
        results
    ),
    "utf8"
);


console.log(
    [
        "",
        "BACKGROUND BENCHMARK COMPLETE",
        `Results: ${outputRoot}`,
        `Gallery: ${join(
            outputRoot,
            "gallery.html"
        )}`
    ].join("\n")
);


function dimensions(
    orientation
) {
    return orientation ===
        "portrait"
        ? {
            width: 720,
            height: 1280
        }
        : {
            width: 1280,
            height: 720
        };
}


function createSeed(
    caseId,
    index
) {
    const value =
        createHash(
            "sha256"
        )
            .update(
                `${caseId}:${runOffset}`
            )
            .digest()
            .readUInt32BE(0);


    return Math.max(
        1,
        (
            value +
            index * 1_000_003
        ) %
            2_147_483_647
    );
}


async function loadWorkflow(
    filename
) {
    const source =
        await readFile(
            join(
                repositoryRoot,
                "config",
                "comfyui",
                filename
            ),
            "utf8"
        );


    return JSON.parse(
        source
    );
}


function createGallery(
    runResults
) {
    const keys =
        [
            ...new Set(
                runResults.map(
                    result =>
                        `${result.caseId}:${result.seed}`
                )
            )
        ];


    const sections =
        keys.map(
            key => {
                const [
                    caseId,
                    seed
                ] =
                    key.split(":");


                const entries =
                    runResults.filter(
                        result =>
                            result.caseId ===
                                caseId &&
                            String(
                                result.seed
                            ) ===
                                seed
                    );


                const columns =
                    variants.map(
                        variant => {
                            const result =
                                entries.find(
                                    item =>
                                        item.variant ===
                                        variant.id
                                );


                            return `
<div class="variant">
    <h3>${variant.id}</h3>
    ${
        result?.image
            ? `<img src="${result.image}">`
            : `<div class="missing">FAILED</div>`
    }
    <p>${
        result
            ? `${(
                result.generationMs /
                1000
            ).toFixed(1)}s`
            : ""
    }</p>
</div>`;
                        }
                    )
                    .join("");


                return `
<section>
    <h2>${caseId} <small>seed ${seed}</small></h2>
    <div class="variants">
        ${columns}
    </div>
</section>`;
            }
        )
        .join("");


    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Background Benchmark</title>
<style>
body {
    background: #111;
    color: #eee;
    font-family: system-ui, sans-serif;
    margin: 24px;
}
section {
    margin-bottom: 48px;
    border-bottom: 1px solid #333;
    padding-bottom: 32px;
}
small {
    opacity: .55;
}
.variants {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
}
.variant {
    background: #1b1b1b;
    padding: 12px;
    border-radius: 8px;
}
img {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
}
.missing {
    height: 300px;
    display: grid;
    place-items: center;
    background: #311;
}
</style>
</head>
<body>
<h1>Game Factory — Background Benchmark</h1>
${sections}
</body>
</html>`;
}


function normalizePath(
    value
) {
    return value.replace(
        /\\/g,
        "/"
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