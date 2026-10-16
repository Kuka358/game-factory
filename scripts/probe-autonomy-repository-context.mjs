import {
    resolve
} from "node:path";

import {
    GitRepositoryContextDiscovery
} from "../packages/autonomy/dist/index.js";


const repositoryRoot =
    resolve(
        process.cwd()
    );


const target =
    "packages/engine-phaser/src/templates/platformer/PlatformerScene.ts";


const contract = {
    id:
        "real-repository-context-probe",

    objective:
        "Inspect repository context for the real PlatformerScene implementation",

    rationale:
        "Verify that repository intelligence discovers useful architectural context in the real game-factory monorepo",

    /*
     * This probe does not write anything, but keep write scope
     * deliberately narrow to mirror a real coding iteration.
     */
    scope: {
        allowedPaths: [
            target
        ],

        forbiddenPaths:
            []
    },

    /*
     * Read context may span workspace packages.
     */
    contextScope: {
        allowedPaths: [
            "packages/**"
        ],

        forbiddenPaths: [
            "packages/**/node_modules/**",
            "packages/**/dist/**"
        ]
    },

    changes: [
        {
            description:
                "Inspect the PlatformerScene implementation and its architectural dependencies",

            filesHint: [
                target
            ]
        }
    ],

    acceptanceCriteria: [
        "Relevant imports are discovered",
        "Owning package metadata is discovered",
        "Package entrypoint is discovered",
        "Sensitive paths remain excluded"
    ],

    verification:
        [],

    architecturalConstraints: [
        "Do not modify repository files"
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


const discovery =
    new GitRepositoryContextDiscovery({
        maxSelectedFiles:
            16,

        maxInventoryEntries:
            2_000
    });


const result =
    await discovery.discover({
        repositoryRoot,
        contract
    });


console.log(
    "Repository context probe"
);

console.log(
    `Target: ${target}`
);

console.log(
    "\nSelected full-content context:"
);

for (
    const [
        index,
        path
    ] of
    result.selectedPaths.entries()
) {
    console.log(
        `${String(index + 1).padStart(2, "0")}. ${path}`
    );
}


console.log(
    `\nInventory entries exposed: ${result.inventory.length}`
);


const requiredPaths = [
    target,

    "packages/engine-phaser/src/templates/platformer/platformer-bodies.ts",

    "packages/engine-phaser/src/templates/platformer/PlatformerLevelGenerator.ts",

    "packages/engine-phaser/src/debug/PlatformerPhysicsDiagnostics.ts",

    "packages/engine-phaser/src/input/PhaserInputService.ts",

    "packages/engine-phaser/src/assets/PhaserAssetRegistry.ts",

    "packages/engine-phaser/package.json",

    "packages/engine-phaser/src/index.ts",

    "packages/game-spec/package.json",
    "packages/game-spec/src/index.ts",

    "packages/runtime/package.json",
    "packages/runtime/src/index.ts"
];


for (
    const requiredPath of
    requiredPaths
) {
    if (
        !result.selectedPaths.includes(
            requiredPath
        )
    ) {
        throw new Error(
            `Expected repository intelligence context is missing: ${requiredPath}`
        );
    }
}


if (
    result.selectedPaths[0] !==
    target
) {
    throw new Error(
        "Explicit target was not ranked first"
    );
}


for (
    const path of
    [
        ...result.inventory,
        ...result.selectedPaths
    ]
) {
    const lower =
        path.toLowerCase();

    if (
        lower.includes(
            "/node_modules/"
        ) ||
        lower.includes(
            "/dist/"
        ) ||
        lower.includes(
            "/.game-factory/"
        ) ||
        lower.endsWith(
            "/.env"
        ) ||
        lower.includes(
            "/.env."
        ) ||
        lower.endsWith(
            "/.npmrc"
        )
    ) {
        throw new Error(
            `Unsafe repository context path was exposed: ${path}`
        );
    }
}


const workspaceManifests =
    result.selectedPaths.filter(
        path =>
            path.endsWith(
                "/package.json"
            ) &&
            path !==
                "packages/engine-phaser/package.json"
    );


console.log(
    "\nWorkspace dependency manifests selected:"
);

if (
    workspaceManifests.length ===
    0
) {
    console.log(
        "(none fit inside selected-file budget)"
    );
} else {
    for (
        const path of
        workspaceManifests
    ) {
        console.log(
            `- ${path}`
        );
    }
}


console.log(
    "\nPASS explicit target ranked first"
);

console.log(
    "PASS direct relative imports discovered"
);

console.log(
    "PASS owning package manifest discovered"
);

console.log(
    "PASS package entrypoint discovered"
);

console.log(
    "PASS sensitive/build paths excluded"
);

console.log(
    "\nREAL GAME-FACTORY REPOSITORY CONTEXT PROBE PASSED"
);