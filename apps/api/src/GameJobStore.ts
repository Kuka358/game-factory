export type GameJobStatus =
    | "created"
    | "game_design"
    | "spec_generated"
    | "template_selected"
    | "assets_resolving"
    | "project_generating"
    | "testing"
    | "platform_export"
    | "completed"
    | "failed";

export type GameJobOrientation =
    | "auto"
    | "portrait"
    | "landscape";

export type GameJobTarget =
    | "web"
    | "yandex";

export interface GameJob {
    id:
        string;

    prompt:
        string;

    mode:
        "template";

    status:
        GameJobStatus;

    createdAt:
        string;

    updatedAt:
        string;

    gameId?:
        string;

    title?:
        string;

    error?:
        string;

    workspacePath?:
        string;

    orientation:
        GameJobOrientation;

    statusMessage?:
        string;

    target:
        GameJobTarget;
}

export interface CreateGameJobInput {
    prompt:
        string;

    mode:
        "template";

    orientation:
        GameJobOrientation;

    target:
        GameJobTarget;
}

export class GameJobStore {
    private readonly jobs =
        new Map<
            string,
            GameJob
        >();

    create(
        input:
            CreateGameJobInput
    ): GameJob {
        const now =
            new Date()
                .toISOString();

        const job: GameJob = {
            id:
                crypto.randomUUID(),

            prompt:
                input.prompt,

            mode:
                input.mode,

            orientation:
                input.orientation,

            target:
                input.target,

            status:
                "created",

            createdAt:
                now,

            updatedAt:
                now
        };

        this.jobs.set(
            job.id,
            job
        );

        return {
            ...job
        };
    }

    get(
        id:
            string
    ): GameJob | undefined {
        const job =
            this.jobs.get(
                id
            );

        return job
            ? {
                ...job
            }
            : undefined;
    }

    list():
        GameJob[]
    {
        return [
            ...this.jobs.values()
        ]
            .map(
                (job) => ({
                    ...job
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.createdAt.localeCompare(
                        a.createdAt
                    )
            );
    }

    update(
        id:
            string,

        patch:
            Partial<
                Omit<
                    GameJob,
                    "id" |
                    "createdAt"
                >
            >
    ): GameJob {
        const existing =
            this.jobs.get(
                id
            );

        if (!existing) {
            throw new Error(
                `Unknown job: ${id}`
            );
        }

        const updated:
            GameJob = {
            ...existing,
            ...patch,

            updatedAt:
                new Date()
                    .toISOString()
        };

        this.jobs.set(
            id,
            updated
        );

        return {
            ...updated
        };
    }
}