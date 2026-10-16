import type {
    RepairContext
} from "./repair-context.js";

import type {
    RepairPlan
} from "./repair-plan.js";


/**
 * RepairAdvisor may diagnose and propose a strategy, but it may
 * not rewrite deterministic verifier facts.
 *
 * The failed-check set in RepairPlan must exactly match the failed
 * checks exposed by the bounded RepairContext.
 */
export function assertRepairPlanMatchesContext(
    plan:
        RepairPlan,

    context:
        RepairContext
): void {
    const expected =
        uniqueSorted(
            context.failedChecks
                .map(
                    check =>
                        check.id
                )
        );


    const received =
        uniqueSorted(
            plan.failedChecks
        );


    if (
        expected.length !==
        received.length ||
        expected.some(
            (
                value,
                index
            ) =>
                value !==
                received[index]
        )
    ) {
        throw new Error(
            [
                "Repair plan failedChecks must exactly match deterministic failed checks.",
                `Expected: ${formatList(
                    expected
                )}.`,
                `Received: ${formatList(
                    received
                )}.`
            ].join(
                " "
            )
        );
    }
}


function uniqueSorted(
    values:
        readonly string[]
): readonly string[] {
    return [
        ...new Set(
            values
        )
    ].sort();
}


function formatList(
    values:
        readonly string[]
): string {
    return values.length >
        0
        ? values.join(
            ", "
        )
        : "<none>";
}