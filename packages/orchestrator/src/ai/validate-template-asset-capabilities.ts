import type {
    GameDesignerTemplate
} from "@game-factory/ai";

import type {
    GameSpec
} from "@game-factory/game-spec";


export interface TemplateAssetCapabilityValidationResult {
    valid:
        boolean;

    errors:
        string[];
}


const RESERVED_ROLES =
    new Set([
        "player",
        "obstacle",
        "background"
    ]);


export function validateTemplateAssetCapabilities(
    spec:
        GameSpec,

    templates:
        readonly GameDesignerTemplate[]
): TemplateAssetCapabilityValidationResult {
    const template =
        resolveTemplate(
            spec,
            templates
        );

    if (
        !template
    ) {
        return {
            valid:
                false,

            errors: [
                [
                    "No supplied template matches",
                    `genre="${spec.game.genre}"`,
                    `and mode="${spec.generation.mode}".`
                ].join(
                    " "
                )
            ]
        };
    }

    const capabilities =
        template.additionalAssetCapabilities ??
        [];

    const errors:
        string[] = [];

    validateCapabilityDefinitions(
        template,
        capabilities,
        errors
    );

    const additional =
        spec.assets.additional ??
        [];

    const seenRoles =
        new Set<string>();

    const capabilitiesByRole =
        new Map(
            capabilities.map(
                (capability) => [
                    capability.role,
                    capability
                ] as const
            )
        );

    for (
        const asset of additional
    ) {
        if (
            RESERVED_ROLES.has(
                asset.role
            )
        ) {
            errors.push(
                `Additional asset role "${asset.role}" is reserved.`
            );

            continue;
        }

        if (
            seenRoles.has(
                asset.role
            )
        ) {
            errors.push(
                `Additional asset role "${asset.role}" is declared more than once.`
            );

            continue;
        }

        seenRoles.add(
            asset.role
        );

        const capability =
            capabilitiesByRole.get(
                asset.role
            );

        if (
            !capability
        ) {
            errors.push(
                [
                    `Additional asset role "${asset.role}" is not supported`,
                    `by template "${template.id}@${template.version}".`
                ].join(
                    " "
                )
            );

            continue;
        }

        if (
            asset.profile !==
            capability.profile
        ) {
            errors.push(
                [
                    `Additional asset "${asset.role}" uses profile="${asset.profile}",`,
                    `but template "${template.id}" requires profile="${capability.profile}".`
                ].join(
                    " "
                )
            );
        }

        if (
            asset.profile ===
            "ui"
        ) {
            if (
                !asset.ui_kind
            ) {
                errors.push(
                    `Additional UI asset "${asset.role}" must define ui_kind.`
                );
            } else if (
                capability.uiKinds &&
                capability.uiKinds.length >
                    0 &&
                !capability.uiKinds.includes(
                    asset.ui_kind
                )
            ) {
                errors.push(
                    [
                        `Additional UI asset "${asset.role}" uses ui_kind="${asset.ui_kind}",`,
                        `but the template allows only:`,
                        capability.uiKinds.join(
                            ", "
                        )
                    ].join(
                        " "
                    )
                );
            }
        } else if (
            asset.ui_kind !==
            undefined &&
            asset.ui_kind !==
            null
        ) {
            errors.push(
                [
                    `Additional asset "${asset.role}" uses profile="${asset.profile}"`,
                    "but ui_kind is only valid for profile=\"ui\"."
                ].join(
                    " "
                )
            );
        }
    }

    for (
        const capability of capabilities
    ) {
        if (
            capability.required ===
                true &&
            !seenRoles.has(
                capability.role
            )
        ) {
            errors.push(
                [
                    `Template "${template.id}" requires additional asset`,
                    `"${capability.role}" with profile="${capability.profile}",`,
                    "but it is missing from assets.additional."
                ].join(
                    " "
                )
            );
        }
    }

    return {
        valid:
            errors.length ===
            0,

        errors
    };
}


function resolveTemplate(
    spec:
        GameSpec,

    templates:
        readonly GameDesignerTemplate[]
): GameDesignerTemplate | undefined {
    return templates.find(
        (template) =>
            template.genre ===
                spec.game.genre &&
            template.supportedModes.includes(
                spec.generation.mode
            )
    );
}


function validateCapabilityDefinitions(
    template:
        GameDesignerTemplate,

    capabilities:
        NonNullable<
            GameDesignerTemplate[
                "additionalAssetCapabilities"
            ]
        >,

    errors:
        string[]
): void {
    const roles =
        new Set<string>();

    for (
        const capability of capabilities
    ) {
        if (
            RESERVED_ROLES.has(
                capability.role
            )
        ) {
            errors.push(
                [
                    `Template "${template.id}" declares reserved role`,
                    `"${capability.role}" as an additional asset capability.`
                ].join(
                    " "
                )
            );
        }

        if (
            roles.has(
                capability.role
            )
        ) {
            errors.push(
                [
                    `Template "${template.id}" declares duplicate`,
                    `additional asset capability "${capability.role}".`
                ].join(
                    " "
                )
            );
        }

        roles.add(
            capability.role
        );

        if (
            capability.profile !==
                "ui" &&
            capability.uiKinds !==
                undefined
        ) {
            errors.push(
                [
                    `Template capability "${capability.role}"`,
                    `uses profile="${capability.profile}"`,
                    "but declares uiKinds."
                ].join(
                    " "
                )
            );
        }
    }
}