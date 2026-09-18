import type {
    AutonomousRunStatus,
    IterationContract
} from "./contracts.js";

export interface VerificationCheckResult {
    id:
        string;

    command:
        string;

    passed:
        boolean;

    exitCode?:
        number;

    stdout?:
        string;

    stderr?:
        string;

    durationMs?:
        number;
}

export interface VerificationReport {
    passed:
        boolean;

    checks:
        readonly VerificationCheckResult[];
}

export interface WorkerWorkspaceRef {
    id:
        string;

    root:
        string;

    baseRevision:
        string;
}

export type IterationAcceptanceStatus =
    | "pending"
    | "accepted";


export interface IterationAcceptance {
    id:
        string;

    status:
        IterationAcceptanceStatus;

    attempt:
        number;

    baseRevision:
        string;

    digest:
        string;

    changedFiles:
        readonly string[];

    createdAt:
        string;

    acceptedRevision?:
        string;

    acceptedAt?:
        string;
}

export interface IterationAttempt {
    attempt:
        number;

    startedAt:
        string;

    completedAt?:
        string;

    verification?:
        VerificationReport;

    error?:
        string;
}

export interface IterationRecord {
    contract:
        IterationContract;

    attempts:
        IterationAttempt[];

    completed:
        boolean;

    checkpointId?:
        string;

    workspace?:
        WorkerWorkspaceRef;

    acceptance?:
        IterationAcceptance;
}

export interface AutonomousRun {
    id:
        string;

    goal:
        string;

    status:
        AutonomousRunStatus;

    currentIteration:
        number;

    maxIterations:
        number;

    iterations:
        IterationRecord[];

    createdAt:
        string;

    updatedAt:
        string;

    completionReason?:
        string;

    failureReason?:
        string;
}