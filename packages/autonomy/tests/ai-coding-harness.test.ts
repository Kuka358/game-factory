import {
    access,
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
    describe,
    expect,
    it
} from "vitest";

import type {
    AIProvider,
    AIRequest
} from "@game-factory/ai";

import {
    AICodingHarness,
    type CodingHarnessInput,
    type IterationContract
} from "../src/index.js";


const contract:
    IterationContract = {
        id:
            "ai-edit-iteration",

        objective:
            "Modify source files",

        rationale:
            "Test AI coding harness",

        scope: {
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
                    "Update existing file",

                filesHint: [
                    "src/existing.ts"
                ]
            },

            {
                description:
                    "Create another file",

                filesHint: [
                    "src/new.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "Source files are updated"
        ],

        verification:
            [],

        architecturalConstraints:
            [],

        maxLocalAttempts:
            2,

        escalation: {
            onRepeatedFailure:
                true,

            onArchitectureConflict:
                true,

            maxRepairRounds:
                1
        }
    };


describe(
    "AICodingHarness",
    () => {
        it(
            "provides hinted repository context and applies scoped write edits",
            async () => {
                const repository =
                    await createRepository();

                try {
                    let capturedRequest:
                        AIRequest |
                        undefined;

                    const provider =
                        createProvider(
                            {
                                summary:
                                    "Updated source files",

                                edits: [
                                    {
                                        operation:
                                            "write",

                                        path:
                                            "src/existing.ts",

                                        content:
                                            "export const existing = 2;\n"
                                    },

                                    {
                                        operation:
                                            "write",

                                        path:
                                            "src/new.ts",

                                        content:
                                            "export const created = true;\n"
                                    }
                                ]
                            },

                            request => {
                                capturedRequest =
                                    request;
                            }
                        );

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    const result =
                        await harness
                            .executeIteration(
                                createInput(
                                    repository
                                )
                            );

                    expect(
                        result
                    ).toEqual({
                        summary:
                            "Updated source files",

                        changedFiles: [
                            "src/existing.ts",
                            "src/new.ts"
                        ]
                    });

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
                        "export const existing = 2;\n"
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

                    expect(
                        capturedRequest
                            ?.model
                    ).toBe(
                        "test-model"
                    );

                    expect(
                        capturedRequest
                            ?.structuredOutput
                            ?.name
                    ).toBe(
                        "coding_iteration"
                    );

                    const userMessage =
                        capturedRequest
                            ?.messages
                            .find(
                                message =>
                                    message.role ===
                                    "user"
                            );

                    if (
                        !userMessage ||
                        typeof userMessage
                            .content !==
                            "string"
                    ) {
                        throw new Error(
                            "Expected string user prompt"
                        );
                    }

                    const prompt =
                        JSON.parse(
                            userMessage.content
                        ) as {
                            iteration: {
                                id:
                                    string;
                            };

                            repositoryFiles:
                                Array<{
                                    path:
                                        string;

                                    content:
                                        string;
                                }>;
                        };

                    expect(
                        prompt.iteration.id
                    ).toBe(
                        contract.id
                    );

                    /*
                     * existing.ts is supplied to the model.
                     * new.ts does not exist yet, so it is intentionally
                     * absent from repositoryFiles.
                     */
                    expect(
                        prompt.repositoryFiles
                    ).toEqual([
                        {
                            path:
                                "src/existing.ts",

                            content:
                                "export const existing = 1;\n"
                        }
                    ]);
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
            "can read wider repository context without granting wider write permission",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "helper.ts"
                        ),
                        "export const helper = 42;\n",
                        "utf8"
                    );

                    let capturedRequest:
                        AIRequest |
                        undefined;

                    const provider =
                        createProvider(
                            {
                                summary:
                                    "Tried to modify read-only context",

                                edits: [
                                    {
                                        operation:
                                            "write",

                                        path:
                                            "src/helper.ts",

                                        content:
                                            "export const helper = 999;\n"
                                    }
                                ]
                            },

                            request => {
                                capturedRequest =
                                    request;
                            }
                        );

                    const discovery = {
                        async discover() {
                            return {
                                selectedPaths: [
                                    "src/helper.ts"
                                ],

                                inventory: [
                                    "src/existing.ts",
                                    "src/helper.ts"
                                ]
                            };
                        }
                    };

                    const narrowContract:
                        IterationContract = {
                            ...contract,

                            scope: {
                                allowedPaths: [
                                    "src/existing.ts"
                                ],

                                forbiddenPaths:
                                    []
                            },

                            contextScope: {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        };

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            contextDiscovery:
                                discovery
                        });

                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository,
                                narrowContract
                            )
                        )
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );


                    /*
                    * The read-only context file was supplied to the model.
                    */
                    const userMessage =
                        capturedRequest
                            ?.messages
                            .find(
                                message =>
                                    message.role ===
                                    "user"
                            );

                    if (
                        !userMessage ||
                        typeof userMessage
                            .content !==
                            "string"
                    ) {
                        throw new Error(
                            "Expected string user prompt"
                        );
                    }

                    const prompt =
                        JSON.parse(
                            userMessage.content
                        );

                    expect(
                        prompt.repositoryFiles
                    ).toContainEqual({
                        path:
                            "src/helper.ts",

                        content:
                            "export const helper = 42;\n"
                    });


                    /*
                    * But the edit was rejected because write permission
                    * is still controlled exclusively by contract.scope.
                    */
                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "helper.ts"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "export const helper = 42;\n"
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
            "applies scoped delete edits",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "delete-me.ts"
                        ),
                        "export const remove = true;\n",
                        "utf8"
                    );

                    const provider =
                        createProvider({
                            summary:
                                "Removed obsolete file",

                            edits: [
                                {
                                    operation:
                                        "delete",

                                    path:
                                        "src/delete-me.ts",

                                    content:
                                        ""
                                }
                            ]
                        });

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    const result =
                        await harness
                            .executeIteration(
                                createInput(
                                    repository
                                )
                            );

                    expect(
                        result.changedFiles
                    ).toEqual([
                        "src/delete-me.ts"
                    ]);

                    await expect(
                        access(
                            join(
                                repository,
                                "src",
                                "delete-me.ts"
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
            "rejects AI edits outside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const provider =
                        createProvider({
                            summary:
                                "Tried unsafe edit",

                            edits: [
                                {
                                    operation:
                                        "write",

                                    path:
                                        "package.json",

                                    content:
                                        "{}\n"
                                }
                            ]
                        });

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );

                    await expect(
                        access(
                            join(
                                repository,
                                "package.json"
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
            "rejects AI edits to explicitly forbidden paths",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const provider =
                        createProvider({
                            summary:
                                "Tried forbidden edit",

                            edits: [
                                {
                                    operation:
                                        "write",

                                    path:
                                        "src/secrets/key.ts",

                                    content:
                                        "export const secret = true;\n"
                                }
                            ]
                        });

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "forbidden"
                    );

                    await expect(
                        access(
                            join(
                                repository,
                                "src",
                                "secrets",
                                "key.ts"
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
            "uses repository discovery to provide bounded related context",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "helper.ts"
                        ),
                        "export const helper = 42;\n",
                        "utf8"
                    );

                    let capturedRequest:
                        AIRequest |
                        undefined;

                    const provider =
                        createProvider(
                            {
                                summary:
                                    "Used discovered context",

                                edits:
                                    []
                            },

                            request => {
                                capturedRequest =
                                    request;
                            }
                        );

                    const discovery = {
                        async discover() {
                            return {
                                selectedPaths: [
                                    "src/helper.ts",
                                    "src/existing.ts"
                                ],

                                inventory: [
                                    "src/existing.ts",
                                    "src/helper.ts",
                                    "src/new.ts"
                                ]
                            };
                        }
                    };

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            contextDiscovery:
                                discovery
                        });

                    await harness.executeIteration(
                        createInput(
                            repository
                        )
                    );

                    const userMessage =
                        capturedRequest
                            ?.messages
                            .find(
                                message =>
                                    message.role ===
                                    "user"
                            );

                    if (
                        !userMessage ||
                        typeof userMessage
                            .content !==
                            "string"
                    ) {
                        throw new Error(
                            "Expected string user prompt"
                        );
                    }

                    const prompt =
                        JSON.parse(
                            userMessage.content
                        );

                    expect(
                        prompt.repositoryInventory
                    ).toEqual([
                        "src/existing.ts",
                        "src/helper.ts",
                        "src/new.ts"
                    ]);

                    expect(
                        prompt.repositoryFiles
                    ).toEqual([
                        {
                            path:
                                "src/existing.ts",

                            content:
                                "export const existing = 1;\n"
                        },

                        {
                            path:
                                "src/helper.ts",

                            content:
                                "export const helper = 42;\n"
                        }
                    ]);
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
            "validates the entire edit batch before modifying any files",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const provider =
                        createProvider({
                            summary:
                                "Mixed safe and unsafe edits",

                            edits: [
                                {
                                    operation:
                                        "write",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "export const existing = 999;\n"
                                },

                                {
                                    operation:
                                        "write",

                                    path:
                                        "package.json",

                                    content:
                                        "{}\n"
                                }
                            ]
                        });

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );

                    /*
                    * The first otherwise-valid edit must NOT have been
                    * applied before the second edit was rejected.
                    */
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
                        "export const existing = 1;\n"
                    );

                    await expect(
                        access(
                            join(
                                repository,
                                "package.json"
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
            "rejects malformed delete edits returned by the model",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const provider =
                        createProvider({
                            summary:
                                "Invalid delete",

                            edits: [
                                {
                                    operation:
                                        "delete",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "this must be empty"
                                }
                            ]
                        });

                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });

                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "delete edit must have empty content"
                    );

                    /*
                     * Validation occurs before any edit is applied.
                     */
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
                        "export const existing = 1;\n"
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
    }
);


function createProvider(
    response:
        {
            summary:
                string;

            edits:
                readonly {
                    operation:
                        "write" | "delete";

                    path:
                        string;

                    content:
                        string;
                }[];
        },

    capture?:
        (
            request:
                AIRequest
        ) => void
): AIProvider {
    return {
        id:
            "fake-ai",

        async generate<T>(
            request:
                AIRequest
        ) {
            capture?.(
                request
            );

            return {
                data:
                    response as T,

                provider:
                    "fake-ai",

                model:
                    request.model
            };
        }
    };
}


function createInput(
    repositoryRoot:
        string,

    inputContract:
        IterationContract =
            contract
): CodingHarnessInput {
    return {
        repositoryRoot,

        runId:
            "ai-harness-run",

        goal:
            "Implement requested source changes",

        contract:
            inputContract,

        attempt:
            1
    };
}


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-ai-harness-"
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

    await writeFile(
        join(
            repository,
            "src",
            "existing.ts"
        ),
        "export const existing = 1;\n",
        "utf8"
    );

    return repository;
}