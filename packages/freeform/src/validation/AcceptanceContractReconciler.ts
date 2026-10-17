
import { createHash } from "node:crypto";
import { Ajv } from "ajv";

import type {
    FreeformBlueprint
} from "../contracts/FreeformBlueprint.js";

import type {
    TaskGraph
} from "../contracts/TaskGraph.js";

import type {
    AcceptanceTestPlan
} from "../contracts/AcceptanceTestPlan.js";

import type {
    AcceptanceContractCandidate,
    ReconciledAcceptanceContract,
    TaskRuntimeProfile
} from "../contracts/AcceptanceContract.js";

import {
    DEFAULT_FREEFORM_RUNTIME_POLICY
} from "../contracts/FreeformRuntimePolicy.js";

import type {
    AcceptanceClarification,
    AcceptanceReferenceFile
} from "../cloud/CloudAcceptanceClarifier.js";

import {
    assertClarificationReady,
    validateAcceptanceClarification
} from "../cloud/CloudAcceptanceClarifier.js";

import {
    validateFreeformBlueprint
} from "./FreeformBlueprintValidator.js";

import {
    validateTaskGraph
} from "./TaskGraphValidator.js";

import {
    createTaskGraphDigest,
    validateAcceptanceTestPlan
} from "./AcceptanceTestPlanValidator.js";

export interface ReconcileAcceptanceContractInput {
    blueprint: FreeformBlueprint;
    graph: TaskGraph;
    draftPlan: AcceptanceTestPlan;
    clarification: AcceptanceClarification;
    referenceFiles: readonly AcceptanceReferenceFile[];

    // Must come from trusted planning metadata,
    // not from the candidate AI response.
    expectedProfile: TaskRuntimeProfile;

    candidate: unknown;
}

const candidateSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "schemaVersion",
        "blueprintId",
        "taskId",
        "graphDigest",
        "referenceDigest",
        "profile",
        "timeModel",
        "rules"
    ],
    properties: {
        schemaVersion: {
            type: "string",
            const: "1.0"
        },
        blueprintId: {
            type: "string",
            minLength: 1
        },
        taskId: {
            type: "string",
            minLength: 1
        },
        graphDigest: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
        },
        referenceDigest: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
        },
        profile: {
            type: "string",
            enum: ["continuous_motion", "other"]
        },
        timeModel: {
            type: "string",
            enum: [
                "delta_ms",
                "engine_managed",
                "fixed_timestep",
                "not_applicable"
            ]
        },
        rules: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "question",
                    "classification",
                    "rule"
                ],
                properties: {
                    question: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048
                    },
                    classification: {
                        type: "string",
                        enum: [
                            "binding",
                            "non_blocking"
                        ]
                    },
                    rule: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048
                    }
                }
            }
        }
    }
};

const ajv = new Ajv({ allErrors: true });

const validateCandidate =
    ajv.compile<AcceptanceContractCandidate>(
        candidateSchema
    );

function hash(value: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(value), "utf8")
        .digest("hex");
}

export const acceptanceContractCandidateSchema =
    candidateSchema;

export function reconcileAcceptanceContract(
    input: ReconcileAcceptanceContractInput
): ReconciledAcceptanceContract {
    const blueprintResult =
        validateFreeformBlueprint(input.blueprint);

    if (!blueprintResult.valid) {
        throw new Error("Invalid Blueprint");
    }

    const graphResult = validateTaskGraph(
        input.graph,
        blueprintResult.data.id
    );

    if (!graphResult.valid) {
        throw new Error("Invalid TaskGraph");
    }

    const graph = graphResult.data;

    const planResult = validateAcceptanceTestPlan(
        input.draftPlan,
        graph,
        blueprintResult.data.id
    );

    if (!planResult.valid) {
        throw new Error("Invalid AcceptanceTestPlan");
    }

    const plan = planResult.data;

    const task = graph.tasks.find(
        item => item.id === plan.taskId
    );

    if (!task) {
        throw new Error("Unknown task");
    }

    const allowedReferences = new Set(
        task.readPaths.filter(
            path => !task.allowedPaths.includes(path)
        )
    );

    const seenReferences = new Set<string>();

    for (const file of input.referenceFiles) {
        if (
            !allowedReferences.has(file.path) ||
            seenReferences.has(file.path) ||
            file.content.length > 16_000
        ) {
            throw new Error(
                `Invalid reference file: ${file.path}`
            );
        }

        seenReferences.add(file.path);
    }

    const referenceDigest = hash(input.referenceFiles);

    const clarificationErrors =
        validateAcceptanceClarification(
            input.clarification,
            plan,
            referenceDigest
        );

    if (clarificationErrors.length > 0) {
        throw new Error(
            "Invalid clarification: " +
            clarificationErrors.join("; ")
        );
    }

    assertClarificationReady(input.clarification);

    if (!validateCandidate(input.candidate)) {
        throw new Error(
            "Invalid normalized acceptance contract: " +
            JSON.stringify(validateCandidate.errors)
        );
    }

    const candidate = input.candidate;

    if (
        candidate.blueprintId !== blueprintResult.data.id ||
        candidate.taskId !== plan.taskId ||
        candidate.graphDigest !== createTaskGraphDigest(graph) ||
        candidate.referenceDigest !== referenceDigest
    ) {
        throw new Error(
            "Normalized acceptance contract identity mismatch"
        );
    }

    if (candidate.profile !== input.expectedProfile) {
        throw new Error(
            "Runtime profile differs from trusted task profile"
        );
    }

    const policy = DEFAULT_FREEFORM_RUNTIME_POLICY;

    if (candidate.profile === "continuous_motion") {
        if (
            !policy.continuousMotion.allowedTimeModels.includes(
                candidate.timeModel as
                    "delta_ms" |
                    "engine_managed" |
                    "fixed_timestep"
            )
        ) {
            throw new Error(
                "Continuous motion violates Runtime Policy"
            );
        }
    } else if (candidate.timeModel !== "not_applicable") {
        throw new Error(
            "Non-motion task must use not_applicable time model"
        );
    }

    const originalAnswers = new Map(
        input.clarification.answers.map(answer => [
            answer.question,
            answer
        ])
    );

    const covered = new Set<string>();

    for (const rule of candidate.rules) {
        const original = originalAnswers.get(
            rule.question
        );

        if (!original) {
            throw new Error(
                `Unknown normalized rule: ${rule.question}`
            );
        }

        if (covered.has(rule.question)) {
            throw new Error(
                `Duplicate normalized rule: ${rule.question}`
            );
        }

        covered.add(rule.question);

        if (
            original.classification !==
            rule.classification
        ) {
            throw new Error(
                `Changed clarification classification: ${rule.question}`
            );
        }
    }

    for (const question of originalAnswers.keys()) {
        if (!covered.has(question)) {
            throw new Error(
                `Missing normalized rule: ${question}`
            );
        }
    }

    return {
        schemaVersion: "1.0",
        blueprintId: candidate.blueprintId,
        taskId: candidate.taskId,
        graphDigest: candidate.graphDigest,
        referenceDigest: candidate.referenceDigest,
        profile: candidate.profile,
        timeModel: candidate.timeModel,
        rules: candidate.rules.map(rule => ({ ...rule })),

        graphRevision: graph.revision,

        clarificationDigest: hash(
            input.clarification
        ),

        runtimePolicyDigest: hash(policy)
    };
}
