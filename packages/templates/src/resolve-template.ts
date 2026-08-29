import type {
    GameSpec
} from "@game-factory/game-spec";

import {
    templateCatalog
} from "./catalog.js";

import type {
    GameTemplate
} from "./Template.js";

export function resolveTemplate(
    spec: GameSpec
): GameTemplate {
    const supported =
        templateCatalog.filter(
            (template) =>
                template
                    .supports(spec)
                    .supported
        );

    if (supported.length === 0) {
        throw new Error(
            createNoTemplateMessage(
                spec
            )
        );
    }

    if (supported.length > 1) {
        throw new Error(
            `Multiple templates support GameSpec: ${
                supported
                    .map(
                        (template) =>
                            template.manifest.id
                    )
                    .join(", ")
            }`
        );
    }

    return supported[0]!;
}

function createNoTemplateMessage(
    spec: GameSpec
): string {
    const diagnostics =
        templateCatalog.map(
            (template) => {
                const support =
                    template.supports(
                        spec
                    );

                const reasons =
                    support.reasons.length > 0
                        ? support.reasons.join(
                              "; "
                          )
                        : "unknown reason";

                return (
                    `${template.manifest.id}: ` +
                    reasons
                );
            }
        );

    return [
        "No compatible template found.",
        ...diagnostics
    ].join("\n");
}