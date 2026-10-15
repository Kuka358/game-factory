import type {
    AutonomousRun,
    IterationRecord,
    VerificationReport
} from "./state.js";


export interface PlanningContextVerification {
    passed:
        boolean;

    failedCheckIds:
        readonly string[];
}


export interface PlanningContextIteration {
    id:
        string;

    objective:
        string;

    attemptsPerformed:
        number;

    changedFiles:
        readonly string[];

    latestVerification?:
        PlanningContextVerification;
}


export interface PlanningContextReplan {
    previousIterationId:
        string;

    previousObjective:
        string;

    reason:
        string;
}


export interface PlanningContext {
    run: {
        id:
            string;

        goal:
            string;
    };

    progress: {
        currentIteration:
            number;

        maxIterations:
            number;

        remainingIterations:
            number;

        completedIterationCount:
            number;
    };

    completedIterations:
        readonly PlanningContextIteration[];

    replan?:
        PlanningContextReplan;

    omitted: {
        completedIterations:
            number;

        changedFiles:
            number;
    };
}


export interface PlanningContextReplanInput {
    previousIterationId:
        string;

    previousObjective:
        string;

    reason:
        string;
}


export interface PlanningContextBuilderInput {
    run:
        Readonly<AutonomousRun>;

    replan?:
        PlanningContextReplanInput;
}


export interface PlanningContextBuilder {
    build(
        input:
            PlanningContextBuilderInput
    ): PlanningContext;
}


export interface DeterministicPlanningContextBuilderOptions {
    maxCompletedIterations?:
        number;

    maxChangedFilesPerIteration?:
        number;

    maxGoalChars?:
        number;

    maxObjectiveChars?:
        number;

    maxReplanReasonChars?:
        number;
}


export class DeterministicPlanningContextBuilder
    implements PlanningContextBuilder
{
    private readonly maxCompletedIterations:
        number;

    private readonly maxChangedFilesPerIteration:
        number;

    private readonly maxGoalChars:
        number;

    private readonly maxObjectiveChars:
        number;

    private readonly maxReplanReasonChars:
        number;


    constructor(
        options:
            DeterministicPlanningContextBuilderOptions = {}
    ) {
        this.maxCompletedIterations =
            positiveInteger(
                options.maxCompletedIterations ??
                    8,
                "maxCompletedIterations"
            );

        this.maxChangedFilesPerIteration =
            positiveInteger(
                options.maxChangedFilesPerIteration ??
                    32,
                "maxChangedFilesPerIteration"
            );

        this.maxGoalChars =
            boundedTextLimit(
                options.maxGoalChars ??
                    4_000,
                "maxGoalChars"
            );

        this.maxObjectiveChars =
            boundedTextLimit(
                options.maxObjectiveChars ??
                    2_000,
                "maxObjectiveChars"
            );

        this.maxReplanReasonChars =
            boundedTextLimit(
                options.maxReplanReasonChars ??
                    2_000,
                "maxReplanReasonChars"
            );
    }


    build(
        input:
            PlanningContextBuilderInput
    ): PlanningContext {
        const completed =
            input.run
                .iterations
                .filter(
                    record =>
                        record.completed
                );


        const omittedCompletedIterations =
            Math.max(
                0,
                completed.length -
                    this.maxCompletedIterations
            );


        /*
         * Planning benefits most from recent accepted work.
         *
         * Preserve chronological order inside the selected
         * tail instead of reversing it.
         */
        const selectedCompleted =
            completed.slice(
                -this.maxCompletedIterations
            );


        let omittedChangedFiles =
            0;


        const completedIterations =
            selectedCompleted.map(
                record => {
                    const allChangedFiles =
                        record.acceptance
                            ?.changedFiles ??
                        [];


                    const changedFiles =
                        allChangedFiles
                            .slice(
                                0,
                                this.maxChangedFilesPerIteration
                            );


                    omittedChangedFiles +=
                        Math.max(
                            0,
                            allChangedFiles.length -
                                changedFiles.length
                        );


                    const latestVerification =
                        getLatestVerification(
                            record
                        );


                    return {
                        id:
                            normalizeRequiredText(
                                record.contract.id,
                                "Completed iteration id"
                            ),

                        objective:
                            boundText(
                                record.contract.objective,
                                this.maxObjectiveChars
                            ),

                        attemptsPerformed:
                            record.attempts.length,

                        changedFiles:
                            changedFiles.map(
                                path =>
                                    normalizeRequiredText(
                                        path,
                                        "Changed file path"
                                    )
                            ),

                        ...(
                            latestVerification
                                ? {
                                    latestVerification
                                }
                                : {}
                        )
                    };
                }
            );


        const replan =
            input.replan
                ? {
                    previousIterationId:
                        normalizeRequiredText(
                            input.replan
                                .previousIterationId,
                            "Replan previousIterationId"
                        ),

                    previousObjective:
                        boundText(
                            normalizeRequiredText(
                                input.replan
                                    .previousObjective,
                                "Replan previousObjective"
                            ),
                            this.maxObjectiveChars
                        ),

                    reason:
                        boundText(
                            normalizeRequiredText(
                                input.replan.reason,
                                "Replan reason"
                            ),
                            this.maxReplanReasonChars
                        )
                }
                : undefined;


        return {
            run: {
                id:
                    normalizeRequiredText(
                        input.run.id,
                        "Run id"
                    ),

                goal:
                    boundText(
                        normalizeRequiredText(
                            input.run.goal,
                            "Run goal"
                        ),
                        this.maxGoalChars
                    )
            },

            progress: {
                currentIteration:
                    input.run.currentIteration,

                maxIterations:
                    input.run.maxIterations,

                remainingIterations:
                    Math.max(
                        0,
                        input.run.maxIterations -
                            input.run.currentIteration
                    ),

                completedIterationCount:
                    completed.length
            },

            completedIterations,

            ...(
                replan
                    ? {
                        replan
                    }
                    : {}
            ),

            omitted: {
                completedIterations:
                    omittedCompletedIterations,

                changedFiles:
                    omittedChangedFiles
            }
        };
    }
}


