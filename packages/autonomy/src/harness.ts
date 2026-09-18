import type {
    IterationContract
} from "./contracts.js";

import type {
    VerificationReport
} from "./state.js";


export interface CodingHarnessInput {
    repositoryRoot:
        string;

    runId:
        string;

    goal:
        string;

    contract:
        IterationContract;

    attempt:
        number;

    previousVerification?:
        VerificationReport;

    repairInstructions?:
        readonly string[];
}


export interface CodingHarnessResult {
    summary:
        string;

    changedFiles:
        readonly string[];
}


export interface CodingHarness {
    executeIteration(
        input:
            CodingHarnessInput
    ): Promise<CodingHarnessResult>;
}