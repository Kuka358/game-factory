import type {
    IterationContract
} from "./contracts.js";

import type {
    AutonomousRun,
    IterationAttempt,
    VerificationReport
} from "./state.js";

import type {
    WorkerResult
} from "./providers.js";


export interface RepairContextFailedCheck {
    id:
        string;

    command:
        string;

    exitCode?:
        number;

    stdout?:
        string;

    stderr?:
        string;
}


export interface RepairContextAttempt {
    attempt:
        number;

    verificationPassed?:
        boolean;

    failedCheckIds:
        readonly string[];

    error?:
        string;
}


export interface RepairContextChange {
    description:
        string;

    filesHint:
        readonly string[];
}


export interface RepairContext {
    run: {
        id:
            string;

        goal:
            string;
    };

    iteration: {
        id:
            string;

        objective:
            string;

        rationale:
            string;

        allowedPaths:
            readonly string[];

        forbiddenPaths:
            readonly string[];

        changes:
            readonly RepairContextChange[];

        acceptanceCriteria:
            readonly string[];

        architecturalConstraints:
            readonly string[];
    };

    attemptsPerformed:
        number;

    latestWorker: {
        summary:
            string;

        changedFiles:
            readonly string[];
    };

    failedChecks:
        readonly RepairContextFailedCheck[];

    attemptHistory:
        readonly RepairContextAttempt[];

    omitted: {
        failedChecks:
            number;

        changedFiles:
            number;

        attemptHistory:
            number;

        allowedPaths:
            number;

        forbiddenPaths:
            number;
    };
}


export interface RepairContextBuilderInput {
    run:
        Readonly<AutonomousRun>;

    contract:
        IterationContract;

    attempts:
        number;

    attemptHistory:
        readonly IterationAttempt[];

    verification:
        VerificationReport;

    workerResult:
        WorkerResult;
}


export interface RepairContextBuilder {
    build(
        input:
            RepairContextBuilderInput
    ): RepairContext;
}


export interface DeterministicRepairContextBuilderOptions {
    maxFailedChecks?:
        number;

    maxDiagnosticChars?:
        number;

    maxWorkerSummaryChars?:
        number;

    maxAttemptErrorChars?:
        number;

    maxAttemptHistory?:
        number;

    maxChangedFiles?:
        number;

    maxScopePaths?:
        number;

    maxChanges?:
        number;

    maxCriteria?:
        number;

    maxArchitecturalConstraints?:
        number;

    maxGeneralTextChars?:
        number;
}


