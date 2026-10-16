import {
    execFile
} from "node:child_process";

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
    promisify
} from "node:util";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    GitRepositoryContextDiscovery,
    type IterationContract
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


describe(
    "GitRepositoryContextDiscovery",
    () => {
        it(
            "discovers bounded tracked context related to hinted files",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery({
                            maxSelectedFiles:
                                4,

                            maxInventoryEntries:
                                10
                        });

                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract:
                                createContract()
                        });

                    expect(
                        result.inventory
                    ).toContain(
                        "src/math.ts"
                    );

                    expect(
                        result.inventory
                    ).toContain(
                        "src/math.test.ts"
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        "package.json"
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        "src/secrets/key.ts"
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        ".env"
                    );

                    expect(
                        result.selectedPaths[0]
                    ).toBe(
                        "src/math.ts"
                    );

                    expect(
                        result.selectedPaths
                    ).toContain(
                        "src/math.test.ts"
                    );

                    expect(
                        result.selectedPaths.length
                    ).toBeLessThanOrEqual(
                        4
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        "src/.env.production"
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        "src/.npmrc"
                    );

                    expect(
                        result.selectedPaths
                    ).not.toContain(
                        "src/.env.production"
                    );

                    expect(
                        result.selectedPaths
                    ).not.toContain(
                        "src/.npmrc"
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
            }
        );

        it(
            "prioritizes direct imports and reverse importers around hinted files",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery({
                            maxSelectedFiles:
                                4,

                            maxInventoryEntries:
                                20
                        });


                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract:
                                createContract()
                        });


                    expect(
                        result.selectedPaths[0]
                    ).toBe(
                        "src/math.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "src/range.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "src/math.test.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "src/consumer.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).not.toContain(
                        "src/other.ts"
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
            }
        );


        it(
            "never exposes ignored or untracked files",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "local-secret.ts"
                        ),
                        "export const token = \"secret\";\n",
                        "utf8"
                    );

                    const discovery =
                        new GitRepositoryContextDiscovery();

                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract:
                                createContract()
                        });

                    expect(
                        result.inventory
                    ).not.toContain(
                        "src/local-secret.ts"
                    );

                    expect(
                        result.selectedPaths
                    ).not.toContain(
                        "src/local-secret.ts"
                    );

                    expect(
                        result.inventory
                    ).not.toContain(
                        ".env"
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
            }
        );


        it(
            "respects forbidden paths even when they are tracked",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery();

                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract:
                                createContract()
                        });

                    expect(
                        result.inventory.some(
                            path =>
                                path.startsWith(
                                    "src/secrets/"
                                )
                        )
                    ).toBe(
                        false
                    );

                    expect(
                        result.selectedPaths.some(
                            path =>
                                path.startsWith(
                                    "src/secrets/"
                                )
                        )
                    ).toBe(
                        false
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
            }
        );

        it(
            "adds package boundary context for a hinted package source file",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery({
                            maxSelectedFiles:
                                4,

                            maxInventoryEntries:
                                30
                        });


                    const contract:
                        IterationContract = {
                            id:
                                "package-context",

                            objective:
                                "Modify a feature inside a workspace package",

                            rationale:
                                "Package metadata and entrypoints provide architectural context",

                            scope: {
                                allowedPaths: [
                                    "packages/feature/src/feature.ts"
                                ],

                                forbiddenPaths:
                                    []
                            },

                            contextScope: {
                                allowedPaths: [
                                    "packages/**"
                                ],

                                forbiddenPaths:
                                    []
                            },

                            changes: [
                                {
                                    description:
                                        "Update the feature implementation",

                                    filesHint: [
                                        "packages/feature/src/feature.ts"
                                    ]
                                }
                            ],

                            acceptanceCriteria: [
                                "Feature remains compatible with its package"
                            ],

                            verification:
                                [],

                            architecturalConstraints:
                                [],

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


                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract
                        });


                    expect(
                        result.selectedPaths[0]
                    ).toBe(
                        "packages/feature/src/feature.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "packages/feature/package.json"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "packages/feature/src/index.ts"
                    );


                    expect(
                        result.selectedPaths
                    ).toContain(
                        "packages/shared/package.json"
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
            }
        );


        it(
            "uses a bounded inventory and selected file budget",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery({
                            maxSelectedFiles:
                                2,

                            maxInventoryEntries:
                                3
                        });

                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract:
                                createContract()
                        });

                    expect(
                        result.selectedPaths.length
                    ).toBeLessThanOrEqual(
                        2
                    );

                    expect(
                        result.inventory.length
                    ).toBeLessThanOrEqual(
                        3
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
            }
        );


        it(
            "can provide bounded initial context when no filesHint exists",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const discovery =
                        new GitRepositoryContextDiscovery({
                            maxSelectedFiles:
                                2
                        });

                    const contract =
                        createContract();

                    contract.changes =
                        [
                            {
                                description:
                                    "Improve source module"
                            }
                        ];

                    const result =
                        await discovery.discover({
                            repositoryRoot:
                                repository,

                            contract
                        });

                    expect(
                        result.selectedPaths.length
                    ).toBeGreaterThan(
                        0
                    );

                    expect(
                        result.selectedPaths.length
                    ).toBeLessThanOrEqual(
                        2
                    );

                    for (
                        const path of
                        result.selectedPaths
                    ) {
                        expect(
                            path.startsWith(
                                "src/"
                            )
                        ).toBe(
                            true
                        );
                    }
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
            }
        );
    }
);