function getLatestVerification(
    record:
        IterationRecord
): PlanningContextVerification | undefined {
    let verification:
        VerificationReport |
        undefined;


    for (
        let index =
            record.attempts.length -
                1;
        index >=
            0;
        index -=
            1
    ) {
        const candidate =
            record.attempts[index]
                ?.verification;


        if (candidate) {
            verification =
                candidate;

            break;
        }
    }


    if (!verification) {
        return undefined;
    }


    return {
        passed:
            verification.passed,

        failedCheckIds:
            uniqueStrings(
                verification
                    .checks
                    .filter(
                        check =>
                            !check.passed
                    )
                    .map(
                        check =>
                            normalizeRequiredText(
                                check.id,
                                "Verification check id"
                            )
                    )
            )
    };
}


function uniqueStrings(
    values:
        readonly string[]
): readonly string[] {
    const result:
        string[] = [];

    const seen =
        new Set<string>();


    for (
        const value of
        values
    ) {
        if (
            seen.has(
                value
            )
        ) {
            continue;
        }


        seen.add(
            value
        );

        result.push(
            value
        );
    }


    return result;
}


function normalizeRequiredText(
    value:
        string,

    label:
        string
): string {
    const normalized =
        normalizeText(
            value
        );


    if (
        normalized.length ===
        0
    ) {
        throw new Error(
            `${label} must not be empty`
        );
    }


    return normalized;
}


function normalizeText(
    value:
        string
): string {
    return value
        .replace(
            /\u001B\[[0-?]*[ -/]*[@-~]/g,
            ""
        )
        .replace(
            /\r\n?/g,
            "\n"
        )
        .trim();
}


function boundText(
    value:
        string,

    limit:
        number
): string {
    const normalized =
        normalizeText(
            value
        );


    if (
        normalized.length <=
        limit
    ) {
        return normalized;
    }


    const marker =
        "\n...[truncated]...\n";


    const available =
        limit -
        marker.length;


    const headLength =
        Math.ceil(
            available /
                2
        );


    const tailLength =
        Math.floor(
            available /
                2
        );


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


function positiveInteger(
    value:
        number,

    label:
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
            `${label} must be a positive integer`
        );
    }


    return value;
}


function boundedTextLimit(
    value:
        number,

    label:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <
            128
    ) {
        throw new Error(
            `${label} must be an integer greater than or equal to 128`
        );
    }


    return value;
}