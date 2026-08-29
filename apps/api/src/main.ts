import {
    resolve
} from "node:path";

import {
    fileURLToPath
} from "node:url";

import {
    dirname
} from "node:path";

import Fastify from "fastify";

import {
    GameJobRunner
} from "./GameJobRunner.js";

import {
    GameJobStore,
    type GameJobOrientation,
    type GameJobTarget
} from "./GameJobStore.js";

import {
    access,
    readFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import fastifyStatic
    from "@fastify/static";

import {
    GeneratedGameCatalog
} from "./GeneratedGameCatalog.js";

import {
    ZipArchive
} from "archiver";

interface CreateGameBody {
    prompt?:
        unknown;

    mode?:
        unknown;

    orientation?:
        unknown;

    target?:
        unknown;
}

interface JobParams {
    jobId:
        string;
}

const app =
    Fastify({
        logger:
            true
    });

    

const repoRoot =
    resolveRepoRoot();

const outputRoot =
    resolve(
        repoRoot,
        "generated"
    );

const catalog =
    new GeneratedGameCatalog(
        outputRoot
    );

await app.register(
    fastifyStatic,
    {
        root:
            outputRoot,

        /*
         * We only need reply.sendFile().
         * Do not expose the entire generated directory.
         */
        serve:
            false
    }
);

const store =
    new GameJobStore();

const runner =
    new GameJobRunner({
        store,
        outputRoot
    });

app.get(
    "/api/health",

    async () => {
        return {
            status:
                "ok"
        };
    }
);

app.post<{
    Body:
        CreateGameBody;
}>(
    "/api/games",

    async (
        request,
        reply
    ) => {
        const prompt =
            typeof request
                .body?.prompt ===
                "string"
                ? request
                    .body
                    .prompt
                    .trim()
                : "";

        if (!prompt) {
            return reply
                .code(
                    400
                )
                .send({
                    error:
                        "prompt is required"
                });
        }

        const rawMode =
            request.body
                ?.mode;

        const mode =
            rawMode ===
                undefined
                ? "template"
                : rawMode;

        if (
            mode !==
            "template"
        ) {
            return reply
                .code(
                    400
                )
                .send({
                    error:
                        "Only template mode is currently supported"
                });
        }

        const orientation =
            parseOrientation(
                request.body
                    ?.orientation
            );

        if (!orientation) {
            return reply
                .code(
                    400
                )
                .send({
                    error:
                        "orientation must be auto, portrait, or landscape"
                });
        }

        const target =
            parseTarget(
                request.body
                    ?.target
            );

        if (!target) {
            return reply
                .code(
                    400
                )
                .send({
                    error:
                        "target must be web or yandex"
                });
        }

        const job =
            store.create({
                prompt,
                mode,
                orientation,
                target
            });

        runner.enqueue(
            job.id
        );

        return reply
            .code(
                202
            )
            .send({
                job_id:
                    job.id
            });
    }
);

app.get<{
    Params:
        JobParams;
}>(
    "/api/jobs/:jobId",

    async (
        request,
        reply
    ) => {
        const job =
            store.get(
                request.params
                    .jobId
            );

        if (!job) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "job not found"
                });
        }

        return job;
    }
);

