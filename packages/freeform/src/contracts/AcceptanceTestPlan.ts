
export type AcceptanceTestLevel =
    | "unit"
    | "browser_smoke";

export interface AcceptanceTestScenario {
    id: string;

    // Must exactly match one acceptance criterion
    // from the corresponding TaskGraph task.
    requirement: string;

    level: AcceptanceTestLevel;

    // Preconditions and initial game state.
    setup: string[];

    // Events, inputs or simulation steps.
    actions: string[];

    // Observable results and invariants.
    assertions: string[];
}

export interface AcceptanceTestPlan {
    schemaVersion: "1.0";

    blueprintId: string;
    graphRevision: number;
    graphDigest: string;

    taskId: string;

    scenarios: AcceptanceTestScenario[];

    // Unresolved specification ambiguities.
    // An executable test generator must reject
    // plans containing unresolved questions.
    unresolvedQuestions: string[];
}
