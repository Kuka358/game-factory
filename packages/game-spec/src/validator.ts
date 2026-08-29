import {Ajv, type ErrorObject} from "ajv";
import { gameSpecSchema } from "./schema.js";
import type { GameSpec } from "./types.js";

const ajv = new Ajv({
    allErrors: true
});

const validate = ajv.compile(gameSpecSchema);

export interface GameSpecValidationError {
    path: string,
    message: string
}

export type GameSpecValidationResult =
    | {
        valid: true;
        data: GameSpec;
    }
    | {
        valid: false;
        errors: GameSpecValidationError[];
    };

export function validateGameSpec(
    data: unknown
): GameSpecValidationResult {
    const valid = validate(data)

    if (valid) {
        return {
            valid: true,
            data
        };
    }

    return {
        valid: false,
        errors: (validate.errors ?? []).map(formatValidationError)
    }
}

function formatValidationError(
    error: ErrorObject
): GameSpecValidationError {
    let path = error.instancePath || "/";

    if (error.keyword === "required") {
        const missingProperty = error.params.missingProperty;

        path =
            error.instancePath === ""
                ? `/${missingProperty}`
                : `${error.instancePath}/${missingProperty}`;

        return {
            path,
            message: "Required property is missing"
        };
    }

    if (error.keyword === "additionalProperties") {
        const additionalProperty = error.params.additionalProperty;

        path =
            error.instancePath === ""
                ? `/${additionalProperty}`
                : `${error.instancePath}/${additionalProperty}`;

        return {
            path,
            message: "Unknown property"
        };
    }

    return {
        path,
        message: error.message ?? "Unknown validation error"
    };
}
