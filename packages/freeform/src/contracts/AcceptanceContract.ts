export type TaskRuntimeProfile =
    | "continuous_motion"
    | "other";

export type AcceptanceTimeModel =
    | "delta_ms"
    | "engine_managed"
    | "fixed_timestep"
    | "not_applicable";

export interface NormalizedAcceptanceRule {
    question: string;
    classification: "binding" | "non_blocking";
    rule: string;
}

export interface AcceptanceContractCandidate {
    schemaVersion: "1.0";
    blueprintId: string;
    taskId: string;
    graphDigest: string;
    referenceDigest: string;

    profile: TaskRuntimeProfile;
    timeModel: AcceptanceTimeModel;

    rules: NormalizedAcceptanceRule[];
}

export interface ReconciledAcceptanceContract
    extends AcceptanceContractCandidate {
    graphRevision: number;
    clarificationDigest: string;
    runtimePolicyDigest: string;
}