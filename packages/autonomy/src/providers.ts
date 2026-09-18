import type {
    IterationContract,
    IterationScope
} from "./contracts.js";

import type {
    AutonomousRun,
    VerificationReport
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
}


export interface WorkerResult {
    summary:
        string;

    changedFiles:
        readonly string[];
}


export interface CodingWorker {
    execute(
        input:
            WorkerInput
    ): Promise<WorkerResult>;
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