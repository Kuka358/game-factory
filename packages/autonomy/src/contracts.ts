export type AutonomousRunStatus =
    | "planning"
    | "implementing"
    | "verifying"
    | "repairing"
    | "escalating"
    | "committing"
    | "completed"
    | "blocked"
    | "failed";

export interface IterationScope {
    allowedPaths:
        readonly string[];

    forbiddenPaths:
        readonly string[];
}

export interface IterationChange {
    description:
        string;

    filesHint?:
        readonly string[];
}

export interface VerificationStep {
    id:
        string;

    command:
        string;

    required:
        boolean;
}

export interface EscalationPolicy {
    onRepeatedFailure:
        boolean;

    onArchitectureConflict:
        boolean;
}

export interface IterationContract {
    id:
        string;

    objective:
        string;

    rationale:
        string;

    scope:
        IterationScope;

    changes:
        readonly IterationChange[];

    acceptanceCriteria:
        readonly string[];

    verification:
        readonly VerificationStep[];

    architecturalConstraints:
        readonly string[];

    maxLocalAttempts:
        number;

    escalation:
        EscalationPolicy;
}