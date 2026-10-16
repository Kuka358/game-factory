export type RepairPlanStrategy =
    | "repair"
    | "replan"
    | "architecture_required"
    | "abort";


interface RepairPlanBase {
    /**
     * Human-readable explanation of why the current iteration
     * did not satisfy deterministic verification.
     */
    diagnosis:
        string;

    /**
     * Verification check ids that this plan is responding to.
     *
     * Detailed stdout/stderr remains in VerificationReport.
     */
    failedChecks:
        readonly string[];
}


export interface RepairExecutionPlan
    extends RepairPlanBase
{
    strategy:
        "repair";

    /**
     * Concrete instructions for the coding worker.
     */
    instructions:
        readonly string[];

    /**
     * Files that should receive priority when rebuilding
     * repository context for the repair attempt.
     *
     * These are context hints only and never widen write scope.
     */
    filesHint:
        readonly string[];

    /**
     * Behaviour, APIs, architecture or surrounding code that
     * the repair must preserve.
     */
    preserve:
        readonly string[];
}


export interface RepairReplanPlan
    extends RepairPlanBase
{
    strategy:
        "replan";

    reason:
        string;
}


export interface RepairArchitecturePlan
    extends RepairPlanBase
{
    strategy:
        "architecture_required";

    question:
        string;
}


export interface RepairAbortPlan
    extends RepairPlanBase
{
    strategy:
        "abort";

    reason:
        string;
}


export type RepairPlan =
    | RepairExecutionPlan
    | RepairReplanPlan
    | RepairArchitecturePlan
    | RepairAbortPlan;


/**
 * Validate an untrusted structured repair-plan payload.
 *
 * Future LLM-backed RepairAdvisor implementations must pass their
 * structured output through this boundary before the plan reaches
 * the autonomy engine.
 */
export function validateRepairPlan(
    value:
        unknown
): RepairPlan {
    const record =
        expectRecord(
            value,
            "Repair plan must be an object"
        );


    const strategy =
        expectStrategy(
            record.strategy
        );


    const diagnosis =
        expectNonEmptyString(
            record.diagnosis,
            "Repair plan diagnosis"
        );


    const failedChecks =
        expectNonEmptyStringArray(
            record.failedChecks,
            "Repair plan failedChecks"
        );


    switch (strategy) {
        case "repair": {
            assertOnlyKeys(
                record,
                [
                    "strategy",
                    "diagnosis",
                    "failedChecks",
                    "instructions",
                    "filesHint",
                    "preserve"
                ],
                strategy
            );


            return {
                strategy,

                diagnosis,

                failedChecks,

                instructions:
                    expectNonEmptyStringArray(
                        record.instructions,
                        "Repair plan instructions"
                    ),

                filesHint:
                    expectStringArray(
                        record.filesHint,
                        "Repair plan filesHint"
                    ),

                preserve:
                    expectStringArray(
                        record.preserve,
                        "Repair plan preserve"
                    )
            };
        }


        case "replan": {
            assertOnlyKeys(
                record,
                [
                    "strategy",
                    "diagnosis",
                    "failedChecks",
                    "reason"
                ],
                strategy
            );


            return {
                strategy,

                diagnosis,

                failedChecks,

                reason:
                    expectNonEmptyString(
                        record.reason,
                        "Repair replan reason"
                    )
            };
        }


        case "architecture_required": {
            assertOnlyKeys(
                record,
                [
                    "strategy",
                    "diagnosis",
                    "failedChecks",
                    "question"
                ],
                strategy
            );


            return {
                strategy,

                diagnosis,

                failedChecks,

                question:
                    expectNonEmptyString(
                        record.question,
                        "Repair architecture question"
                    )
            };
        }


        case "abort": {
            assertOnlyKeys(
                record,
                [
                    "strategy",
                    "diagnosis",
                    "failedChecks",
                    "reason"
                ],
                strategy
            );


            return {
                strategy,

                diagnosis,

                failedChecks,

                reason:
                    expectNonEmptyString(
                        record.reason,
                        "Repair abort reason"
                    )
            };
        }
    }
}


function expectStrategy(
    value:
        unknown
): RepairPlanStrategy {
    if (
        value ===
            "repair" ||
        value ===
            "replan" ||
        value ===
            "architecture_required" ||
        value ===
            "abort"
    ) {
        return value;
    }


    throw new Error(
        "Repair plan strategy is invalid"
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


function assertOnlyKeys(
    record:
        Record<string, unknown>,

    allowed:
        readonly string[],

    strategy:
        RepairPlanStrategy
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
                `Repair plan contains unexpected fields for ${strategy}:`,
                unexpected.join(
                    ", "
                )
            ].join(
                " "
            )
        );
    }
}