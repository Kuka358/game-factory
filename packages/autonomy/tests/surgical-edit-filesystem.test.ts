import {
    access,
    mkdir,
    mkdtemp,
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
    describe,
    expect,
    it
} from "vitest";

import {
    SurgicalEditApplicator
} from "../src/index.js";


const scope = {
    allowedPaths: [
        "src/**"
    ],

    forbiddenPaths:
        []
};


describe(
    "SurgicalEditApplicator",
    () => {
        it(
            "applies create replace and delete as one validated batch",
            async () => {
                const repository =
                    await createRepository();


                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "existing.ts"
                        ),
                        [
                            "export function value() {",
                            "    return 1;",
                            "}",
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
                            "obsolete.ts"
                        ),
                        "export const obsolete = true;\n",
                        "utf8"
                    );


                    const applicator =
                        new SurgicalEditApplicator();


                    const changedFiles =
                        await applicator.apply({
                            repositoryRoot:
                                repository,

                            scope,

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    oldText:
                                        "    return 1;",

                                    newText:
                                        "    return 2;"
                                },

                                {
                                    operation:
                                        "create",

                                    path:
                                        "src/new.ts",

                                    content:
                                        "export const created = true;\n"
                                },

                                {
                                    operation:
                                        "delete",

                                    path:
                                        "src/obsolete.ts"
                                }
                            ]
                        });


                    expect(
                        changedFiles
                    ).toEqual([
                        "src/existing.ts",
                        "src/new.ts",
                        "src/obsolete.ts"
                    ]);


                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "existing.ts"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        [
                            "export function value() {",
                            "    return 2;",
                            "}",
                            ""
                        ].join(
                            "\n"
                        )
                    );


                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "new.ts"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "export const created = true;\n"
                    );


                    await expect(
                        access(
                            join(
                                repository,
                                "src",
                                "obsolete.ts"
                            )
                        )
                    ).rejects.toMatchObject({
                        code:
                            "ENOENT"
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
            "validates the complete scope before changing any file",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const existingPath =
                        join(
                            repository,
                            "src",
                            "existing.ts"
                        );


                    await writeFile(
                        existingPath,
                        "const value = 1;\n",
                        "utf8"
                    );


                    const applicator =
                        new SurgicalEditApplicator();


                    await expect(
                        applicator.apply({
                            repositoryRoot:
                                repository,

                            scope,

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    oldText:
                                        "value = 1",

                                    newText:
                                        "value = 2"
                                },

                                {
                                    operation:
                                        "create",

                                    path:
                                        "package.json",

                                    content:
                                        "{}\n"
                                }
                            ]
                        })
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );


                    expect(
                        await readFile(
                            existingPath,
                            "utf8"
                        )
                    ).toBe(
                        "const value = 1;\n"
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
            "validates the complete surgical plan before changing any file",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const firstPath =
                        join(
                            repository,
                            "src",
                            "first.ts"
                        );


                    await writeFile(
                        firstPath,
                        "const first = 1;\n",
                        "utf8"
                    );


                    await writeFile(
                        join(
                            repository,
                            "src",
                            "second.ts"
                        ),
                        "const second = 2;\n",
                        "utf8"
                    );


                    const applicator =
                        new SurgicalEditApplicator();


                    await expect(
                        applicator.apply({
                            repositoryRoot:
                                repository,

                            scope,

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/first.ts",

                                    oldText:
                                        "first = 1",

                                    newText:
                                        "first = 10"
                                },

                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/second.ts",

                                    oldText:
                                        "second = 999",

                                    newText:
                                        "second = 20"
                                }
                            ]
                        })
                    ).rejects.toThrow(
                        "anchor was not found"
                    );


                    expect(
                        await readFile(
                            firstPath,
                            "utf8"
                        )
                    ).toBe(
                        "const first = 1;\n"
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
            "refuses binary files",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const binaryPath =
                        join(
                            repository,
                            "src",
                            "binary.bin"
                        );


                    await writeFile(
                        binaryPath,
                        Buffer.from([
                            1,
                            0,
                            2,
                            3
                        ])
                    );


                    const applicator =
                        new SurgicalEditApplicator();


                    await expect(
                        applicator.apply({
                            repositoryRoot:
                                repository,

                            scope,

                            edits: [
                                {
                                    operation:
                                        "delete",

                                    path:
                                        "src/binary.bin"
                                }
                            ]
                        })
                    ).rejects.toThrow(
                        "refuse binary file content"
                    );


                    await expect(
                        access(
                            binaryPath
                        )
                    ).resolves.toBeUndefined();
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


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-surgical-filesystem-"
            )
        );


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


    return repository;
}