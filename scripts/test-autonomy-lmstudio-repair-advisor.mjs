import {
    LMStudioProvider
} from "../packages/ai/dist/index.js";

import {
    AIRepairAdvisor,
    assertRepairPlanMatchesContext
} from "../packages/autonomy/dist/index.js";


const baseUrl =
    process.env.LM_STUDIO_BASE_URL ??
    "http://127.0.0.1:1234/v1/";


const model =
    process.env.LM_STUDIO_REPAIR_MODEL ??
    process.env.LM_STUDIO_MODEL;


if (!model) {
    throw new Error(
        "LM_STUDIO_REPAIR_MODEL or LM_STUDIO_MODEL is required"
    );
}


const timeoutMs =
    Number(
        process.env
            .LM_STUDIO_REPAIR_TIMEOUT_MS ??
        process.env
            .LM_STUDIO_TIMEOUT_MS ??
        "180000"
    );


if (
    !Number.isFinite(
        timeoutMs
    ) ||
    timeoutMs <=
        0
) {
    throw new Error(
        "LM Studio timeout must be a positive number"
    );
}


const provider =
    new LMStudioProvider({
        baseUrl,
        timeoutMs
    });


const advisor =
    new AIRepairAdvisor({
        provider,

        model,

        temperature:
            0.1,

        maxTokens:
            2_048
    });


const context = {
    run: {
        id:
            "live-repair-advisor-smoke",

        goal:
            "Restore correct clamp behaviour"
    },

    iteration: {
        id:
            "repair-clamp-runtime",

        objective:
            "Repair clamp() without changing its public API",

        rationale:
            "Deterministic runtime verification found a behavioural regression",

        allowedPaths: [
            "src/math.ts"
        ],

        forbiddenPaths: [
            ".env",
            "package.json"
        ],

        changes: [
            {
                description:
                    "Repair the clamp implementation",

                filesHint: [
                    "src/math.ts"
                ]
            }
        ],

        acceptanceCriteria: [
            "clamp(5, 0, 10) returns 5",
            "clamp(-2, 0, 10) returns 0",
            "clamp(42, 0, 10) returns 10"
        ],

        architecturalConstraints: [
            "Keep the public clamp(value, min, max) API unchanged",
            "Do not add dependencies",
            "Do not modify files outside src/math.ts"
        ]
    },

    attemptsPerformed:
        2,

    latestWorker: {
        summary:
            "Refactored clamp but accidentally stopped applying the upper bound",

        changedFiles: [
            "src/math.ts"
        ]
    },

    failedChecks: [
        {
            id:
                "runtime",

            command:
                "node verify-runtime.mjs",

            exitCode:
                1,

            stderr:
                [
                    "Error: clamp runtime verification failed",
                    "clamp(42, 0, 10) changed: expected 10, received 42"
                ].join(
                    "\n"
                )
        }
    ],

    attemptHistory: [
        {
            attempt:
                1,

            verificationPassed:
                false,

            failedCheckIds: [
                "runtime"
            ]
        },

        {
            attempt:
                2,

            verificationPassed:
                false,

            failedCheckIds: [
                "runtime"
            ]
        }
    ],

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


console.log(
    "Running LIVE LM Studio RepairAdvisor smoke test..."
);

console.log(
    `Provider URL: ${baseUrl}`
);

console.log(
    `Model: ${model}`
);


const startedAt =
    Date.now();


const plan =
    await advisor.advise(
        context
    );


const durationMs =
    Date.now() -
    startedAt;


/*
 * AIRepairAdvisor validates the structured shape.
 *
 * This second guard proves the model did not rewrite
 * deterministic verifier facts.
 */
assertRepairPlanMatchesContext(
    plan,
    context
);


console.log(
    "\nRepair plan:"
);

console.log(
    JSON.stringify(
        plan,
        null,
        2
    )
);

console.log(
    `\nAdvisor duration: ${durationMs} ms`
);


if (
    plan.strategy !==
    "repair"
) {
    throw new Error(
        [
            "Live advisor did not recognize the fixture as locally repairable.",
            `Received strategy: ${plan.strategy}`
        ].join(
            " "
        )
    );
}


if (
    plan.instructions.length ===
    0
) {
    throw new Error(
        "Live advisor returned repair without instructions"
    );
}


if (
    !plan.failedChecks.includes(
        "runtime"
    )
) {
    throw new Error(
        "Live advisor omitted the deterministic runtime failure"
    );
}


console.log(
    "\nPASS provider returned structured RepairPlan"
);

console.log(
    "PASS RepairPlan passed runtime validation"
);

console.log(
    "PASS deterministic failed-check facts were preserved"
);

console.log(
    "PASS advisor selected bounded repair for a clearly repairable regression"
);

console.log(
    "\nLIVE LM STUDIO REPAIR ADVISOR SMOKE PASSED"
);