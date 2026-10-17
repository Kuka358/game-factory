
import { createHash } from "node:crypto";
import { Ajv } from "ajv";

import type {
    ImplementationTask
} from "../contracts/TaskGraph.js";

import type {
    ReconciledAcceptanceContract
} from "../contracts/AcceptanceContract.js";

import type {
    HorizontalControllerBehaviorSpec
} from "../contracts/ExecutableBehaviorSpec.js";

import {
    DEFAULT_FREEFORM_RUNTIME_POLICY
} from "../contracts/FreeformRuntimePolicy.js";

export interface ExecutableBehaviorValidationError {
    path: string;
    message: string;
}

export type ExecutableBehaviorValidationResult =
    | {
        valid: true;
        data: HorizontalControllerBehaviorSpec;
    }
    | {
        valid: false;
        errors: ExecutableBehaviorValidationError[];
    };

const identifier = {
    type: "string",
    pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$"
};

export const executableBehaviorSpecSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "schemaVersion",
        "kind",
        "contractDigest",
        "sourcePath",
        "className",
        "update",
        "controls",
        "coordinates",
        "speed"
    ],
    properties: {
        schemaVersion: {
            type: "string",
            const: "1.0"
        },
        kind: {
            type: "string",
            const: "horizontal_boolean_controller"
        },
        contractDigest: {
            type: "string",
            pattern: "^[a-f0-9]{64}$"
        },
        sourcePath: {
            type: "string",
            minLength: 1,
            maxLength: 200
        },
        className: identifier,

        update: {
            type: "object",
            additionalProperties: false,
            required: [
                "method",
                "deltaArgumentIndex",
                "deltaUnit"
            ],
            properties: {
                method: {
                    type: "string",
                    const: "update"
                },
                deltaArgumentIndex: {
                    type: "integer",
                    const: 1
                },
                deltaUnit: {
                    type: "string",
                    const: "milliseconds"
                }
            }
        },

        controls: {
            type: "object",
            additionalProperties: false,
            required: [
                "negative",
                "positive",
                "simultaneous",
                "released"
            ],
            properties: {
                negative: identifier,
                positive: identifier,
                simultaneous: {
                    type: "string",
                    const: "cancel"
                },
                released: {
                    type: "string",
                    const: "stop"
                }
            }
        },

        coordinates: {
            type: "object",
            additionalProperties: false,
            required: [
                "xOrigin",
                "yOrigin",
                "initialX",
                "yBehavior",
                "horizontalBounds"
            ],
            properties: {
                xOrigin: {
                    type: "string",
                    const: "center"
                },
                yOrigin: {
                    type: "string",
                    const: "center"
                },
                initialX: {
                    type: "string",
                    const: "viewport_center"
                },
                yBehavior: {
                    type: "string",
                    const: "fixed"
                },
                horizontalBounds: {
                    type: "string",
                    const: "half_width_clamp"
                }
            }
        },

        speed: {
            type: "object",
            additionalProperties: false,
            required: [
                "sourcePath",
                "exportName",
                "property",
                "unit"
            ],
            properties: {
                sourcePath: {
                    type: "string",
                    minLength: 1,
                    maxLength: 200
                },
                exportName: identifier,
                property: identifier,
                unit: {
                    type: "string",
                    enum: [
                        "pixels_per_second",
                        "pixels_per_nominal_frame"
                    ]
                },
                referenceFps: {
                    type: "number",
                    minimum: 1,
                    maximum: 240
                }
            }
        }
    }
};

const ajv = new Ajv({ allErrors: true });

const checkSchema =
    ajv.compile<HorizontalControllerBehaviorSpec>(
        executableBehaviorSpecSchema
    );

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") {
        const result = JSON.stringify(value);

        if (result === undefined) {
            throw new Error("Non-JSON contract value");
        }

        return result;
    }

    if (Array.isArray(value)) {
        return "[" +
            value.map(canonicalJson).join(",") +
            "]";
    }

    const record = value as Record<string, unknown>;

    const fields = Object.keys(record)
        .sort()
        .map(key =>
            JSON.stringify(key) +
            ":" +
            canonicalJson(record[key])
        );

    return "{" + fields.join(",") + "}";
}

export function createAcceptanceContractDigest(
    contract: ReconciledAcceptanceContract
): string {
    return createHash("sha256")
        .update(canonicalJson(contract), "utf8")
        .digest("hex");
}

export function validateExecutableBehaviorSpec(
    value: unknown,
    task: ImplementationTask,
    contract: ReconciledAcceptanceContract
): ExecutableBehaviorValidationResult {
    if (!checkSchema(value)) {
        return {
            valid: false,
            errors: (checkSchema.errors ?? []).map(error => ({
                path: error.instancePath || "/",
                message: error.message ?? "Invalid behavior spec"
            }))
        };
    }

    const spec = value;
    const errors: ExecutableBehaviorValidationError[] = [];

    function reject(
        path: string,
        message: string
    ): void {
        errors.push({ path, message });
    }

    if (
        task.id !== contract.taskId ||
        contract.profile !== "continuous_motion" ||
        contract.timeModel !== "delta_ms"
    ) {
        reject(
            "/",
            "Unsupported task or normalized time model"
        );
    }

    const policyDigest = createHash("sha256")
        .update(
            JSON.stringify(DEFAULT_FREEFORM_RUNTIME_POLICY),
            "utf8"
        )
        .digest("hex");

    if (
        contract.runtimePolicyDigest !== policyDigest
    ) {
        reject(
            "/contractDigest",
            "Runtime Policy version mismatch"
        );
    }

    if (
        spec.contractDigest !==
        createAcceptanceContractDigest(contract)
    ) {
        reject(
            "/contractDigest",
            "Normalized contract digest mismatch"
        );
    }

    if (
        !task.allowedPaths.includes(spec.sourcePath) ||
        !spec.sourcePath.endsWith(".ts")
    ) {
        reject(
            "/sourcePath",
            "Behavior target is outside task write scope"
        );
    }

    if (
        !task.readPaths.includes(spec.speed.sourcePath) ||
        task.allowedPaths.includes(spec.speed.sourcePath)
    ) {
        reject(
            "/speed/sourcePath",
            "Speed source must be a trusted read-only path"
        );
    }

    if (
        spec.controls.negative ===
        spec.controls.positive
    ) {
        reject(
            "/controls",
            "Opposing input controls must be distinct"
        );
    }

    if (
        spec.speed.unit === "pixels_per_nominal_frame"
    ) {
        if (
            !Number.isSafeInteger(
                spec.speed.referenceFps
            ) ||
            spec.speed.referenceFps < 1 ||
            spec.speed.referenceFps > 240
        ) {
            reject(
                "/speed/referenceFps",
                "Nominal frame rate must be an integer from 1 to 240"
            );
        }
    } else if ("referenceFps" in spec.speed) {
        reject(
            "/speed/referenceFps",
            "Per-second speed must not specify referenceFps"
        );
    }

    return errors.length === 0
        ? { valid: true, data: spec }
        : { valid: false, errors };
}

export function resolveSpeedPixelsPerSecond(
    spec: HorizontalControllerBehaviorSpec,
    constantValue: number
): number {
    if (
        !Number.isFinite(constantValue) ||
        constantValue <= 0
    ) {
        throw new Error(
            "Movement speed must be a positive finite number"
        );
    }

    return spec.speed.unit === "pixels_per_second"
        ? constantValue
        : constantValue * spec.speed.referenceFps;
}