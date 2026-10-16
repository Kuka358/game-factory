
export type TaskStatus =
    | "pending"
    | "ready"
    | "running"
    | "validating"
    | "succeeded"
    | "retryable_failed"
    | "blocked"
    | "escalated";

export type TaskCheck =
    | "tsc"
    | "vite"
    | "unit"
    | "browser_smoke";

export interface ImplementationTask {
    id: string;
    title: string;
    objective: string;

    dependsOn: string[];

    allowedPaths: string[];
    readPaths: string[];

    interfaces: string[];
    acceptance: string[];

    checks: TaskCheck[];

    estimatedComplexity:
        | "small"
        | "medium";

    maxLocalAttempts: number;
}

export interface TaskGraph {
    schemaVersion: "1.0";
    blueprintId: string;
    tasks: ImplementationTask[];
    revision: number;
}
