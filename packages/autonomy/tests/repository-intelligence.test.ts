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
    describe,
    expect,
    it
} from "vitest";

import {
    TypeScriptRepositoryIntelligence
} from "../src/index.js";


describe(
    "TypeScriptRepositoryIntelligence",
    () => {
        it(
            "discovers direct dependencies and reverse importers from ESM TypeScript imports",
            async () => {
                const repository =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-intelligence-"
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
                            "entry.ts"
                        ),
                        [
                            'import { dependency } from "./dependency.js";',
                            'export { helper } from "./helper.js";',
                            "",
                            "export const entry = dependency;",
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
                            "dependency.ts"
                        ),
                        "export const dependency = 1;\n",
                        "utf8"
                    );


                    await writeFile(
                        join(
                            repository,
                            "src",
                            "helper.ts"
                        ),
                        "export const helper = true;\n",
                        "utf8"
                    );


                    await writeFile(
                        join(
                            repository,
                            "src",
                            "consumer.ts"
                        ),
                        [
                            'import { entry } from "./entry.js";',
                            "",
                            "export const consumed = entry;",
                            ""
                        ].join(
                            "\n"
                        ),
                        "utf8"
                    );


                    const intelligence =
                        new TypeScriptRepositoryIntelligence();


                    const related =
                        await intelligence.analyze({
                            repositoryRoot:
                                repository,

                            eligiblePaths: [
                                "src/entry.ts",
                                "src/dependency.ts",
                                "src/helper.ts",
                                "src/consumer.ts"
                            ],

                            seedPaths: [
                                "src/entry.ts"
                            ]
                        });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "src/dependency.ts",

                        score:
                            3_000,

                        reasons: [
                            "direct_import"
                        ]
                    });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "src/helper.ts",

                        score:
                            3_000,

                        reasons: [
                            "direct_import"
                        ]
                    });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "src/consumer.ts",

                        score:
                            2_500,

                        reasons: [
                            "reverse_import"
                        ]
                    });
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
            "prioritizes directly imported workspace packages",
            async () => {
                const repository =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-direct-workspace-import-"
                        )
                    );

                try {
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
                            "runtime",
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
                            "packages",
                            "feature",
                            "package.json"
                        ),
                        JSON.stringify(
                            {
                                name:
                                    "@fixture/feature",

                                dependencies: {
                                    "@fixture/runtime":
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
                            "feature.ts"
                        ),
                        [
                            'import type { RuntimeType } from "@fixture/runtime";',
                            "",
                            "export type Feature = RuntimeType;",
                            ""
                        ].join(
                            "\n"
                        ),
                        "utf8"
                    );


                    await writeFile(
                        join(
                            repository,
                            "packages",
                            "runtime",
                            "package.json"
                        ),
                        JSON.stringify(
                            {
                                name:
                                    "@fixture/runtime"
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
                            "runtime",
                            "src",
                            "index.ts"
                        ),
                        "export type RuntimeType = string;\n",
                        "utf8"
                    );


                    const intelligence =
                        new TypeScriptRepositoryIntelligence();


                    const related =
                        await intelligence.analyze({
                            repositoryRoot:
                                repository,

                            eligiblePaths: [
                                "packages/feature/package.json",
                                "packages/feature/src/feature.ts",
                                "packages/runtime/package.json",
                                "packages/runtime/src/index.ts"
                            ],

                            seedPaths: [
                                "packages/feature/src/feature.ts"
                            ]
                        });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "packages/runtime/package.json",

                        score:
                            2_700,

                        reasons: [
                            "direct_workspace_import"
                        ]
                    });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "packages/runtime/src/index.ts",

                        score:
                            2_300,

                        reasons: [
                            "direct_workspace_entrypoint"
                        ]
                    });
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
            "discovers the owning package entrypoint and local workspace dependency manifests",
            async () => {
                const repository =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-package-intelligence-"
                        )
                    );

                try {
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
                                        "workspace:*",

                                    lodash:
                                        "^4.0.0"
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


                    const intelligence =
                        new TypeScriptRepositoryIntelligence();


                    const related =
                        await intelligence.analyze({
                            repositoryRoot:
                                repository,

                            eligiblePaths: [
                                "packages/feature/package.json",
                                "packages/feature/src/index.ts",
                                "packages/feature/src/feature.ts",
                                "packages/shared/package.json",
                                "packages/shared/src/index.ts"
                            ],

                            seedPaths: [
                                "packages/feature/src/feature.ts"
                            ]
                        });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "packages/feature/package.json",

                        score:
                            2_200,

                        reasons: [
                            "package_manifest"
                        ]
                    });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "packages/feature/src/index.ts",

                        score:
                            4_300,

                        reasons: [
                            "package_entrypoint",
                            "reverse_import"
                        ]
                    });


                    expect(
                        related
                    ).toContainEqual({
                        path:
                            "packages/shared/package.json",

                        score:
                            1_200,

                        reasons: [
                            "workspace_dependency_manifest"
                        ]
                    });
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