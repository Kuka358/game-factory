import {
    mkdir,
    readFile,
    stat,
    writeFile
} from "node:fs/promises";

import {
    dirname,
    isAbsolute,
    join,
    resolve
} from "node:path";

import {
    fileURLToPath
} from "node:url";

import {
    AssetGenerator,
    ComfyUIWorkflowRegistry,
    GeneratedAssetManager,
    ProfiledComfyUIProvider
} from "../dist/index.js";


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


await loadRepositoryEnv();


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
        "regression",
        "asset-smoke",
        timestamp
    );


const assetsDir =
    join(
        outputRoot,
        "assets"
    );


await mkdir(
    assetsDir,
    {
        recursive:
            true
    }
);


const baseUrl =
    process.env
        .GAME_FACTORY_COMFYUI_URL ??
    "http://127.0.0.1:8188";


const outputNodeId =
    process.env
        .GAME_FACTORY_COMFYUI_OUTPUT_NODE ??
    "8";


const timeoutMs =
    parsePositiveInteger(
        process.env
            .GAME_FACTORY_COMFYUI_TIMEOUT_MS,
        600_000
    );


const genericModel =
    process.env
        .GAME_FACTORY_COMFYUI_MODEL;


const workflows = [
    workflow(
        "character",
        "GAME_FACTORY_COMFYUI_CHARACTER_WORKFLOW",
        "sprite-flux-detail.json",
        "GAME_FACTORY_COMFYUI_CHARACTER_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8+pixel-art-flux2"
    ),

    workflow(
        "npc",
        "GAME_FACTORY_COMFYUI_NPC_WORKFLOW",
        "sprite-flux-detail.json",
        "GAME_FACTORY_COMFYUI_NPC_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8+pixel-art-flux2"
    ),

    workflow(
        "item",
        "GAME_FACTORY_COMFYUI_ITEM_WORKFLOW",
        "sprite-flux-detail.json",
        "GAME_FACTORY_COMFYUI_ITEM_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8+pixel-art-flux2"
    ),

    workflow(
        "obstacle",
        "GAME_FACTORY_COMFYUI_OBSTACLE_WORKFLOW",
        "sprite-flux-detail.json",
        "GAME_FACTORY_COMFYUI_OBSTACLE_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8+pixel-art-flux2"
    ),

    workflow(
        "ui",
        "GAME_FACTORY_COMFYUI_UI_WORKFLOW",
        "sprite-flux-detail.json",
        "GAME_FACTORY_COMFYUI_UI_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8+pixel-art-flux2"
    ),

    workflow(
        "background",
        "GAME_FACTORY_COMFYUI_BACKGROUND_WORKFLOW",
        "background-flux-detail.json",
        "GAME_FACTORY_COMFYUI_BACKGROUND_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8"
    ),

    workflow(
        "tileset",
        "GAME_FACTORY_COMFYUI_TILESET_WORKFLOW",
        "terrain-tile-flux.json",
        "GAME_FACTORY_COMFYUI_TILESET_MODEL",
        genericModel ??
            "flux2-klein-4b-fp8"
    )
];


const registry =
    new ComfyUIWorkflowRegistry({
        workflows
    });


const provider =
    new ProfiledComfyUIProvider({
        baseUrl,
        registry,
        timeoutMs
    });


const generator =
    new AssetGenerator(
        provider
    );


const manager =
    new GeneratedAssetManager({
        generator,

        style:
            "pixel-art",

        spriteGenerationSize:
            512,

        format:
            "png",

        writeMetadata:
            true
    });


