import {
    Ajv,

    type ErrorObject,
    type ValidateFunction
} from "ajv";

import {
    gameSpecSchema
} from "./schema.js";

import {
    platformerGameSpecSchema
} from "./platformer-schema.js";

import {
    isPlatformerGameSpec,

    type EndlessRunnerGameSpec,
    type GameSpec,
    type PlatformerGameSpec
} from "./types.js";


const ajv =
    new Ajv({
        allErrors:
            true
    });


const validateEndlessRunner:
    ValidateFunction<
        EndlessRunnerGameSpec
    > =
    ajv.compile<
        EndlessRunnerGameSpec
    >(
        gameSpecSchema
    );


const validatePlatformer:
    ValidateFunction<
        PlatformerGameSpec
    > =
    ajv.compile<
        PlatformerGameSpec
    >(
        platformerGameSpecSchema
    );


export interface GameSpecValidationError {
    path:
        string;

    message:
        string;
}


export type GameSpecValidationResult =
    | {
        valid:
            true;

        data:
            GameSpec;
    }
    | {
        valid:
            false;

        errors:
            GameSpecValidationError[];
    };


export function validateGameSpec(
    data:
        unknown
): GameSpecValidationResult {
    if (
        readGenre(
            data
        ) ===
        "platformer"
    ) {
        if (
            !validatePlatformer(
                data
            )
        ) {
            return invalidResult(
                validatePlatformer
                    .errors
            );
        }


        const crossFieldErrors =
            validatePlatformerRelationships(
                data
            );


        if (
            crossFieldErrors.length >
            0
        ) {
            return {
                valid:
                    false,

                errors:
                    crossFieldErrors
            };
        }


        return {
            valid:
                true,

            data
        };
    }


    if (
        !validateEndlessRunner(
            data
        )
    ) {
        return invalidResult(
            validateEndlessRunner
                .errors
        );
    }


    return {
        valid:
            true,

        data
    };
}


function validatePlatformerRelationships(
    spec:
        PlatformerGameSpec
): GameSpecValidationError[] {
    const errors:
        GameSpecValidationError[] =
        [];


    if (
        spec.platformer
            .platform_gap_min >
        spec.platformer
            .platform_gap_max
    ) {
        errors.push({
            path:
                "/platformer/platform_gap_min",

            message:
                "Must be less than or equal to platform_gap_max"
        });
    }


    if (
        spec.platformer
            .platform_width_min >
        spec.platformer
            .platform_width_max
    ) {
        errors.push({
            path:
                "/platformer/platform_width_min",

            message:
                "Must be less than or equal to platform_width_max"
        });
    }


    return errors;
}


function readGenre(
    data:
        unknown
): string | undefined {
    if (
        !data ||
        typeof data !==
            "object"
    ) {
        return undefined;
    }


    const game =
        (
            data as {
                game?:
                    unknown;
            }
        ).game;


    if (
        !game ||
        typeof game !==
            "object"
    ) {
        return undefined;
    }


    const genre =
        (
            game as {
                genre?:
                    unknown;
            }
        ).genre;


    return typeof genre ===
        "string"
        ? genre
        : undefined;
}


function invalidResult(
    errors:
        ErrorObject[] |
        null |
        undefined
): GameSpecValidationResult {
    return {
        valid:
            false,

        errors:
            (
                errors ??
                []
            ).map(
                formatValidationError
            )
    };
}


function formatValidationError(
    error:
        ErrorObject
): GameSpecValidationError {
    let path =
        error.instancePath ||
        "/";


    if (
        error.keyword ===
        "required"
    ) {
        const missingProperty =
            error.params
                .missingProperty;


        path =
            error.instancePath ===
                ""
                ? `/${missingProperty}`
                : `${error.instancePath}/${missingProperty}`;


        return {
            path,

            message:
                "Required property is missing"
        };
    }


    if (
        error.keyword ===
        "additionalProperties"
    ) {
        const additionalProperty =
            error.params
                .additionalProperty;


        path =
            error.instancePath ===
                ""
                ? `/${additionalProperty}`
                : `${error.instancePath}/${additionalProperty}`;


        return {
            path,

            message:
                "Unknown property"
        };
    }


    return {
        path,

        message:
            error.message ??
            "Unknown validation error"
    };
}