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
            "provides hinted repository context and applies scoped surgical edits",
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
                                            "replace",

                                        path:
                                            "src/existing.ts",

                                        content:
                                            "",

                                        oldText:
                                            "existing = 1",

                                        newText:
                                            "existing = 2",

                                        anchor:
                                            ""
                                    },

                                    {
                                        operation:
                                            "create",

                                        path:
                                            "src/new.ts",

                                        content:
                                            "export const created = true;\n",

                                        oldText:
                                            "",

                                        newText:
                                            "",

                                        anchor:
                                            ""
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
            "never exposes sensitive files hinted directly by the iteration contract",
            async () => {
                const repository =
                    await createRepository();


                try {
                    await writeFile(
                        join(
                            repository,
                            ".env"
                        ),
                        "SUPER_SECRET=must-not-reach-model\n",
                        "utf8"
                    );


                    let capturedRequest:
                        AIRequest |
                        undefined;


                    const provider =
                        createProvider(
                            {
                                summary:
                                    "No changes required",

                                edits:
                                    []
                            },

                            request => {
                                capturedRequest =
                                    request;
                            }
                        );


                    const sensitiveContract:
                        IterationContract = {
                        ...contract,

                        scope: {
                            allowedPaths: [
                                ".env"
                            ],

                            forbiddenPaths:
                                []
                        },

                        contextScope: {
                            allowedPaths: [
                                ".env"
                            ],

                            forbiddenPaths:
                                []
                        },

                        changes: [
                            {
                                description:
                                    "Inspect hinted file",

                                filesHint: [
                                    ".env"
                                ]
                            }
                        ]
                    };


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });


                    await harness.executeIteration(
                        createInput(
                            repository,
                            sensitiveContract
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
                        typeof userMessage.content !==
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
                    ).toEqual(
                        []
                    );


                    expect(
                        userMessage.content
                    ).not.toContain(
                        "SUPER_SECRET"
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
                                            "replace",

                                        path:
                                            "src/helper.ts",

                                        content:
                                            "",

                                        oldText:
                                            "helper = 42",

                                        newText:
                                            "helper = 999",

                                        anchor:
                                            ""
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
            "prioritizes required hinted files over optional context when token budget is limited",
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
                        'export const marker = "REQUIRED_CONTEXT_TOKEN";\n',
                        "utf8"
                    );


                    await writeFile(
                        join(
                            repository,
                            "src",
                            "helper.ts"
                        ),
                        'export const marker = "OPTIONAL_CONTEXT_TOKEN";\n',
                        "utf8"
                    );


                    let capturedRequest:
                        AIRequest |
                        undefined;


                    const provider =
                        createProvider(
                            {
                                summary:
                                    "Used budgeted context",

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
                                    "src/helper.ts"
                                ],

                                inventory: [
                                    "src/existing.ts",
                                    "src/helper.ts"
                                ]
                            };
                        }
                    };


                    const tokenEstimator = {
                        estimateTokens(
                            text:
                                string
                        ) {
                            let tokens =
                                0;


                            if (
                                text.includes(
                                    "REQUIRED_CONTEXT_TOKEN"
                                )
                            ) {
                                tokens +=
                                    30;
                            }


                            if (
                                text.includes(
                                    "OPTIONAL_CONTEXT_TOKEN"
                                )
                            ) {
                                tokens +=
                                    100;
                            }


                            return tokens;
                        }
                    };


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            maxTokens:
                                20,

                            modelContext: {
                                contextWindowTokens:
                                    100,

                                safetyMarginTokens:
                                    0,

                                requestOverheadTokens:
                                    0
                            },

                            tokenEstimator,

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
                        typeof userMessage.content !==
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
                            .map(
                                (
                                    file:
                                        {
                                            path:
                                                string;
                                        }
                                ) =>
                                    file.path
                            )
                    ).toEqual([
                        "src/existing.ts"
                    ]);


                    expect(
                        capturedRequest
                            ?.maxTokens
                    ).toBe(
                        20
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
            "fails before calling the model when required context cannot fit",
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
                        'export const marker = "REQUIRED_CONTEXT_TOKEN";\n',
                        "utf8"
                    );


                    let providerCalled =
                        false;


                    const provider =
                        createProvider(
                            {
                                summary:
                                    "Should not run",

                                edits:
                                    []
                            },

                            () => {
                                providerCalled =
                                    true;
                            }
                        );


                    const tokenEstimator = {
                        estimateTokens(
                            text:
                                string
                        ) {
                            return text.includes(
                                "REQUIRED_CONTEXT_TOKEN"
                            )
                                ? 100
                                : 0;
                        }
                    };


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            maxTokens:
                                20,

                            modelContext: {
                                contextWindowTokens:
                                    100,

                                safetyMarginTokens:
                                    0,

                                requestOverheadTokens:
                                    0
                            },

                            tokenEstimator
                        });


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "Required repository context exceeds model input budget"
                    );


                    expect(
                        providerCalled
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
            "reports the final model context budget decision",
            async () => {
                const repository =
                    await createRepository();


                try {
                    let observedReport:
                        {
                            contextWindowTokens:
                                number;

                            reservedOutputTokens:
                                number;

                            maxInputTokens:
                                number;

                            estimatedInputTokens:
                                number;

                            remainingHeadroomTokens:
                                number;

                            selectedFileCount:
                                number;

                            skippedFileCount:
                                number;
                        } |
                        undefined;


                    const provider =
                        createProvider({
                            summary:
                                "Observed budget",

                            edits:
                                []
                        });


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            maxTokens:
                                20,

                            modelContext: {
                                contextWindowTokens:
                                    200,

                                safetyMarginTokens:
                                    10,

                                requestOverheadTokens:
                                    5
                            },

                            tokenEstimator: {
                                estimateTokens() {
                                    return 10;
                                }
                            },

                            contextBudgetObserver(
                                report
                            ) {
                                observedReport =
                                    report;
                            }
                        });


                    await harness.executeIteration(
                        createInput(
                            repository
                        )
                    );


                    expect(
                        observedReport
                    ).toBeDefined();


                    expect(
                        observedReport
                            ?.contextWindowTokens
                    ).toBe(
                        200
                    );


                    expect(
                        observedReport
                            ?.reservedOutputTokens
                    ).toBe(
                        20
                    );


                    expect(
                        observedReport
                            ?.maxInputTokens
                    ).toBe(
                        170
                    );


                    expect(
                        observedReport
                            ?.estimatedInputTokens
                    ).toBeGreaterThan(
                        0
                    );


                    expect(
                        observedReport
                            ?.remainingHeadroomTokens
                    ).toBeGreaterThanOrEqual(
                        0
                    );


                    expect(
                        observedReport
                            ?.selectedFileCount
                    ).toBeGreaterThanOrEqual(
                        1
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
            "uses real provider token usage to calibrate later context estimates",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const reports:
                        Array<{
                            rawEstimatedInputTokens:
                                number;

                            estimateMultiplier:
                                number;

                            estimatedInputTokens:
                                number;
                        }> = [];


                    const observations:
                        Array<{
                            previousMultiplier:
                                number;

                            nextMultiplier:
                                number;
                        }> = [];


                    const provider:
                        AIProvider = {
                            id:
                                "usage-aware-fake",

                            async generate<T>(
                                request:
                                    AIRequest
                            ) {
                                return {
                                    data: {
                                        summary:
                                            "No changes",

                                        edits:
                                            []
                                    } as T,

                                    provider:
                                        "usage-aware-fake",

                                    model:
                                        request.model,

                                    usage: {
                                        inputTokens:
                                            60,

                                        outputTokens:
                                            5,

                                        totalTokens:
                                            65
                                    }
                                };
                            }
                        };


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model",

                            maxTokens:
                                10,

                            modelContext: {
                                contextWindowTokens:
                                    200,

                                safetyMarginTokens:
                                    0,

                                requestOverheadTokens:
                                    0
                            },

                            tokenEstimator: {
                                estimateTokens() {
                                    return 10;
                                }
                            },

                            contextBudgetObserver(
                                report
                            ) {
                                reports.push({
                                    rawEstimatedInputTokens:
                                        report.rawEstimatedInputTokens,

                                    estimateMultiplier:
                                        report.estimateMultiplier,

                                    estimatedInputTokens:
                                        report.estimatedInputTokens
                                });
                            },

                            contextUsageObserver(
                                observation
                            ) {
                                observations.push({
                                    previousMultiplier:
                                        observation.previousMultiplier,

                                    nextMultiplier:
                                        observation.nextMultiplier
                                });
                            }
                        });


                    await harness.executeIteration(
                        createInput(
                            repository
                        )
                    );


                    await harness.executeIteration({
                        ...createInput(
                            repository
                        ),

                        attempt:
                            2
                    });


                    expect(
                        reports
                    ).toHaveLength(
                        2
                    );


                    expect(
                        reports[0]
                            ?.rawEstimatedInputTokens
                    ).toBe(
                        30
                    );


                    expect(
                        reports[0]
                            ?.estimateMultiplier
                    ).toBe(
                        1
                    );


                    expect(
                        observations[0]
                            ?.nextMultiplier
                    ).toBe(
                        2
                    );


                    expect(
                        reports[1]
                            ?.estimateMultiplier
                    ).toBe(
                        2
                    );


                    expect(
                        reports[1]
                            ?.estimatedInputTokens
                    ).toBe(
                        60
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


                    const deleteContract:
                        IterationContract = {
                        ...contract,

                        changes: [
                            {
                                description:
                                    "Delete obsolete source file",

                                filesHint: [
                                    "src/delete-me.ts"
                                ]
                            }
                        ]
                    };


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
                                        "",

                                    oldText:
                                        "",

                                    newText:
                                        "",

                                    anchor:
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
                                    repository,
                                    deleteContract
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
                                        "create",

                                    path:
                                        "package.json",

                                    content:
                                        "{}\n",

                                    oldText:
                                        "",

                                    newText:
                                        "",

                                    anchor:
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
                                        "create",

                                    path:
                                        "src/secrets/key.ts",

                                    content:
                                        "export const secret = true;\n",

                                    oldText:
                                        "",

                                    newText:
                                        "",

                                    anchor:
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
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "",

                                    oldText:
                                        "existing = 1",

                                    newText:
                                        "existing = 999",

                                    anchor:
                                        ""
                                },

                                {
                                    operation:
                                        "create",

                                    path:
                                        "package.json",

                                    content:
                                        "{}\n",

                                    oldText:
                                        "",

                                    newText:
                                        "",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );


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
            "rejects replacing a file that was not supplied in repository context",
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


                    const provider =
                        createProvider({
                            summary:
                                "Tried blind replacement",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/helper.ts",

                                    content:
                                        "",

                                    oldText:
                                        "helper = 42",

                                    newText:
                                        "helper = 999",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "replace edit requires visible repository context"
                    );


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
            "rejects repository context that became stale while the model was running",
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


                    const provider:
                        AIProvider = {
                        id:
                            "stale-context-fake",

                        async generate<T>(
                            request:
                                AIRequest
                        ) {
                            await writeFile(
                                existingPath,
                                "export const existing = 7;\n",
                                "utf8"
                            );


                            return {
                                data: {
                                    summary:
                                        "Replace stale source",

                                    edits: [
                                        {
                                            operation:
                                                "replace",

                                            path:
                                                "src/existing.ts",

                                            content:
                                                "",

                                            oldText:
                                                "existing = 1",

                                            newText:
                                                "existing = 2",

                                            anchor:
                                                ""
                                        }
                                    ]
                                } as T,

                                provider:
                                    "stale-context-fake",

                                model:
                                    request.model
                            };
                        }
                    };


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
                        "repository context became stale before edit"
                    );


                    expect(
                        await readFile(
                            existingPath,
                            "utf8"
                        )
                    ).toBe(
                        "export const existing = 7;\n"
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
            "rejects using replace as a near-complete existing-file rewrite",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Tried near-complete rewrite",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "",

                                    oldText:
                                        "export const existing = 1;",

                                    newText:
                                        "export const existing = 2;",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "anchor covers too much"
                    );


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


        it(
            "rejects using replace as a complete existing-file rewrite",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Tried complete rewrite",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "",

                                    oldText:
                                        "export const existing = 1;\n",

                                    newText:
                                        "export const existing = 2;\n",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "must not replace the complete existing file"
                    );


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

        it(
            "ignores irrelevant anchor returned for replace",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Replaced source",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "",

                                    oldText:
                                        "existing = 1",

                                    newText:
                                        "existing = 2",

                                    anchor:
                                        "irrelevant structured output value"
                                }
                            ]
                        });


                    const harness =
                        new AICodingHarness({
                            provider,

                            model:
                                "test-model"
                        });


                    await harness.executeIteration(
                        createInput(
                            repository
                        )
                    );


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
            "rejects conflicting replace content and newText",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Returned conflicting replacement",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "existing = 2",

                                    oldText:
                                        "existing = 1",

                                    newText:
                                        "existing = 999",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "replace edit content and newText conflict"
                    );


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

        it(
            "normalizes replace content returned instead of newText",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Replaced source",

                            edits: [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "existing = 2",

                                    oldText:
                                        "existing = 1",

                                    newText:
                                        "",

                                    anchor:
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
                        await harness.executeIteration(
                            createInput(
                                repository
                            )
                        );


                    expect(
                        result.changedFiles
                    ).toEqual([
                        "src/existing.ts"
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
                        "export const existing = 2;\n"
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
            "rejects conflicting insert content returned in newText",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Returned conflicting insertion",

                            edits: [
                                {
                                    operation:
                                        "insert_after",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "\nexport const second = 2;\n",

                                    oldText:
                                        "",

                                    newText:
                                        "\nexport const malicious = 999;\n",

                                    anchor:
                                        "export const existing = 1;\n"
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
                        "insert edit newText must be empty or exactly match content"
                    );


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

        it(
            "normalizes duplicated insert content returned in newText",
            async () => {
                const repository =
                    await createRepository();


                try {
                    const provider =
                        createProvider({
                            summary:
                                "Inserted source",

                            edits: [
                                {
                                    operation:
                                        "insert_after",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "\nexport const second = 2;\n",

                                    oldText:
                                        "",

                                    newText:
                                        "\nexport const second = 2;\n",

                                    anchor:
                                        "export const existing = 1;\n"
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
                        await harness.executeIteration(
                            createInput(
                                repository
                            )
                        );


                    expect(
                        result.changedFiles
                    ).toEqual([
                        "src/existing.ts"
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
                            "export const existing = 1;",
                            "",
                            "export const second = 2;",
                            ""
                        ].join(
                            "\n"
                        )
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
                                        "this must be empty",

                                    oldText:
                                        "",

                                    newText:
                                        "",

                                    anchor:
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


                    await expect(
                        harness.executeIteration(
                            createInput(
                                repository
                            )
                        )
                    ).rejects.toThrow(
                        "delete edit must use empty content oldText newText and anchor"
                    );


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
                        "create" |
                        "replace" |
                        "insert_before" |
                        "insert_after" |
                        "delete";

                    path:
                        string;

                    content:
                        string;

                    oldText:
                        string;

                    newText:
                        string;

                    anchor:
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