import {
    join,
    resolve
} from "node:path";

import {
    AutonomyEngine
} from "./engine.js";

import {
    FileEventJournal
} from "./events.js";

import {
    GitCheckpointManager
} from "./git-checkpoint.js";

import {
    FileRunStore
} from "./persistence.js";

import type {
    CodingWorker,
    FailureAdvisor,
    Planner,
    Verifier
} from "./providers.js";

import {
    createAutonomousRun
} from "./run.js";

import type {
    AutonomousRun
} from "./state.js";

import {
    WorkspaceGuard
} from "./workspace.js";


export interface LocalAutonomyRuntimeOptions {
    repositoryRoot:
        string;

    planner:
        Planner;

    worker:
        CodingWorker;

    verifier:
        Verifier;

    failureAdvisor:
        FailureAdvisor;

    dataDirectory?:
        string;

    allowedCommands?:
        readonly string[];

    now?:
        () => string;
}


export interface StartAutonomousRunInput {
    id:
        string;

    goal:
        string;

    maxIterations:
        number;
}


export class LocalAutonomyRuntime {
    readonly repositoryRoot:
        string;

    readonly dataDirectory:
        string;

    readonly runStore:
        FileRunStore;

    readonly eventJournal:
        FileEventJournal;

    readonly checkpointManager:
        GitCheckpointManager;

    readonly workspaceGuard:
        WorkspaceGuard;

    readonly engine:
        AutonomyEngine;

    private readonly now:
        () => string;


    constructor(
        options:
            LocalAutonomyRuntimeOptions
    ) {
        this.repositoryRoot =
            resolve(
                options.repositoryRoot
            );

        this.dataDirectory =
            resolve(
                options.dataDirectory ??
                join(
                    this.repositoryRoot,
                    ".game-factory",
                    "autonomy"
                )
            );

        this.now =
            options.now ??
            (() =>
                new Date()
                    .toISOString());

        this.runStore =
            new FileRunStore({
                directory:
                    join(
                        this.dataDirectory,
                        "runs"
                    )
            });

        this.eventJournal =
            new FileEventJournal({
                directory:
                    join(
                        this.dataDirectory,
                        "events"
                    )
            });

        this.checkpointManager =
            new GitCheckpointManager({
                repositoryRoot:
                    this.repositoryRoot,

                metadataDirectory:
                    join(
                        this.dataDirectory,
                        "checkpoints"
                    ),

                now:
                    this.now
            });

        this.workspaceGuard =
            new WorkspaceGuard({
                allowedCommands:
                    options.allowedCommands
            });

        this.engine =
            new AutonomyEngine({
                planner:
                    options.planner,

                worker:
                    options.worker,

                verifier:
                    options.verifier,

                failureAdvisor:
                    options.failureAdvisor,

                runStore:
                    this.runStore,

                eventJournal:
                    this.eventJournal,

                checkpointManager:
                    this.checkpointManager,

                now:
                    this.now
            });
    }


    async start(
        input:
            StartAutonomousRunInput
    ): Promise<AutonomousRun> {
        const existing =
            await this.runStore
                .load(
                    input.id
                );

        if (existing) {
            throw new Error(
                `Autonomous run already exists: ${input.id}`
            );
        }

        const now =
            this.now();

        const run =
            createAutonomousRun({
                id:
                    input.id,

                goal:
                    input.goal,

                maxIterations:
                    input.maxIterations,

                now
            });

        await this.runStore
            .save(
                run
            );

        return this.engine
            .run(
                run
            );
    }


    async resume(
        runId:
            string
    ): Promise<AutonomousRun | null> {
        return this.engine
            .resume(
                runId
            );
    }
}


export function createLocalAutonomyRuntime(
    options:
        LocalAutonomyRuntimeOptions
): LocalAutonomyRuntime {
    return new LocalAutonomyRuntime(
        options
    );
}