export class DeterministicRepairContextBuilder
    implements RepairContextBuilder
{
    private readonly maxFailedChecks:
        number;

    private readonly maxDiagnosticChars:
        number;

    private readonly maxWorkerSummaryChars:
        number;

    private readonly maxAttemptErrorChars:
        number;

    private readonly maxAttemptHistory:
        number;

    private readonly maxChangedFiles:
        number;

    private readonly maxScopePaths:
        number;

    private readonly maxChanges:
        number;

    private readonly maxCriteria:
        number;

    private readonly maxArchitecturalConstraints:
        number;

    private readonly maxGeneralTextChars:
        number;


    constructor(
        options:
            DeterministicRepairContextBuilderOptions = {}
    ) {
        this.maxFailedChecks =
            positiveInteger(
                options.maxFailedChecks ??
                    8,
                "maxFailedChecks"
            );

        this.maxDiagnosticChars =
            boundedTextLimit(
                options.maxDiagnosticChars ??
                    4_000,
                "maxDiagnosticChars"
            );

        this.maxWorkerSummaryChars =
            boundedTextLimit(
                options.maxWorkerSummaryChars ??
                    2_000,
                "maxWorkerSummaryChars"
            );

        this.maxAttemptErrorChars =
            boundedTextLimit(
                options.maxAttemptErrorChars ??
                    1_500,
                "maxAttemptErrorChars"
            );

        this.maxAttemptHistory =
            positiveInteger(
                options.maxAttemptHistory ??
                    6,
                "maxAttemptHistory"
            );

        this.maxChangedFiles =
            positiveInteger(
                options.maxChangedFiles ??
                    64,
                "maxChangedFiles"
            );

        this.maxScopePaths =
            positiveInteger(
                options.maxScopePaths ??
                    64,
                "maxScopePaths"
            );

        this.maxChanges =
            positiveInteger(
                options.maxChanges ??
                    32,
                "maxChanges"
            );

        this.maxCriteria =
            positiveInteger(
                options.maxCriteria ??
                    32,
                "maxCriteria"
            );

        this.maxArchitecturalConstraints =
            positiveInteger(
                options.maxArchitecturalConstraints ??
                    32,
                "maxArchitecturalConstraints"
            );

        this.maxGeneralTextChars =
            boundedTextLimit(
                options.maxGeneralTextChars ??
                    2_000,
                "maxGeneralTextChars"
            );
    }


    build(
        input:
            RepairContextBuilderInput
    ): RepairContext {
        if (
            input.verification.passed
        ) {
            throw new Error(
                "Repair context requires a failed verification report"
            );
        }


        const allFailedChecks =
            input.verification
                .checks
                .filter(
                    check =>
                        !check.passed
                );


        if (
            allFailedChecks.length ===
            0
        ) {
            throw new Error(
                "Repair context requires at least one failed verification check"
            );
        }


        const failedChecks =
            allFailedChecks
                .slice(
                    0,
                    this.maxFailedChecks
                )
                .map(
                    check => ({
                        id:
                            boundedText(
                                check.id,
                                this.maxGeneralTextChars
                            ),

                        command:
                            boundedText(
                                check.command,
                                this.maxGeneralTextChars
                            ),

                        ...(
                            check.exitCode !==
                                undefined
                                ? {
                                    exitCode:
                                        check.exitCode
                                }
                                : {}
                        ),

                        ...(
                            check.stdout
                                ? {
                                    stdout:
                                        boundedText(
                                            check.stdout,
                                            this.maxDiagnosticChars
                                        )
                                }
                                : {}
                        ),

                        ...(
                            check.stderr
                                ? {
                                    stderr:
                                        boundedText(
                                            check.stderr,
                                            this.maxDiagnosticChars
                                        )
                                }
                                : {}
                        )
                    })
                );


        const attemptHistoryStart =
            Math.max(
                0,
                input.attemptHistory.length -
                this.maxAttemptHistory
            );


        const attemptHistory =
            input.attemptHistory
                .slice(
                    attemptHistoryStart
                )
                .map(
                    attempt => ({
                        attempt:
                            attempt.attempt,

                        ...(
                            attempt.verification
                                ? {
                                    verificationPassed:
                                        attempt.verification
                                            .passed
                                }
                                : {}
                        ),

                        failedCheckIds:
                            attempt.verification
                                ?.checks
                                .filter(
                                    check =>
                                        !check.passed
                                )
                                .map(
                                    check =>
                                        boundedText(
                                            check.id,
                                            this.maxGeneralTextChars
                                        )
                                ) ??
                            [],

                        ...(
                            attempt.error
                                ? {
                                    error:
                                        boundedText(
                                            attempt.error,
                                            this.maxAttemptErrorChars
                                        )
                                }
                                : {}
                        )
                    })
                );


        const allowedPaths =
            input.contract
                .scope
                .allowedPaths
                .slice(
                    0,
                    this.maxScopePaths
                );


        const forbiddenPaths =
            input.contract
                .scope
                .forbiddenPaths
                .slice(
                    0,
                    this.maxScopePaths
                );


        const changedFiles =
            input.workerResult
                .changedFiles
                .slice(
                    0,
                    this.maxChangedFiles
                );


        return {
            run: {
                id:
                    boundedText(
                        input.run.id,
                        this.maxGeneralTextChars
                    ),

                goal:
                    boundedText(
                        input.run.goal,
                        this.maxGeneralTextChars
                    )
            },

            iteration: {
                id:
                    boundedText(
                        input.contract.id,
                        this.maxGeneralTextChars
                    ),

                objective:
                    boundedText(
                        input.contract.objective,
                        this.maxGeneralTextChars
                    ),

                rationale:
                    boundedText(
                        input.contract.rationale,
                        this.maxGeneralTextChars
                    ),

                allowedPaths,

                forbiddenPaths,

                changes:
                    input.contract
                        .changes
                        .slice(
                            0,
                            this.maxChanges
                        )
                        .map(
                            change => ({
                                description:
                                    boundedText(
                                        change.description,
                                        this.maxGeneralTextChars
                                    ),

                                filesHint:
                                    (
                                        change.filesHint ??
                                        []
                                    ).slice(
                                        0,
                                        this.maxScopePaths
                                    )
                            })
                        ),

                acceptanceCriteria:
                    input.contract
                        .acceptanceCriteria
                        .slice(
                            0,
                            this.maxCriteria
                        )
                        .map(
                            criterion =>
                                boundedText(
                                    criterion,
                                    this.maxGeneralTextChars
                                )
                        ),

                architecturalConstraints:
                    input.contract
                        .architecturalConstraints
                        .slice(
                            0,
                            this.maxArchitecturalConstraints
                        )
                        .map(
                            constraint =>
                                boundedText(
                                    constraint,
                                    this.maxGeneralTextChars
                                )
                        )
            },

            attemptsPerformed:
                input.attempts,

            latestWorker: {
                summary:
                    boundedText(
                        input.workerResult
                            .summary,
                        this.maxWorkerSummaryChars
                    ),

                changedFiles
            },

            failedChecks,

            attemptHistory,

            omitted: {
                failedChecks:
                    Math.max(
                        0,
                        allFailedChecks.length -
                        failedChecks.length
                    ),

                changedFiles:
                    Math.max(
                        0,
                        input.workerResult
                            .changedFiles
                            .length -
                        changedFiles.length
                    ),

                attemptHistory:
                    attemptHistoryStart,

                allowedPaths:
                    Math.max(
                        0,
                        input.contract
                            .scope
                            .allowedPaths
                            .length -
                        allowedPaths.length
                    ),

                forbiddenPaths:
                    Math.max(
                        0,
                        input.contract
                            .scope
                            .forbiddenPaths
                            .length -
                        forbiddenPaths.length
                    )
            }
        };
    }
}


