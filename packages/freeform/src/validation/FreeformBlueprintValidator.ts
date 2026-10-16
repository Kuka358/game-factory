
import {
    Ajv,
    type ErrorObject
} from "ajv";

import type {
    FreeformBlueprint
} from "../contracts/FreeformBlueprint.js";

export interface BlueprintValidationError {
    path: string;
    message: string;
}

export type BlueprintValidationResult =
    | {
        valid: true;
        data: FreeformBlueprint;
    }
    | {
        valid: false;
        errors: BlueprintValidationError[];
    };

const text = {
    type: "string" as const,
    minLength: 1,
    maxLength: 512
};

const identifier = {
    type: "string" as const,
    pattern: "^[a-z0-9][a-z0-9_-]{0,63}$"
};

function object(properties: Record<string, unknown>) {
    return {
        type: "object" as const,
        additionalProperties: false,
        required: Object.keys(properties),
        properties
    };
}

function array(
    items: unknown,
    minItems = 0,
    maxItems = 32
) {
    return {
        type: "array" as const,
        items,
        minItems,
        maxItems
    };
}

export const freeformBlueprintSchema = object({
    schemaVersion: {
        type: "string",
        const: "1.0"
    },
    id: identifier,
    title: text,
    pitch: text,
    target: {
        type: "string",
        enum: ["web", "yandex"]
    },
    technology: object({
        engine: {
            type: "string",
            const: "phaser"
        },
        language: {
            type: "string",
            const: "typescript"
        }
    }),
    viewport: object({
        width: {
            type: "integer",
            minimum: 256,
            maximum: 4096
        },
        height: {
            type: "integer",
            minimum: 256,
            maximum: 4096
        },
        orientation: {
            type: "string",
            enum: ["landscape", "portrait"]
        }
    }),
    controls: array(object({
        action: text,
        input: text,
        description: text
    }), 1),
    mechanics: array(object({
        id: identifier,
        rules: array(text, 1),
        failureModes: array(text)
    }), 1),
    scenes: array(object({
        id: identifier,
        purpose: text,
        transitions: array(text)
    }), 1),
    visualStyle: object({
        style: text,
        paletteNotes: text,
        camera: text
    }),
    assets: array(object({
        id: identifier,
        role: text,
        description: text,
        profile: {
            type: "string",
            enum: [
                "character",
                "npc",
                "item",
                "obstacle",
                "background",
                "ui",
                "tileset"
            ]
        },
        width: {
            type: "integer",
            minimum: 1,
            maximum: 4096
        },
        height: {
            type: "integer",
            minimum: 1,
            maximum: 4096
        },
        transparent: {
            type: "boolean"
        },
        optional: {
            type: "boolean"
        },
        filename: {
            type: "string",
            maxLength: 160,
            pattern:
                "^[a-z0-9_-]+(?:/[a-z0-9_-]+)*\\.(?:png|webp|jpg|jpeg)$"
        }
    })),
    acceptance: array(object({
        id: identifier,
        scenario: text,
        expected: text
    }), 1),
    constraints: object({
        offlineRuntime: {
            type: "boolean"
        },
        noRemoteCode: {
            type: "boolean",
            const: true
        },
        scope: {
            type: "string",
            const: "small-2d"
        }
    })
});

const ajv = new Ajv({
    allErrors: true
});

const checkSchema =
    ajv.compile<FreeformBlueprint>(
        freeformBlueprintSchema
    );

export function validateFreeformBlueprint(
    value: unknown
): BlueprintValidationResult {
    if (!checkSchema(value)) {
        return {
            valid: false,
            errors: (checkSchema.errors ?? [])
                .map(formatSchemaError)
        };
    }

    const errors: BlueprintValidationError[] = [];

    checkUniqueIds(value.mechanics, "mechanics", errors);
    checkUniqueIds(value.scenes, "scenes", errors);
    checkUniqueIds(value.assets, "assets", errors);
    checkUniqueIds(value.acceptance, "acceptance", errors);

    const filenames = new Set<string>();

    value.assets.forEach((asset, index) => {
        const filename = asset.filename.toLowerCase();

        if (filenames.has(filename)) {
            errors.push({
                path: `/assets/${index}/filename`,
                message: "Duplicate asset filename"
            });
        }

        filenames.add(filename);
    });

    const { width, height, orientation } = value.viewport;

    if (
        orientation === "landscape" &&
        width <= height
    ) {
        errors.push({
            path: "/viewport/orientation",
            message: "Landscape requires width > height"
        });
    }

    if (
        orientation === "portrait" &&
        height <= width
    ) {
        errors.push({
            path: "/viewport/orientation",
            message: "Portrait requires height > width"
        });
    }

    if (errors.length > 0) {
        return {
            valid: false,
            errors
        };
    }

    return {
        valid: true,
        data: value
    };
}

function checkUniqueIds(
    items: readonly { id: string }[],
    collection: string,
    errors: BlueprintValidationError[]
): void {
    const ids = new Set<string>();

    items.forEach((item, index) => {
        if (ids.has(item.id)) {
            errors.push({
                path: `/${collection}/${index}/id`,
                message: `Duplicate ${collection} ID: ${item.id}`
            });
        }

        ids.add(item.id);
    });
}

function formatSchemaError(
    error: ErrorObject
): BlueprintValidationError {
    if (error.keyword === "required") {
        return {
            path:
                `${error.instancePath}/${String(error.params.missingProperty)}`,
            message: "Required property is missing"
        };
    }

    if (error.keyword === "additionalProperties") {
        return {
            path:
                `${error.instancePath}/${String(error.params.additionalProperty)}`,
            message: "Unknown property"
        };
    }

    return {
        path: error.instancePath || "/",
        message: error.message ?? "Invalid value"
    };
}