const requirements = [
    {
        type:
            "sprite",

        role:
            "smoke_character",

        expectedProfile:
            "character",

        tags: [
            "astronaut",
            "white futuristic space suit",
            "human space explorer",
            "pixel art"
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "character",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "sprite",

        role:
            "smoke_npc",

        expectedProfile:
            "npc",

        tags: [
            "green alien monster",
            "hostile science fiction creature",
            "single enemy",
            "pixel art"
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "npc",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "sprite",

        role:
            "smoke_item",

        expectedProfile:
            "item",

        tags: [
            "glowing blue energy crystal",
            "single collectible crystal",
            "science fiction game item",
            "pixel art"
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "item",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "sprite",

        role:
            "smoke_obstacle",

        expectedProfile:
            "obstacle",

        tags: [
            "futuristic metal land mine",
            "single mechanical hazard",
            "science fiction obstacle",
            "pixel art"
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "obstacle",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "image",

        role:
            "smoke_ui",

        expectedProfile:
            "ui",

        tags: [
            "blue energy star symbol",
            "score icon",
            "science fiction game UI",
            "pixel art"
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "ui",

                uiKind:
                    "icon",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "image",

        role:
            "smoke_background",

        expectedProfile:
            "background",

        tags: [
            "alien planet landscape",
            "two moons",
            "purple nebula",
            "distant strange mountains",
            "science fiction",
            "pixel art"
        ],

        requirements: {
            transparent:
                false,

            orientation:
                "landscape",

            dimensions: {
                preferredWidth:
                    1280,

                preferredHeight:
                    720
            },

            generation: {
                profile:
                    "background",

                singleSubject:
                    false,

                allowSpritesheet:
                    false
            }
        }
    },

    {
        type:
            "image",

        role:
            "smoke_ground_tiles",

        expectedProfile:
            "tileset",

        tags: [
            "dark alien stone",
            "blue glowing cracks",
            "rough extraterrestrial rock",
            "pixel art"
        ],

        requirements: {
            transparent:
                false,

            orientation:
                "landscape",

            dimensions: {
                preferredWidth:
                    512,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "tileset",

                singleSubject:
                    false,

                allowSpritesheet:
                    true,

                tileable:
                    true,

                tileset: {
                    tileWidth:
                        64,

                    tileHeight:
                        64,

                    columns:
                        8,

                    rows:
                        1
                }
            }
        }
    }
];


console.log(
    [
        "",
        "==============================================",
        "GAME FACTORY ASSET SMOKE REGRESSION",
        "==============================================",
        "",
        `ComfyUI: ${baseUrl}`,
        `Output: ${outputRoot}`,
        `Profiles: ${requirements.length}`,
        ""
    ].join(
        "\n"
    )
);


const results =
    [];


const manifestEntries =
    [];


for (
    const definition of
    requirements
) {
    const {
        expectedProfile,
        ...requirement
    } =
        definition;


    const started =
        performance.now();


    process.stdout.write(
        `[smoke] ${expectedProfile.padEnd(10)} ${requirement.role} ... `
    );


    try {
        /*
         * Resolve one requirement at a time so one failure
         * does not hide results for the remaining profiles.
         */
        const resolved =
            await manager.resolve({
                requirements: [
                    requirement
                ],

                assetsDir
            });


        const entry =
            resolved.manifest
                .assets[0];


        if (
            !entry
        ) {
            throw new Error(
                "GeneratedAssetManager returned no manifest entry"
            );
        }


        manifestEntries.push(
            entry
        );


        const metadataPath =
            join(
                assetsDir,
                `${requirement.role}.generated.json`
            );


        const assetPath =
            join(
                assetsDir,
                fileNameFromGamePath(
                    entry.gamePath
                )
            );


        const metadata =
            JSON.parse(
                await readFile(
                    metadataPath,
                    "utf8"
                )
            );


        await validateGeneratedAsset({
            requirement,
            expectedProfile,
            entry,
            metadata,
            assetPath
        });


        const elapsedMs =
            Math.round(
                performance.now() -
                started
            );


        const result = {
            role:
                requirement.role,

            profile:
                expectedProfile,

            status:
                "PASS",

            elapsedMs,

            model:
                metadata
                    .generator
                    ?.model ??
                null,

            width:
                metadata
                    .image
                    ?.width ??
                null,

            height:
                metadata
                    .image
                    ?.height ??
                null,

            seed:
                metadata
                    .generator
                    ?.seed ??
                null,

            tileset:
                metadata
                    .tileset ??
                null,

            error:
                null
        };


        results.push(
            result
        );


        console.log(
            `PASS ${(elapsedMs / 1000).toFixed(1)}s`
        );
    } catch (
        error
    ) {
        const elapsedMs =
            Math.round(
                performance.now() -
                started
            );


        const message =
            error instanceof Error
                ? error.message
                : String(
                    error
                );


        results.push({
            role:
                requirement.role,

            profile:
                expectedProfile,

            status:
                "FAIL",

            elapsedMs,

            model:
                null,

            width:
                null,

            height:
                null,

            seed:
                null,

            tileset:
                null,

            error:
                message
        });


        console.log(
            `FAIL ${(elapsedMs / 1000).toFixed(1)}s`
        );


        console.error(
            `        ${message}`
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


const passed =
    results.filter(
        result =>
            result.status ===
            "PASS"
    ).length;


const failed =
    results.length -
    passed;


const summary = {
    generatedAt:
        new Date()
            .toISOString(),

    baseUrl,

    passed,

    failed,

    total:
        results.length,

    valid:
        failed ===
        0,

    results
};


await writeJson(
    join(
        outputRoot,
        "manifest.json"
    ),
    {
        assets:
            manifestEntries
    }
);


await writeJson(
    join(
        outputRoot,
        "summary.json"
    ),
    summary
);


console.log(
    [
        "",
        "==============================================",
        failed ===
            0
            ? "SMOKE PASS"
            : "SMOKE FAIL",
        "==============================================",
        "",
        `Passed: ${passed}/${results.length}`,
        `Failed: ${failed}/${results.length}`,
        `Results: ${outputRoot}`,
        ""
    ].join(
        "\n"
    )
);


if (
    failed >
    0
) {
    process.exitCode =
        1;
}


function workflow(
    profile,
    workflowEnv,
    defaultFilename,
    modelEnv,
    defaultModel
) {
    return {
        profile,

        workflowPath:
            resolveConfiguredPath(
                process.env[
                    workflowEnv
                ],

                join(
                    repositoryRoot,
                    "config",
                    "comfyui",
                    defaultFilename
                )
            ),

        model:
            process.env[
                modelEnv
            ] ??
            defaultModel,

        outputNodeId,

        timeoutMs
    };
}


async function validateGeneratedAsset({
    requirement,
    expectedProfile,
    entry,
    metadata,
    assetPath
}) {
    if (
        metadata.origin !==
        "generated"
    ) {
        throw new Error(
            `Expected origin=generated, received ${String(
                metadata.origin
            )}`
        );
    }


    if (
        metadata.profile !==
        expectedProfile
    ) {
        throw new Error(
            [
                `Expected profile=${expectedProfile},`,
                `received ${String(
                    metadata.profile
                )}`
            ].join(
                " "
            )
        );
    }


    if (
        metadata.role !==
        requirement.role
    ) {
        throw new Error(
            [
                `Expected role=${requirement.role},`,
                `received ${String(
                    metadata.role
                )}`
            ].join(
                " "
            )
        );
    }


    if (
        !metadata.generator
            ?.promptHash
    ) {
        throw new Error(
            "Generated metadata has no promptHash"
        );
    }


    const file =
        await stat(
            assetPath
        );


    if (
        !file.isFile() ||
        file.size <=
            0
    ) {
        throw new Error(
            "Generated asset file is empty"
        );
    }


    if (
        expectedProfile ===
        "tileset"
    ) {
        const tileset =
            metadata.tileset;


        if (
            !tileset
        ) {
            throw new Error(
                "Tileset metadata is missing"
            );
        }


        if (
            tileset.tileWidth !==
                64 ||
            tileset.tileHeight !==
                64 ||
            tileset.columns !==
                8 ||
            tileset.rows !==
                1
        ) {
            throw new Error(
                [
                    "Unexpected tileset layout:",
                    JSON.stringify({
                        tileWidth:
                            tileset.tileWidth,

                        tileHeight:
                            tileset.tileHeight,

                        columns:
                            tileset.columns,

                        rows:
                            tileset.rows
                    })
                ].join(
                    " "
                )
            );
        }


        if (
            metadata.image
                ?.width !==
                512 ||
            metadata.image
                ?.height !==
                64
        ) {
            throw new Error(
                [
                    "Unexpected tileset output size:",
                    `${metadata.image?.width}x${metadata.image?.height}`
                ].join(
                    " "
                )
            );
        }


        if (
            !entry.spritesheet
        ) {
            throw new Error(
                "Tileset manifest entry has no spritesheet metadata"
            );
        }


        if (
            entry.spritesheet
                .frameWidth !==
                64 ||
            entry.spritesheet
                .frameHeight !==
                64 ||
            entry.spritesheet
                .columns !==
                8 ||
            entry.spritesheet
                .rows !==
                1
        ) {
            throw new Error(
                "Tileset manifest spritesheet geometry is invalid"
            );
        }


        if (
            !Array.isArray(
                tileset.seamScores
            ) ||
            tileset.seamScores.length !==
                8
        ) {
            throw new Error(
                "Tileset does not contain 8 self-seam scores"
            );
        }


        if (
            tileset.seamScores.some(
                score =>
                    !Number.isFinite(
                        score
                    )
            )
        ) {
            throw new Error(
                "Tileset contains invalid seam score"
            );
        }


        /*
         * These fields exist after inter-frame ordering.
         * Keeping the checks conditional makes the smoke
         * script usable while local hardening changes are
         * being rebased/pushed.
         */
        if (
            tileset.tileOrder !==
            undefined
        ) {
            if (
                !Array.isArray(
                    tileset.tileOrder
                ) ||
                tileset.tileOrder.length !==
                    8
            ) {
                throw new Error(
                    "Tileset tileOrder is invalid"
                );
            }
        }


        if (
            tileset.interTileSeamScores !==
            undefined
        ) {
            if (
                !Array.isArray(
                    tileset.interTileSeamScores
                ) ||
                tileset.interTileSeamScores.length !==
                    8
            ) {
                throw new Error(
                    "Tileset interTileSeamScores is invalid"
                );
            }
        }
    }
}


function fileNameFromGamePath(
    gamePath
) {
    const normalized =
        gamePath.replace(
            /\\/g,
            "/"
        );


    const pieces =
        normalized.split(
            "/"
        );


    return pieces[
        pieces.length -
            1
    ];
}


function resolveConfiguredPath(
    configured,
    fallback
) {
    if (
        !configured
    ) {
        return fallback;
    }


    return isAbsolute(
        configured
    )
        ? configured
        : resolve(
            repositoryRoot,
            configured
        );
}


function parsePositiveInteger(
    value,
    fallback
) {
    if (
        !value
    ) {
        return fallback;
    }


    const parsed =
        Number.parseInt(
            value,
            10
        );


    return Number.isInteger(
        parsed
    ) &&
        parsed >
            0
        ? parsed
        : fallback;
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


async function loadRepositoryEnv() {
    const path =
        join(
            repositoryRoot,
            ".env"
        );


    let source;


    try {
        source =
            await readFile(
                path,
                "utf8"
            );
    } catch {
        return;
    }


    for (
        const rawLine of
        source.split(
            /\r?\n/
        )
    ) {
        const line =
            rawLine.trim();


        if (
            !line ||
            line.startsWith(
                "#"
            )
        ) {
            continue;
        }


        const separator =
            line.indexOf(
                "="
            );


        if (
            separator <=
            0
        ) {
            continue;
        }


        const key =
            line.slice(
                0,
                separator
            )
                .trim();


        let value =
            line.slice(
                separator +
                    1
            )
                .trim();


        if (
            (
                value.startsWith(
                    "\""
                ) &&
                value.endsWith(
                    "\""
                )
            ) ||
            (
                value.startsWith(
                    "'"
                ) &&
                value.endsWith(
                    "'"
                )
            )
        ) {
            value =
                value.slice(
                    1,
                    -1
                );
        }


        /*
         * Explicit shell environment always wins over .env.
         */
        if (
            process.env[
                key
            ] ===
            undefined
        ) {
            process.env[
                key
            ] =
                value;
        }
    }
}