function boundedText(
    value:
        string,

    maxChars:
        number
): string {
    const normalized =
        normalizeText(
            value
        );


    if (
        normalized.length <=
        maxChars
    ) {
        return normalized;
    }


    const omittedCharacters =
        normalized.length -
        maxChars;


    const marker =
        `\n...[truncated ${omittedCharacters} chars]...\n`;


    if (
        marker.length >=
        maxChars
    ) {
        return normalized.slice(
            0,
            maxChars
        );
    }


    const available =
        maxChars -
        marker.length;


    const headLength =
        Math.ceil(
            available *
            0.6
        );


    const tailLength =
        available -
        headLength;


    return (
        normalized.slice(
            0,
            headLength
        ) +
        marker +
        normalized.slice(
            normalized.length -
            tailLength
        )
    );
}


function normalizeText(
    value:
        string
): string {
    return value
        .replace(
            // ANSI terminal escape sequences.
            /\u001B\[[0-?]*[ -/]*[@-~]/g,
            ""
        )
        .replace(
            /\r\n?/g,
            "\n"
        )
        .trim();
}


function positiveInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive integer`
        );
    }


    return value;
}


function boundedTextLimit(
    value:
        number,

    name:
        string
): number {
    const result =
        positiveInteger(
            value,
            name
        );


    if (
        result <
        128
    ) {
        throw new Error(
            `${name} must be at least 128`
        );
    }


    return result;
}