import type {
    IterationContract,
    IterationScope
} from "./contracts.js";

import type {
    AutonomousRun,
    VerificationReport,
    WorkerWorkspaceRef
} from "./state.js";


export interface PlanningInput {
    run:
        Readonly<AutonomousRun>;
}


export type PlanningDecision =
    | {
        type:
            "iteration";

        contract:
            IterationContract;
    }
    | {
        type:
            "complete";

        reason:
            string;
    }
    | {
        type:
            "blocked";

        reason:
            string;
    };


export interface Planner {
    plan(
        input:
            PlanningInput
    ): Promise<PlanningDecision>;
}

export interface WorkerPreparationInput {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;
}


export type WorkerSettlementOutcome =
    | "accept"
    | "discard";


export interface WorkerSettlementInput {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;

    workspace:
        WorkerWorkspaceRef;

    outcome:
        WorkerSettlementOutcome;

    workerResult?:
        WorkerResult;
}

export interface WorkerInput {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;

    attempt:
        number;

    previousVerification?:
        VerificationReport;

    repairInstructions?:
        readonly string[];

    workspace?:
        WorkerWorkspaceRef;
}

export interface WorkerChangeSet {
    digest:
        string;
}


export interface WorkerResult {
    summary:
        string;

    changedFiles:
        readonly string[];

    changeSet?:
        WorkerChangeSet;
}


export interface CodingWorker {
    prepare?(
        input:
            WorkerPreparationInput
    ): Promise<WorkerWorkspaceRef | undefined>;

    execute(
        input:
            WorkerInput
    ): Promise<WorkerResult>;

    /**
     * Implementations using a persistent workspace must make
     * settlement safe to retry after process interruption.
     */
    settle?(
        input:
            WorkerSettlementInput
    ): Promise<void>;
}


export interface VerificationInput {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;

    attempt:
        number;

    workerResult:
        WorkerResult;

    workspace?:
        WorkerWorkspaceRef;
}


export interface Verifier {
    verify(
        input:
            VerificationInput
    ): Promise<VerificationReport>;
}


export interface FailureContext {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;

    attempts:
        number;

    verification:
        VerificationReport;

    workerResult:
        WorkerResult;
}


export type FailureDecision =
    | {
        type:
            "repair";

        instructions:
            readonly string[];
    }
    | {
        type:
            "replan";

        reason:
            string;
    }
    | {
        type:
            "architecture_required";

        question:
            string;
    }
    | {
        type:
            "abort";

        reason:
            string;
    };


export interface FailureAdvisor {
    advise(
        context:
            FailureContext
    ): Promise<FailureDecision>;
}


export interface ArchitectureQuestion {
    run:
        Readonly<AutonomousRun>;

    question:
        string;

    context?:
        string;
}


export interface ArchitectureDecision {
    summary:
        string;

    constraints:
        readonly string[];

    rationale:
        string;
}


export interface ArchitectureAdvisor {
    resolve(
        question:
            ArchitectureQuestion
    ): Promise<ArchitectureDecision>;
}


export interface WorkspaceManager {
    assertPathAllowed(
        path:
            string,

        scope:
            IterationScope
    ): void | Promise<void>;

    assertCommandAllowed(
        command:
            string
    ): void | Promise<void>;
}


export interface CheckpointRef {
    id:
        string;
}


export interface CheckpointManager {
    create(
        runId:
            string,

        iterationId:
            string,

        scope:
            IterationScope
    ): Promise<CheckpointRef>;

    restore(
        checkpoint:
            CheckpointRef
    ): Promise<void>;

    release(
        checkpoint:
            CheckpointRef
    ): Promise<void>;
}