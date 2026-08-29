import fs from "node:fs/promises";

import {
    validateGameSpec,
    type GameSpec
} from "@game-factory/game-spec";

export async function loadGameSpec(
    specPath: string
): Promise<GameSpec> {
    const content =
        await fs.readFile(
            specPath,
            "utf8"
        );

    let data: unknown;

    try {
        data =
            JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Invalid JSON in ${specPath}`,
            {
                cause: error
            }
        );
    }

    const validation =
        validateGameSpec(data);

    if (!validation.valid) {
        const errors =
            validation.errors
                .map(
                    (error) =>
                        `${error.path}: ${error.message}`
                )
                .join("\n");

        throw new Error(
            `GameSpec validation failed:\n${errors}`
        );
    }

    return validation.data;
}