function createContract():
    IterationContract
{
    return {
        id:
            "context-discovery",

        objective:
            "Extend the math module",

        rationale:
            "Test repository context discovery",

        /*
        * Write permission is deliberately narrow.
        */
        scope: {
            allowedPaths: [
                "src/math.ts"
            ],

            forbiddenPaths:
                []
        },

        /*
        * Repository context may be wider than write permission.
        */
        contextScope: {
            allowedPaths: [
                "src/**"
            ],

            forbiddenPaths: [
                "src/secrets/**"
            ]
        },

        changes: [
            {
                description:
                    "Update math implementation and related tests",

                filesHint: [
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "Math implementation remains tested"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

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
}


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-context-"
            )
        );

    await runGit(
        repository,
        [
            "init"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.autocrlf",
            "false"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.eol",
            "lf"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.email",
            "test@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Test"
        ]
    );


    await mkdir(
        join(
            repository,
            "src",
            "secrets"
        ),
        {
            recursive:
                true
        }
    );

    await mkdir(
        join(
            repository,
            "packages",
            "feature",
            "src"
        ),
        {
            recursive:
                true
        }
    );


    await mkdir(
        join(
            repository,
            "packages",
            "shared",
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
            ".gitignore"
        ),
        ".env\nnode_modules/\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "package.json"
        ),
        "{}\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "math.ts"
        ),
        [
            'import { range } from "./range.js";',
            "",
            "export const add =",
            "    (a: number, b: number) =>",
            "        a + b + range * 0;",
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "range.ts"
        ),
        "export const range = 10;\n",
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "src",
            "consumer.ts"
        ),
        [
            'import { add } from "./math.js";',
            "",
            "export const consumed = add(1, 2);",
            ""
        ].join(
            "\n"
        ),
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "math.test.ts"
        ),
        "import { add } from \"./math.js\";\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "other.ts"
        ),
        "export const other = true;\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "utility.ts"
        ),
        "export const utility = true;\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "secrets",
            "key.ts"
        ),
        "export const secret = true;\n",
        "utf8"
    );

    /*
     * Ignored secret: it must never appear in context inventory.
     */
    await writeFile(
        join(
            repository,
            ".env"
        ),
        "API_KEY=super-secret\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            ".env.production"
        ),
        "TOKEN=tracked-secret\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            ".npmrc"
        ),
        "//registry.example/:_authToken=tracked-secret\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "packages",
            "feature",
            "package.json"
        ),
        JSON.stringify(
            {
                name:
                    "@fixture/feature",

                dependencies: {
                    "@fixture/shared":
                        "workspace:*"
                }
            },
            null,
            2
        ) + "\n",
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "packages",
            "feature",
            "src",
            "index.ts"
        ),
        'export * from "./feature.js";\n',
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "packages",
            "feature",
            "src",
            "feature.ts"
        ),
        "export const feature = true;\n",
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "packages",
            "shared",
            "package.json"
        ),
        JSON.stringify(
            {
                name:
                    "@fixture/shared"
            },
            null,
            2
        ) + "\n",
        "utf8"
    );


    await writeFile(
        join(
            repository,
            "packages",
            "shared",
            "src",
            "index.ts"
        ),
        "export const shared = true;\n",
        "utf8"
    );

    await runGit(
        repository,
        [
            "add",
            "."
        ]
    );

    await runGit(
        repository,
        [
            "commit",
            "-m",
            "initial"
        ]
    );

    return repository;
}


async function runGit(
    repository:
        string,

    args:
        readonly string[]
): Promise<void> {
    await execFileAsync(
        "git",
        [
            ...args
        ],
        {
            cwd:
                repository,

            encoding:
                "utf8",

            windowsHide:
                true
        }
    );
}