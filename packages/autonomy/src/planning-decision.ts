import type {
    EscalationPolicy,
    IterationChange,
    IterationContract,
    IterationScope,
    VerificationStep
} from "./contracts.js";

import type {
    PlanningDecision
} from "./providers.js";


/**
 * Validate an untrusted planning decision before it is allowed
 * to drive autonomous execution.
 *
 * The planner may propose work, but it does not get to bypass
 * structural safety requirements such as:
 *
 * - explicit writable scope
 * - concrete changes
 * - deterministic acceptance criteria
 * - at least one required verification check
 * - bounded retry / escalation budgets
 */
export function validatePlanningDecision(
    value:
        unknown
): PlanningDecision {
    const record =
        expectRecord(
            value,
            "Planning decision must be an object"
        );


    const type =
        expectDecisionType(
            record.type
        );


    switch (
        type
    ) {
        case "iteration": {
            assertOnlyKeys(
                record,
                [
                    "type",
                    "contract"
                ],
                "iteration planning decision"
            );


            return {
                type,

                contract:
                    validateIterationContract(
                        record.contract
                    )
            };
        }


        case "complete": {
            assertOnlyKeys(
                record,
                [
                    "type",
                    "reason"
                ],
                "complete planning decision"
            );


            return {
                type,

                reason:
                    expectNonEmptyString(
                        record.reason,
                        "Planning completion reason"
                    )
            };
        }


        case "blocked": {
            assertOnlyKeys(
                record,
                [
                    "type",
                    "reason"
                ],
                "blocked planning decision"
            );


            return {
                type,

                reason:
                    expectNonEmptyString(
                        record.reason,
                        "Planning blocked reason"
                    )
            };
        }
    }
}


export function validateIterationContract(
    value:
        unknown
): IterationContract {
    const record =
        expectRecord(
            value,
            "Iteration contract must be an object"
        );


    assertOnlyKeys(
        record,
        [
            "id",
            "objective",
            "rationale",
            "scope",
            "contextScope",
            "changes",
            "acceptanceCriteria",
            "verification",
            "architecturalConstraints",
            "maxLocalAttempts",
            "escalation"
        ],
        "iteration contract"
    );


    const scope =
        validateScope(
            record.scope,
            "Iteration contract scope"
        );


    const contextScope =
        record.contextScope ===
            undefined
            ? undefined
            : validateScope(
                record.contextScope,
                "Iteration contract contextScope"
            );


    const changes =
        validateChanges(
            record.changes
        );


    const acceptanceCriteria =
        expectNonEmptyStringArray(
            record.acceptanceCriteria,
            "Iteration contract acceptanceCriteria"
        );


    const verification =
        validateVerification(
            record.verification
        );


    const architecturalConstraints =
        expectStringArray(
            record.architecturalConstraints,
            "Iteration contract architecturalConstraints"
        );


    const maxLocalAttempts =
        expectPositiveInteger(
            record.maxLocalAttempts,
            "Iteration contract maxLocalAttempts"
        );


    const escalation =
        validateEscalationPolicy(
            record.escalation
        );


    return {
        id:
            expectNonEmptyString(
                record.id,
                "Iteration contract id"
            ),

        objective:
            expectNonEmptyString(
                record.objective,
                "Iteration contract objective"
            ),

        rationale:
            expectNonEmptyString(
                record.rationale,
                "Iteration contract rationale"
            ),

        scope,

        ...(
            contextScope
                ? {
                    contextScope
                }
                : {}
        ),

        changes,

        acceptanceCriteria,

        verification,

        architecturalConstraints,

        maxLocalAttempts,

        escalation
    };
}


function validateScope(
    value:
        unknown,

    label:
        string
): IterationScope {
    const record =
        expectRecord(
            value,
            `${label} must be an object`
        );


    assertOnlyKeys(
        record,
        [
            "allowedPaths",
            "forbiddenPaths"
        ],
        label
    );


    const allowedPaths =
        expectNonEmptyStringArray(
            record.allowedPaths,
            `${label} allowedPaths`
        );


    const forbiddenPaths =
        expectStringArray(
            record.forbiddenPaths,
            `${label} forbiddenPaths`
        );


    assertUniqueStrings(
        allowedPaths,
        `${label} allowedPaths`
    );


    assertUniqueStrings(
        forbiddenPaths,
        `${label} forbiddenPaths`
    );


    return {
        allowedPaths,
        forbiddenPaths
    };
}


function validateChanges(
    value:
        unknown
): readonly IterationChange[] {
    if (
        !Array.isArray(
            value
        )
    ) {
        throw new Error(
            "Iteration contract changes must be an array"
        );
    }


    if (
        value.length ===
        0
    ) {
        throw new Error(
            "Iteration contract changes must not be empty"
        );
    }


    return value.map(
        (
            item,
            index
        ) => {
            const record =
                expectRecord(
                    item,
                    `Iteration contract changes[${index}] must be an object`
                );


            assertOnlyKeys(
                record,
                [
                    "description",
                    "filesHint"
                ],
                `Iteration contract changes[${index}]`
            );


            const description =
                expectNonEmptyString(
                    record.description,
                    `Iteration contract changes[${index}] description`
                );


            if (
                record.filesHint ===
                undefined
            ) {
                return {
                    description
                };
            }


            const filesHint =
                expectStringArray(
                    record.filesHint,
                    `Iteration contract changes[${index}] filesHint`
                );


            assertUniqueStrings(
                filesHint,
                `Iteration contract changes[${index}] filesHint`
            );


            return {
                description,
                filesHint
            };
        }
    );
}


