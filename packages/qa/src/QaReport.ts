export type QaResult =
    | "passed"
    | "failed";

export type QaTestStatus =
    | "passed"
    | "failed"
    | "skipped";

export interface QaTestResult {
    id: string;
    status: QaTestStatus;
    duration_ms: number;
}

export interface QaReport {
    result: QaResult;

    tests: QaTestResult[];

    errors: string[];

    screenshots: string[];

    metrics: Record<string, number>;
}