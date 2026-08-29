import {
    access,
    readdir,
    readFile,
    stat
} from "node:fs/promises";

import {
    join
} from "node:path";

export type GeneratedGameTarget =
    | "web"
    | "yandex";

export type GeneratedGameOrientation =
    | "portrait"
    | "landscape";

export interface GeneratedGameSummary {
    gameId:
        string;

    title:
        string;

    prompt?:
        string;

    orientation?:
        GeneratedGameOrientation;

    createdAt:
        string;

    workspacePath:
        string;

    target:
        GeneratedGameTarget;
}

export class GeneratedGameCatalog {
    constructor(
        private readonly rootPath:
            string
    ) {}

    async list():
        Promise<GeneratedGameSummary[]>
    {
        let entries;

        try {
            entries =
                await readdir(
                    this.rootPath,
                    {
                        withFileTypes:
                            true,

                        encoding:
                            "utf8"
                    }
                );
        } catch (
            error
        ) {
            if (
                isNodeError(
                    error
                ) &&
                error.code ===
                    "ENOENT"
            ) {
                return [];
            }

            throw error;
        }

        const games:
            GeneratedGameSummary[] =
            [];

        for (
            const entry of
            entries
        ) {
            if (
                !entry.isDirectory()
            ) {
                continue;
            }

            const game =
                await this.readGame(
                    entry.name
                );

            if (game) {
                games.push(
                    game
                );
            }
        }

        return games.sort(
            (
                left,
                right
            ) =>
                right.createdAt
                    .localeCompare(
                        left.createdAt
                    )
        );
    }

    async get(
        gameId:
            string
    ):
        Promise<
            GeneratedGameSummary |
            undefined
        >
    {
        if (
            !isSafeGameId(
                gameId
            )
        ) {
            return undefined;
        }

        return this.readGame(
            gameId
        );
    }

    private async readGame(
        gameId:
            string
    ):
        Promise<
            GeneratedGameSummary |
            undefined
        >
    {
        if (
            !isSafeGameId(
                gameId
            )
        ) {
            return undefined;
        }

        const workspacePath =
            join(
                this.rootPath,
                gameId
            );

        /*
         * A generated directory is considered
         * a completed game only when the
         * important final artifacts exist.
         */
        const complete =
            await allFilesExist([
                join(
                    workspacePath,
                    "game-spec.json"
                ),

                join(
                    workspacePath,
                    "build",
                    "index.html"
                ),

                join(
                    workspacePath,
                    "qa",
                    "qa-report.json"
                )
            ]);

        if (!complete) {
            return undefined;
        }

        const spec =
            await readJson(
                join(
                    workspacePath,
                    "game-spec.json"
                )
            );

        if (
            !isRecord(spec) ||
            !isRecord(
                spec.metadata
            ) ||
            typeof spec
                .metadata
                .title !==
                "string"
        ) {
            return undefined;
        }

        const aiMetadata =
            await readOptionalJson(
                join(
                    workspacePath,
                    "ai-metadata.json"
                )
            );

        const workspaceStat =
            await stat(
                workspacePath
            );

        return {
            gameId,

            title:
                spec.metadata
                    .title,

            prompt:
                extractPrompt(
                    aiMetadata
                ),

            orientation:
                extractOrientation(
                    spec
                ),

            createdAt:
                workspaceStat
                    .mtime
                    .toISOString(),

            workspacePath,

            target:
                extractTarget(
                    aiMetadata
                ),
        };
    }
}

async function allFilesExist(
    paths:
        readonly string[]
): Promise<boolean> {
    for (
        const path of
        paths
    ) {
        try {
            await access(
                path
            );
        } catch {
            return false;
        }
    }

    return true;
}

async function readJson(
    path:
        string
): Promise<unknown> {
    const content =
        await readFile(
            path,
            "utf8"
        );

    return JSON.parse(
        content
    ) as unknown;
}

async function readOptionalJson(
    path:
        string
): Promise<unknown> {
    try {
        return await readJson(
            path
        );
    } catch (
        error
    ) {
        if (
            isNodeError(
                error
            ) &&
            error.code ===
                "ENOENT"
        ) {
            return undefined;
        }

        throw error;
    }
}

function extractPrompt(
    value:
        unknown
): string | undefined {
    if (
        !isRecord(value) ||
        typeof value.inputPrompt !==
            "string"
    ) {
        return undefined;
    }

    return value
        .inputPrompt
        .trim() ||
        undefined;
}

function extractOrientation(
    spec:
        Record<string, unknown>
):
    GeneratedGameOrientation |
    undefined
{
    if (
        !isRecord(
            spec.game
        )
    ) {
        return undefined;
    }

    if (
        spec.game.orientation ===
        "portrait"
    ) {
        return "portrait";
    }

    if (
        spec.game.orientation ===
        "landscape"
    ) {
        return "landscape";
    }

    return undefined;
}

function isSafeGameId(
    value:
        string
): boolean {
    return /^[a-z0-9][a-z0-9-]*$/i
        .test(
            value
        );
}

function isRecord(
    value:
        unknown
): value is
    Record<string, unknown>
{
    return (
        typeof value ===
            "object" &&
        value !== null &&
        !Array.isArray(
            value
        )
    );
}

function isNodeError(
    value:
        unknown
): value is
    NodeJS.ErrnoException
{
    return value instanceof
        Error;
}

function extractTarget(
    value:
        unknown
): GeneratedGameTarget {
    if (
        !isRecord(value) ||
        !isRecord(
            value.generationOptions
        )
    ) {
        return "web";
    }

    if (
        value
            .generationOptions
            .target ===
        "yandex"
    ) {
        return "yandex";
    }

    return "web";
}