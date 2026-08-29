export type GameOrientation =
    | "auto"
    | "portrait"
    | "landscape";

export type GameTarget =
    | "web"
    | "yandex";

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

export interface GameJob {
    id:
        string;

    prompt:
        string;

    mode:
        "template";

    orientation:
        GameOrientation;

    status:
        GameJobStatus;

    statusMessage?:
        string;

    title?:
        string;

    gameId?:
        string;

    workspacePath?:
        string;

    error?:
        string;

    target:
        GameTarget;
}

export interface CreateGameRequest {
    prompt:
        string;

    mode:
        "template";

    orientation:
        GameOrientation;

    target:
        GameTarget;
}

export interface CreateGameResponse {
    job_id:
        string;
}

export async function createGame(
    request:
        CreateGameRequest
): Promise<CreateGameResponse> {
    const response =
        await fetch(
            "/api/games",
            {
                method:
                    "POST",

                headers: {
                    "content-type":
                        "application/json",

                    accept:
                        "application/json"
                },

                body:
                    JSON.stringify(
                        request
                    )
            }
        );

    if (!response.ok) {
        throw new Error(
            await readApiError(
                response
            )
        );
    }

    const value:
        unknown =
        await response.json();

    if (
        !isRecord(value) ||
        typeof value.job_id !==
            "string"
    ) {
        throw new Error(
            "API returned an invalid create-game response"
        );
    }

    return {
        job_id:
            value.job_id
    };
}

async function readApiError(
    response:
        Response
): Promise<string> {
    try {
        const value:
            unknown =
            await response.json();

        if (
            isRecord(value) &&
            typeof value.error ===
                "string"
        ) {
            return value.error;
        }
    } catch {
        // Ignore malformed error body.
    }

    return (
        `Request failed: HTTP ${response.status}`
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

export async function getGameJob(
    jobId:
        string
): Promise<GameJob> {
    const response =
        await fetch(
            `/api/jobs/${encodeURIComponent(
                jobId
            )}`
        );

    if (!response.ok) {
        throw new Error(
            await readApiError(
                response
            )
        );
    }

    const value =
        await response.json();

    return value as GameJob;
}

export async function getGameSpec(
    gameId:
        string
): Promise<unknown> {
    return getJson(
        `/api/games/${encodeURIComponent(
            gameId
        )}/spec`
    );
}

export async function getGameReview(
    gameId:
        string
): Promise<unknown> {
    return getJson(
        `/api/games/${encodeURIComponent(
            gameId
        )}/review`
    );
}

export async function getGameQa(
    gameId:
        string
): Promise<unknown> {
    return getJson(
        `/api/games/${encodeURIComponent(
            gameId
        )}/qa`
    );
}

async function getJson(
    url:
        string
): Promise<unknown> {
    const response =
        await fetch(
            url
        );

    if (!response.ok) {
        throw new Error(
            await readApiError(
                response
            )
        );
    }

    return await response.json();
}

export interface GameHistoryItem {
    gameId:
        string;

    title:
        string;

    prompt?:
        string;

    orientation?:
        "portrait" |
        "landscape";

    createdAt:
        string;

    target?:
        GameTarget;
}

interface GameHistoryResponse {
    games:
        GameHistoryItem[];
}

export async function getGameHistory():
    Promise<GameHistoryItem[]>
{
    const response =
        await fetch(
            "/api/history"
        );

    if (!response.ok) {
        throw new Error(
            await readApiError(
                response
            )
        );
    }

    const value =
        await response.json();

    return (
        value as GameHistoryResponse
    ).games;
}