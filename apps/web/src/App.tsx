import {
    type FormEvent,
    useEffect,
    useState
} from "react";

import {
    createGame,
    getGameHistory,
    getGameJob,
    getGameQa,
    getGameReview,
    getGameSpec,
    type GameHistoryItem,
    type GameJob,
    type GameOrientation
} from "./api.js";

import type {
    ReactNode
} from "react";

import type { GameTarget } from "./api.js";

type ResultTab =
    | "preview"
    | "spec"
    | "qa";

export function App() {
    const [
        prompt,
        setPrompt
    ] =
        useState(
            "Игра про рыцаря, который убегает от дракона"
        );

    const [
        orientation,
        setOrientation
    ] =
        useState<GameOrientation>(
            "auto"
        );

    const [
        submitting,
        setSubmitting
    ] =
        useState(
            false
        );

    const [
        jobId,
        setJobId
    ] =
        useState<
            string | null
        >(
            null
        );

    const [
        error,
        setError
    ] =
        useState<
            string | null
        >(
            null
        );

    const [
        job,
        setJob
    ] =
        useState<
            GameJob | null
        >(
            null
        );

    const [
        gameSpec,
        setGameSpec
    ] =
        useState<unknown>(
            null
        );

    const [
        gameReview,
        setGameReview
    ] =
        useState<unknown>(
            null
        );

    const [
        qaReport,
        setQaReport
    ] =
        useState<unknown>(
            null
        );

    const [
        resultLoading,
        setResultLoading
    ] =
        useState(
            false
        );

    const [
        resultTab,
        setResultTab
    ] =
        useState<ResultTab>(
            "preview"
        );

    const [
        history,
        setHistory
    ] =
        useState<
            GameHistoryItem[]
        >(
            []
        );

    const [
        historyLoading,
        setHistoryLoading
    ] =
        useState(
            true
        );

    const completedGameId =
    job?.status ===
        "completed"
        ? job.gameId
        : undefined;

    const [
        target,
        setTarget
    ] =
        useState<GameTarget>(
            "web"
        );

    useEffect(
        () => {
            let cancelled =
                false;

            async function loadHistory():
                Promise<void>
            {
                setHistoryLoading(
                    true
                );

                try {
                    const games =
                        await getGameHistory();

                    if (!cancelled) {
                        setHistory(
                            games
                        );
                    }
                } catch (
                    cause
                ) {
                    if (
                        !cancelled
                    ) {
                        setError(
                            cause instanceof
                                Error
                                ? cause.message
                                : String(
                                    cause
                                )
                        );
                    }
                } finally {
                    if (
                        !cancelled
                    ) {
                        setHistoryLoading(
                            false
                        );
                    }
                }
            }

            void loadHistory();

            return () => {
                cancelled =
                    true;
            };
        },

        [
            completedGameId
        ]
    );

    useEffect(
        () => {
            if (!jobId) {
                return;
            }

            let cancelled =
                false;

            let timer:
                number | undefined;

            async function poll():
                Promise<void>
            {
                try {
                    const nextJob =
                        await getGameJob(
                            jobId!
                        );

                    if (cancelled) {
                        return;
                    }

                    setJob(
                        nextJob
                    );

                    if (
                        nextJob.status ===
                            "completed" ||
                        nextJob.status ===
                            "failed"
                    ) {
                        return;
                    }

                    timer =
                        window.setTimeout(
                            poll,
                            1000
                        );
                } catch (
                    cause
                ) {
                    if (cancelled) {
                        return;
                    }

                    setError(
                        cause instanceof
                            Error
                            ? cause.message
                            : String(
                                cause
                            )
                    );

                    timer =
                        window.setTimeout(
                            poll,
                            2000
                        );
                }
            }

            void poll();

            return () => {
                cancelled =
                    true;

                if (
                    timer !==
                    undefined
                ) {
                    window.clearTimeout(
                        timer
                    );
                }
            };
        },

        [
            jobId
        ]
    );

    useEffect(
        () => {
            if (
                job?.status !==
                    "completed" ||
                !job.gameId
            ) {
                return;
            }

            let cancelled =
                false;

            async function loadResult():
                Promise<void>
            {
                setResultLoading(
                    true
                );

                try {
                    const [
                        nextSpec,
                        nextReview,
                        nextQa
                    ] =
                        await Promise.all([
                            getGameSpec(
                                job!.gameId!
                            ),

                            getGameReview(
                                job!.gameId!
                            ),

                            getGameQa(
                                job!.gameId!
                            )
                        ]);

                    if (cancelled) {
                        return;
                    }

                    setGameSpec(
                        nextSpec
                    );

                    setGameReview(
                        nextReview
                    );

                    setQaReport(
                        nextQa
                    );
                } catch (
                    cause
                ) {
                    if (
                        !cancelled
                    ) {
                        setError(
                            cause instanceof
                                Error
                                ? cause.message
                                : String(
                                    cause
                                )
                        );
                    }
                } finally {
                    if (
                        !cancelled
                    ) {
                        setResultLoading(
                            false
                        );
                    }
                }
            }

            void loadResult();

            return () => {
                cancelled =
                    true;
            };
        },

        [
            job?.status,
            job?.gameId
        ]
    );

    function openHistoryGame(
        game:
            GameHistoryItem
    ): void {
        setJobId(
            null
        );

        setGameSpec(
            null
        );

        setGameReview(
            null
        );

        setQaReport(
            null
        );

        setResultTab(
            "preview"
        );

        setJob({
            id:
                `history:${game.gameId}`,

            prompt:
                game.prompt ??
                "",

            mode:
                "template",

            orientation:
                game.orientation ??
                "auto",

            status:
                "completed",

            title:
                game.title,

            gameId:
                game.gameId,

            target:
                game.target ??
                "web"
        });
    }

    async function handleSubmit(
        event:
            FormEvent<HTMLFormElement>
    ): Promise<void> {
        event.preventDefault();

        const normalizedPrompt =
            prompt.trim();

        if (!normalizedPrompt) {
            setError(
                "Enter a game description."
            );

            return;
        }

        setSubmitting(
            true
        );

        setError(
            null
        );

        setJobId(
            null
        );

        setJob(
            null
        );

        setGameSpec(
            null
        );

        setGameReview(
            null
        );

        setQaReport(
            null
        );

        try {
            const result =
                await createGame({
                    prompt:
                        normalizedPrompt,

                    mode:
                        "template",

                    orientation,

                    target
                });

            setJobId(
                result.job_id
            );
        } catch (
            cause
        ) {
            setError(
                cause instanceof
                    Error
                    ? cause.message
                    : String(
                        cause
                    )
            );
        } finally {
            setSubmitting(
                false
            );
        }
    }

    return (
        <main className="page">
            <header className="app-header">
                <div>
                    <div className="brand">
                        GAME FACTORY
                    </div>

                    <p className="subtitle">
                        Prompt → GameSpec → Game
                    </p>
                </div>

                <div className="stage-badge">
                    Template Mode
                </div>
            </header>

            <section className="create-layout">
                <form
                    className="create-card"
                    onSubmit={
                        handleSubmit
                    }
                >
                    <div className="card-header">
                        <div>
                            <p className="eyebrow">
                                NEW GENERATION
                            </p>

                            <h1>
                                Create Game
                            </h1>
                        </div>
                    </div>

                    <label
                        className="field"
                    >
                        <span className="field-title">
                            Prompt
                        </span>

                        <span className="field-description">
                            Describe the game,
                            theme and main
                            gameplay idea.
                        </span>

                        <textarea
                            value={
                                prompt
                            }
                            onChange={
                                (
                                    event
                                ) =>
                                    setPrompt(
                                        event
                                            .target
                                            .value
                                    )
                            }
                            rows={
                                7
                            }
                            placeholder="Create a game about..."
                            disabled={
                                submitting
                            }
                        />
                    </label>

                    <fieldset
                        className="field-group"
                    >
                        <legend>
                            Mode
                        </legend>

                        <RadioOption
                            checked={
                                true
                            }
                            label="Template"
                            description="Stable, deterministic generation"
                        />

                        <RadioOption
                            checked={
                                false
                            }
                            label="Hybrid"
                            description="Coming in Stage 13"
                            disabled
                        />

                        <RadioOption
                            checked={
                                false
                            }
                            label="Experimental"
                            description="Coming later"
                            disabled
                        />
                    </fieldset>

                    <fieldset
                        className="field-group"
                    >
                        <legend>
                            Target
                        </legend>

                        <div className="orientation-grid">
                            <TargetOption
                                value="web"
                                current={
                                    target
                                }
                                onChange={
                                    setTarget
                                }
                            />

                            <TargetOption
                                value="yandex"
                                current={
                                    target
                                }
                                onChange={
                                    setTarget
                                }
                            />
                        </div>
                    </fieldset>

                    <fieldset
                        className="field-group"
                    >
                        <legend>
                            Orientation
                        </legend>

                        <div className="orientation-grid">
                            <OrientationOption
                                value="auto"
                                current={
                                    orientation
                                }
                                onChange={
                                    setOrientation
                                }
                            />

                            <OrientationOption
                                value="portrait"
                                current={
                                    orientation
                                }
                                onChange={
                                    setOrientation
                                }
                            />

                            <OrientationOption
                                value="landscape"
                                current={
                                    orientation
                                }
                                onChange={
                                    setOrientation
                                }
                            />
                        </div>
                    </fieldset>

                    {error && (
                        <div
                            className="message error-message"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        className="generate-button"
                        type="submit"
                        disabled={
                            submitting ||
                            !prompt.trim()
                        }
                    >
                        {submitting
                            ? "Creating job..."
                            : "Generate Game"}
                    </button>
                </form>

                <aside className="info-panel">
                    <p className="eyebrow">
                        PIPELINE
                    </p>

                    <h2>
                        Automated generation
                    </h2>

                    <p>
                        Game Factory will
                        turn the prompt into
                        a validated GameSpec,
                        resolve assets, build
                        the Phaser project and
                        run automated QA.
                    </p>

                    <div className="pipeline-preview">
                        <PipelineItem
                            number="01"
                            label="Game Design"
                        />

                        <PipelineItem
                            number="02"
                            label="GameSpec"
                        />

                        <PipelineItem
                            number="03"
                            label="Assets"
                        />

                        <PipelineItem
                            number="04"
                            label="Build"
                        />

                        <PipelineItem
                            number="05"
                            label="Automated QA"
                        />
                    </div>
                </aside>
            </section>
            
            {job && (
                <GenerationProgress
                    job={
                        job
                    }
                />
            )}

            {job?.status ===
                "completed" && (
                <GameResult
                    job={
                        job
                    }
                    gameSpec={
                        gameSpec
                    }
                    gameReview={
                        gameReview
                    }
                    qaReport={
                        qaReport
                    }
                    loading={
                        resultLoading
                    }
                    tab={
                        resultTab
                    }
                    onTabChange={
                        setResultTab
                    }
                />
            )}

            <GameHistory
                games={
                    history
                }
                loading={
                    historyLoading
                }
                onOpen={
                    openHistoryGame
                }
            />
        
        </main>
    );
}

interface RadioOptionProps {
    checked:
        boolean;

    label:
        string;

    description:
        string;

    disabled?:
        boolean;
}

function RadioOption(
    props:
        RadioOptionProps
) {
    return (
        <label
            className={[
                "radio-option",
                props.disabled
                    ? "disabled"
                    : ""
            ].join(
                " "
            )}
        >
            <input
                type="radio"
                checked={
                    props.checked
                }
                disabled={
                    props.disabled
                }
                readOnly
            />

            <span>
                <strong>
                    {props.label}
                </strong>

                <small>
                    {props.description}
                </small>
            </span>
        </label>
    );
}

interface OrientationOptionProps {
    value:
        GameOrientation;

    current:
        GameOrientation;

    onChange:
        (
            value:
                GameOrientation
        ) => void;
}

function OrientationOption(
    props:
        OrientationOptionProps
) {
    const label =
        props.value
            .charAt(
                0
            )
            .toUpperCase() +
        props.value.slice(
            1
        );

    return (
        <label
            className={[
                "orientation-option",
                props.current ===
                    props.value
                    ? "selected"
                    : ""
            ].join(
                " "
            )}
        >
            <input
                type="radio"
                name="orientation"
                value={
                    props.value
                }
                checked={
                    props.current ===
                    props.value
                }
                onChange={
                    () =>
                        props.onChange(
                            props.value
                        )
                }
            />

            <span>
                {label}
            </span>
        </label>
    );
}

interface PipelineItemProps {
    number:
        string;

    label:
        string;
}

function PipelineItem(
    props:
        PipelineItemProps
) {
    return (
        <div className="pipeline-item">
            <span>
                {props.number}
            </span>

            <strong>
                {props.label}
            </strong>
        </div>
    );
}

const generationSteps = [
    {
        status:
            "game_design",
        label:
            "Game Design"
    },

    {
        status:
            "spec_generated",
        label:
            "GameSpec"
    },

    {
        status:
            "template_selected",
        label:
            "Template Selection"
    },

    {
        status:
            "assets_resolving",
        label:
            "Asset Search"
    },

    {
        status:
            "project_generating",
        label:
            "Project Generation & Build"
    },

    {
        status:
            "testing",
        label:
            "Automated QA"
    },

    {
        status:
            "platform_export",
        label:
            "Platform Export"
    },

    {
        status:
            "completed",
        label:
            "Complete"
    }
] as const;

function GenerationProgress(
    {
        job
    }:
    {
        job:
            GameJob;
    }
) {
    const currentIndex =
        generationSteps
            .findIndex(
                (step) =>
                    step.status ===
                    job.status
            );

    const steps =
        job.target ===
            "yandex"
            ? generationSteps
            : generationSteps.filter(
                (step) =>
                    step.status !==
                    "platform_export"
            );

    return (
        <section className="generation-status">
            <div className="generation-status-header">
                <div>
                    <p className="eyebrow">
                        GENERATION
                    </p>

                    <h2>
                        {job.title ??
                            "Creating game..."}
                    </h2>
                </div>

                <span className="job-status">
                    {job.status}
                </span>
            </div>

            {job.statusMessage && (
                <p className="status-message">
                    {job.statusMessage}
                </p>
            )}

            {job.status ===
                "failed" &&
                job.error && (
                    <div className="message error-message">
                        {job.error}
                    </div>
                )}

            <div className="progress-list">
                {steps.map(
                    (
                        step,
                        index
                    ) => {
                        const complete =
                            job.status ===
                                "completed" ||
                            (
                                currentIndex >
                                index
                            );

                        const active =
                            currentIndex ===
                            index &&
                            job.status !==
                                "completed";

                        return (
                            <div
                                className={[
                                    "progress-step",
                                    complete
                                        ? "complete"
                                        : "",
                                    active
                                        ? "active"
                                        : ""
                                ].join(
                                    " "
                                )}
                                key={
                                    step.status
                                }
                            >
                                <span className="progress-dot">
                                    {complete
                                        ? "✓"
                                        : index +
                                          1}
                                </span>

                                <strong>
                                    {
                                        step.label
                                    }
                                </strong>
                            </div>
                        );
                    }
                )}
            </div>
        </section>
    );
}

interface GameResultProps {
    job:
        GameJob;

    gameSpec:
        unknown;

    gameReview:
        unknown;

    qaReport:
        unknown;

    loading:
        boolean;

    tab:
        ResultTab;

    onTabChange:
        (
            tab:
                ResultTab
        ) => void;
}

function GameResult(
    props:
        GameResultProps
) {
    if (!props.job.gameId) {
        return null;
    }

    const previewUrl =
        `/api/games/${encodeURIComponent(
            props.job.gameId
        )}/preview/`;

    return (
        <section className="result-card">
            <div className="result-header">
                <div>
                    <p className="eyebrow">
                        RESULT
                    </p>

                    <h2>
                        {props.job.title ??
                            props.job.gameId}
                    </h2>
                </div>

                <div className="result-success">
                    QA PASS
                </div>

                <div className="result-actions">
                    <div className="result-success">
                        QA PASS
                    </div>

                    <a
                        className="download-button"
                        href={
                            `/api/games/${encodeURIComponent(
                                props.job.gameId
                            )}/download`
                        }
                    >
                        WEB ZIP
                    </a>

                    {props.job.target ===
                        "yandex" && (
                        <a
                            className="download-button"
                            href={
                                `/api/games/${encodeURIComponent(
                                    props.job.gameId
                                )}/download/yandex`
                            }
                        >
                            Yandex ZIP
                        </a>
                    )}
                </div>

            </div>

            <nav className="result-tabs">
                <ResultTabButton
                    active={
                        props.tab ===
                        "preview"
                    }
                    onClick={
                        () =>
                            props.onTabChange(
                                "preview"
                            )
                    }
                >
                    Preview
                </ResultTabButton>

                <ResultTabButton
                    active={
                        props.tab ===
                        "spec"
                    }
                    onClick={
                        () =>
                            props.onTabChange(
                                "spec"
                            )
                    }
                >
                    GameSpec
                </ResultTabButton>

                <ResultTabButton
                    active={
                        props.tab ===
                        "qa"
                    }
                    onClick={
                        () =>
                            props.onTabChange(
                                "qa"
                            )
                    }
                >
                    QA
                </ResultTabButton>
            </nav>

            {props.tab ===
                "preview" && (
                <div className="game-preview-frame">
                    <iframe
                        src={
                            previewUrl
                        }
                        title={
                            props.job.title ??
                            "Generated game"
                        }
                        allow="autoplay"
                    />
                </div>
            )}

            {props.tab ===
                "spec" && (
                <JsonPanel
                    value={
                        props.gameSpec
                    }
                    loading={
                        props.loading
                    }
                />
            )}

            {props.tab ===
                "qa" && (
                <div className="qa-layout">
                    <div>
                        <h3>
                            Game Review
                        </h3>

                        <JsonPanel
                            value={
                                props.gameReview
                            }
                            loading={
                                props.loading
                            }
                        />
                    </div>

                    <div>
                        <h3>
                            Automated QA
                        </h3>

                        <JsonPanel
                            value={
                                props.qaReport
                            }
                            loading={
                                props.loading
                            }
                        />
                    </div>
                </div>
            )}
        </section>
    );
}

function ResultTabButton(
    props:
        {
            active:
                boolean;

            onClick:
                () => void;

            children:
                ReactNode;
        }
) {
    return (
        <button
            type="button"
            className={
                props.active
                    ? "result-tab active"
                    : "result-tab"
            }
            onClick={
                props.onClick
            }
        >
            {props.children}
        </button>
    );
}

function JsonPanel(
    {
        value,
        loading
    }:
    {
        value:
            unknown;

        loading:
            boolean;
    }
) {
    if (loading) {
        return (
            <div className="json-panel empty">
                Loading...
            </div>
        );
    }

    if (
        value === null ||
        value === undefined
    ) {
        return (
            <div className="json-panel empty">
                No data.
            </div>
        );
    }

    return (
        <pre className="json-panel">
            {JSON.stringify(
                value,
                null,
                2
            )}
        </pre>
    );
}

interface GameHistoryProps {
    games:
        GameHistoryItem[];

    loading:
        boolean;

    onOpen:
        (
            game:
                GameHistoryItem
        ) => void;
}

function GameHistory(
    props:
        GameHistoryProps
) {
    return (
        <section className="history-card">
            <div className="history-header">
                <div>
                    <p className="eyebrow">
                        HISTORY
                    </p>

                    <h2>
                        Generated Games
                    </h2>
                </div>

                <span className="history-count">
                    {
                        props.games
                            .length
                    }
                </span>
            </div>

            {props.loading && (
                <div className="history-empty">
                    Loading history...
                </div>
            )}

            {!props.loading &&
                props.games.length ===
                    0 && (
                    <div className="history-empty">
                        No generated games yet.
                    </div>
                )}

            {!props.loading &&
                props.games.length >
                    0 && (
                    <div className="history-list">
                        {
                            props.games.map(
                                (
                                    game
                                ) => (
                                    <article
                                        className="history-item"
                                        key={
                                            game.gameId
                                        }
                                    >
                                        <div className="history-item-main">
                                            <strong>
                                                {
                                                    game.title
                                                }
                                            </strong>

                                            {game.prompt && (
                                                <p>
                                                    {
                                                        game.prompt
                                                    }
                                                </p>
                                            )}

                                            <div className="history-meta">
                                                <span>
                                                    {
                                                        game.orientation ??
                                                        "auto"
                                                    }
                                                </span>

                                                <span>
                                                    {
                                                        formatHistoryDate(
                                                            game.createdAt
                                                        )
                                                    }
                                                </span>
                                            </div>
                                        </div>

                                        <div className="history-actions">
                                            <button
                                                type="button"
                                                onClick={
                                                    () =>
                                                        props.onOpen(
                                                            game
                                                        )
                                                }
                                            >
                                                Open
                                            </button>

                                            <a
                                                href={
                                                    `/api/games/${encodeURIComponent(
                                                        game.gameId
                                                    )}/download`
                                                }
                                            >
                                                ZIP
                                            </a>
                                        </div>
                                    </article>
                                )
                            )
                        }
                    </div>
                )}
        </section>
    );
}

function formatHistoryDate(
    value:
        string
): string {
    const date =
        new Date(
            value
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return date
        .toLocaleString();
}

interface TargetOptionProps {
    value:
        GameTarget;

    current:
        GameTarget;

    onChange:
        (
            value:
                GameTarget
        ) => void;
}

function TargetOption(
    props:
        TargetOptionProps
) {
    const label =
        props.value ===
            "web"
            ? "Web"
            : "Yandex Games";

    return (
        <label
            className={[
                "orientation-option",

                props.current ===
                    props.value
                    ? "selected"
                    : ""
            ].join(
                " "
            )}
        >
            <input
                type="radio"
                name="target"
                value={
                    props.value
                }
                checked={
                    props.current ===
                    props.value
                }
                onChange={
                    () =>
                        props.onChange(
                            props.value
                        )
                }
            />

            <span>
                {label}
            </span>
        </label>
    );
}