app.get(
    "/api/games",

    async () => {
        return {
            games:
                store
                    .list()
                    .filter(
                        (job) =>
                            job.status ===
                            "completed"
                    )
        };
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/preview/",

    async (
        request,
        reply
    ) => {
        const job =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !job ||
            !job.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        const buildRoot =
            join(
                job.workspacePath,
                "build"
            );

        return reply.sendFile(
            "index.html",
            buildRoot
        );
    }
);

app.get<{
    Params:
        PreviewParams;
}>(
    "/api/games/:gameId/preview/*",

    async (
        request,
        reply
    ) => {
        const job =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !job ||
            !job.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        const requestedPath =
            sanitizePreviewPath(
                request.params["*"]
            );

        if (!requestedPath) {
            return reply
                .code(
                    400
                )
                .send({
                    error:
                        "invalid preview path"
                });
        }

        const buildRoot =
            join(
                job.workspacePath,
                "build"
            );

        return reply.sendFile(
            requestedPath,
            buildRoot
        );
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/spec",

    async (
        request,
        reply
    ) => {
        const job =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !job ||
            !job.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        return readJsonFile(
            join(
                job.workspacePath,
                "game-spec.json"
            )
        );
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/review",

    async (
        request,
        reply
    ) => {
        const job =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !job ||
            !job.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        return readJsonFile(
            join(
                job.workspacePath,
                "game-review.json"
            )
        );
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/qa",

    async (
        request,
        reply
    ) => {
        const job =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !job ||
            !job.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        return readJsonFile(
            join(
                job.workspacePath,
                "qa",
                "qa-report.json"
            )
        );
    }
);

app.get(
    "/api/history",

    async () => {
        const games =
            await catalog.list();

        return {
            games:
                games.map(
                    (game) => ({
                        gameId:
                            game.gameId,

                        title:
                            game.title,

                        prompt:
                            game.prompt,

                        orientation:
                            game.orientation,

                        createdAt:
                            game.createdAt
                    })
                )
        };
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/download",

    async (
        request,
        reply
    ) => {
        const game =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !game ||
            !game.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        const buildRoot =
            join(
                game.workspacePath,
                "build"
            );

        const archive =
            new ZipArchive({
                zlib: {
                    level:
                        9
                }
            });

        archive.directory(
            buildRoot,
            false
        );

        archive.on(
            "warning",

            (
                warning
            ) => {
                app.log.warn(
                    warning
                );
            }
        );

        archive.on(
            "error",

            (
                error
            ) => {
                app.log.error(
                    error
                );
            }
        );

        reply
            .header(
                "Content-Type",
                "application/zip"
            )
            .header(
                "Content-Disposition",
                `attachment; filename="${game.gameId}.zip"`
            )
            .header(
                "Cache-Control",
                "no-store"
            );

        const finalization =
            archive.finalize();

        void finalization.catch(
            (
                error
            ) => {
                archive.destroy(
                    error instanceof
                        Error
                        ? error
                        : new Error(
                            String(
                                error
                            )
                        )
                );
            }
        );

        return reply.send(
            archive
        );
    }
);

app.get<{
    Params:
        GameParams;
}>(
    "/api/games/:gameId/download/yandex",

    async (
        request,
        reply
    ) => {
        const game =
            await findCompletedGame(
                request.params
                    .gameId
            );

        if (
            !game ||
            !game.workspacePath
        ) {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "game not found"
                });
        }

        const yandexRoot =
            join(
                game.workspacePath,
                "yandex"
            );

        try {
            await access(
                join(
                    yandexRoot,
                    "index.html"
                )
            );
        } catch {
            return reply
                .code(
                    404
                )
                .send({
                    error:
                        "Yandex build was not generated for this game"
                });
        }

        const archive =
            new ZipArchive({
                zlib: {
                    level:
                        9
                }
            });

        archive.directory(
            yandexRoot,
            false
        );

        archive.on(
            "warning",
            (warning) => {
                app.log.warn(
                    warning
                );
            }
        );

        archive.on(
            "error",
            (error) => {
                app.log.error(
                    error
                );
            }
        );

        reply
            .header(
                "Content-Type",
                "application/zip"
            )
            .header(
                "Content-Disposition",
                `attachment; filename="${game.gameId}-yandex.zip"`
            )
            .header(
                "Cache-Control",
                "no-store"
            );

        const finalization =
            archive.finalize();

        void finalization.catch(
            (error) => {
                archive.destroy(
                    error instanceof
                        Error
                        ? error
                        : new Error(
                            String(
                                error
                            )
                        )
                );
            }
        );

        return reply.send(
            archive
        );
    }
);

async function start():
    Promise<void>
{
    await app.listen({
        host:
            "127.0.0.1",

        port:
            3001
    });

    console.log(
        "Game Factory API: http://127.0.0.1:3001"
    );
}

function resolveRepoRoot():
    string
{
    const currentFile =
        fileURLToPath(
            import.meta.url
        );

    return resolve(
        dirname(
            currentFile
        ),
        "../../.."
    );
}

start().catch(
    (
        error:
            unknown
    ) => {
        app.log.error(
            error
        );

        process.exitCode =
            1;
    }
);

function parseOrientation(
    value:
        unknown
): GameJobOrientation | null {
    if (
        value === undefined ||
        value === null
    ) {
        return "auto";
    }

    if (
        value === "auto"
    ) {
        return "auto";
    }

    if (
        value === "portrait"
    ) {
        return "portrait";
    }

    if (
        value === "landscape"
    ) {
        return "landscape";
    }

    return null;
}

interface GameParams {
    gameId:
        string;
}

interface PreviewParams
    extends GameParams
{
    "*":
        string;
}

async function findCompletedGame(
    gameId:
        string
) {
    const liveJob =
        store
            .list()
            .find(
                (job) =>
                    job.status ===
                        "completed" &&
                    job.gameId ===
                        gameId &&
                    typeof job.workspacePath ===
                        "string"
            );

    if (
        liveJob?.workspacePath
    ) {
        return {
            gameId,

            title:
                liveJob.title ??
                gameId,

            workspacePath:
                liveJob.workspacePath
        };
    }

    const generated =
        await catalog.get(
            gameId
        );

    if (!generated) {
        return undefined;
    }

    return {
        gameId:
            generated.gameId,

        title:
            generated.title,

        workspacePath:
            generated.workspacePath
    };
}

function sanitizePreviewPath(
    value:
        string
): string | null {
    const normalized =
        value.replace(
            /\\/g,
            "/"
        );

    if (
        !normalized ||
        normalized.startsWith(
            "/"
        ) ||
        normalized
            .split("/")
            .includes(
                ".."
            )
    ) {
        return null;
    }

    return normalized;
}

async function readJsonFile(
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

function parseTarget(
    value:
        unknown
): GameJobTarget | null {
    if (
        value === undefined ||
        value === null
    ) {
        return "web";
    }

    if (
        value === "web"
    ) {
        return "web";
    }

    if (
        value === "yandex"
    ) {
        return "yandex";
    }

    return null;
}