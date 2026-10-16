import {
    describe,
    expect,
    it
} from "vitest";

import {
    assertRepairPlanMatchesContext
} from "../src/repair-advisor.js";

import type {
    RepairContext
} from "../src/repair-context.js";

import type {
    RepairPlan
} from "../src/repair-plan.js";


function createContext():
    RepairContext
{
    return {
        run: {
            id:
                "run",

            goal:
                "Repair"
        },

        iteration: {
            id:
                "iteration",

            objective:
                "Repair failure",

            rationale:
                "Keep behaviour",

            allowedPaths:
                [],

            forbiddenPaths:
                [],

            changes:
                [],

            acceptanceCriteria:
                [],

            architecturalConstraints:
                []
        },

        attemptsPerformed:
            2,

        latestWorker: {
            summary:
                "Attempt",

            changedFiles:
                []
        },

        failedChecks: [
            {
                id:
                    "typecheck",

                command:
                    "pnpm typecheck",

                exitCode:
                    2
            },

            {
                id:
                    "runtime",

                command:
                    "node verify.mjs",

                exitCode:
                    1
            }
        ],

        attemptHistory:
            [],

        omitted: {
            failedChecks:
                0,

            changedFiles:
                0,

            attemptHistory:
                0,

            allowedPaths:
                0,

            forbiddenPaths:
                0
        }
    };
}


function createPlan(
    failedChecks:
        readonly string[]
): RepairPlan {
    return {
        strategy:
            "repair",

        diagnosis:
            "Both deterministic checks failed",

        failedChecks,

        instructions: [
            "Repair both failures"
        ],

        filesHint:
            [],

        preserve:
            []
    };
}


describe(
    "assertRepairPlanMatchesContext",
    () => {
        it(
            "accepts the exact deterministic failed-check set",
            () => {
                expect(
                    () =>
                        assertRepairPlanMatchesContext(
                            createPlan([
                                "typecheck",
                                "runtime"
                            ]),

                            createContext()
                        )
                ).not.toThrow();
            }
        );


        it(
            "does not require advisor failed-check ordering to match verifier ordering",
            () => {
                expect(
                    () =>
                        assertRepairPlanMatchesContext(
                            createPlan([
                                "runtime",
                                "typecheck"
                            ]),

                            createContext()
                        )
                ).not.toThrow();
            }
        );


        it(
            "rejects an invented failed check",
            () => {
                expect(
                    () =>
                        assertRepairPlanMatchesContext(
                            createPlan([
                                "typecheck",
                                "lint"
                            ]),

                            createContext()
                        )
                ).toThrow(
                    "must exactly match deterministic failed checks"
                );
            }
        );


        it(
            "rejects an omitted deterministic failed check",
            () => {
                expect(
                    () =>
                        assertRepairPlanMatchesContext(
                            createPlan([
                                "typecheck"
                            ]),

                            createContext()
                        )
                ).toThrow(
                    "must exactly match deterministic failed checks"
                );
            }
        );
    }
);