function validateVerification(
    value:
        unknown
): readonly VerificationStep[] {
    if (
        !Array.isArray(
            value
        )
    ) {
        throw new Error(
            "Iteration contract verification must be an array"
        );
    }


    if (
        value.length ===
        0
    ) {
        throw new Error(
            "Iteration contract verification must not be empty"
        );
    }


    const steps =
        value.map(
            (
                item,
                index
            ) => {
                const record =
                    expectRecord(
                        item,
                        `Iteration contract verification[${index}] must be an object`
                    );


                assertOnlyKeys(
                    record,
                    [
                        "id",
                        "command",
                        "required"
                    ],
                    `Iteration contract verification[${index}]`
                );


                return {
                    id:
                        expectNonEmptyString(
                            record.id,
                            `Iteration contract verification[${index}] id`
                        ),

                    command:
                        expectNonEmptyString(
                            record.command,
                            `Iteration contract verification[${index}] command`
                        ),

                    required:
                        expectBoolean(
                            record.required,
                            `Iteration contract verification[${index}] required`
                        )
                };
            }
        );


    assertUniqueStrings(
        steps.map(
            step =>
                step.id
        ),
        "Iteration contract verification ids"
    );


    if (
        !steps.some(
            step =>
                step.required
        )
    ) {
        throw new Error(
            "Iteration contract verification must contain at least one required check"
        );
    }


    return steps;
}


function validateEscalationPolicy(
    value:
        unknown
): EscalationPolicy {
    const record =
        expectRecord(
            value,
            "Iteration contract escalation must be an object"
        );


    assertOnlyKeys(
        record,
        [
            "onRepeatedFailure",
            "onArchitectureConflict",
            "maxRepairRounds"
        ],
        "Iteration contract escalation"
    );


    return {
        onRepeatedFailure:
            expectBoolean(
                record.onRepeatedFailure,
                "Iteration contract escalation onRepeatedFailure"
            ),

        onArchitectureConflict:
            expectBoolean(
                record.onArchitectureConflict,
                "Iteration contract escalation onArchitectureConflict"
            ),

        maxRepairRounds:
            expectNonNegativeInteger(
                record.maxRepairRounds,
                "Iteration contract escalation maxRepairRounds"
            )
    };
}


function expectDecisionType(
    value:
        unknown
):
    PlanningDecision["type"]
{
    if (
        value ===
            "iteration" ||
        value ===
            "complete" ||
        value ===
            "blocked"
    ) {
        return value;
    }


    throw new Error(
        "Planning decision type is invalid"
    );
}


function expectRecord(
    value:
        unknown,

    message:
        string
): Record<string, unknown> {
    if (
        typeof value !==
            "object" ||
        value ===
            null ||
        Array.isArray(
            value
        )
    ) {
        throw new Error(
            message
        );
    }


    return value as
        Record<string, unknown>;
}


function expectNonEmptyString(
    value:
        unknown,

    label:
        string
): string {
    if (
        typeof value !==
            "string" ||
        value.trim().length ===
            0
    ) {
        throw new Error(
            `${label} must be a non-empty string`
        );
    }


    return value.trim();
}


function expectStringArray(
    value:
        unknown,

    label:
        string
): readonly string[] {
    if (
        !Array.isArray(
            value
        )
    ) {
        throw new Error(
            `${label} must be an array`
        );
    }


    return value.map(
        (
            item,
            index
        ) =>
            expectNonEmptyString(
                item,
                `${label}[${index}]`
            )
    );
}


function expectNonEmptyStringArray(
    value:
        unknown,

    label:
        string
): readonly string[] {
    const result =
        expectStringArray(
            value,
            label
        );


    if (
        result.length ===
        0
    ) {
        throw new Error(
            `${label} must not be empty`
        );
    }


    return result;
}


function expectBoolean(
    value:
        unknown,

    label:
        string
): boolean {
    if (
        typeof value !==
        "boolean"
    ) {
        throw new Error(
            `${label} must be a boolean`
        );
    }


    return value;
}


function expectPositiveInteger(
    value:
        unknown,

    label:
        string
): number {
    if (
        typeof value !==
            "number" ||
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


function expectNonNegativeInteger(
    value:
        unknown,

    label:
        string
): number {
    if (
        typeof value !==
            "number" ||
        !Number.isInteger(
            value
        ) ||
        value <
            0
    ) {
        throw new Error(
            `${label} must be a non-negative integer`
        );
    }


    return value;
}


function assertUniqueStrings(
    values:
        readonly string[],

    label:
        string
): void {
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
            throw new Error(
                `${label} must not contain duplicates: ${value}`
            );
        }


        seen.add(
            value
        );
    }
}


function assertOnlyKeys(
    record:
        Record<string, unknown>,

    allowed:
        readonly string[],

    label:
        string
): void {
    const allowedKeys =
        new Set(
            allowed
        );


    const unexpected =
        Object.keys(
            record
        ).filter(
            key =>
                !allowedKeys.has(
                    key
                )
        );


    if (
        unexpected.length >
        0
    ) {
        throw new Error(
            [
                `${label} contains unexpected fields:`,
                unexpected.join(
                    ", "
                )
            ].join(
                " "
            )
        );
    }
}