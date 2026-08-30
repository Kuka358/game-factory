import type {
    AssetGenerationPrompt,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

export interface AssetValidationFailureLike {
    code:
        string;

    message:
        string;
}

export function applyAssetGenerationProfilePolicy(
    prompt:
        AssetGenerationPrompt,

    request:
        NormalizedAssetGenerationRequest
): AssetGenerationPrompt {
    const positive:
        string[] = [
            prompt.positive
        ];

    const negative:
        string[] = [
            prompt.negative
        ];

    switch (
        request.profile
    ) {
        case "character":
            positive.push(
                [
                    "Exactly one character.",
                    "Single isolated game character sprite.",
                    "One pose only.",
                    "One full body subject.",
                    "Centered composition.",
                    "Clear readable silhouette.",
                    "32-bit pixel art.",
                    "High-detail production-quality game sprite.",
                    "Use rich but readable internal pixel detail.",
                    "Use layered clothing, armor, equipment, accessories, seams, straps, buckles, or mechanical features when appropriate.",
                    "Render different materials such as cloth, metal, leather, glass, skin, hair, or glowing technology distinctly.",
                    "Use controlled internal shadows, highlights, and secondary color regions.",
                    "Preserve fine internal detail without adding additional subjects."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "sprite sheet",
                    "spritesheet",
                    "character sheet",
                    "animation sheet",
                    "animation strip",
                    "multiple poses",
                    "multiple characters",
                    "turnaround sheet",
                    "reference sheet",
                    "pose sheet",
                    "frame sequence",
                    "grid"
                ].join(
                    ", "
                )
            );

            break;

        case "npc":
            positive.push(
                [
                    "Exactly one NPC character.",
                    "Single isolated game character.",
                    "One pose only.",
                    "Centered full body sprite.",
                    "32-bit pixel art.",
                    "High-detail production-quality game sprite.",
                    "Use rich but readable internal pixel detail.",
                    "Add distinctive anatomy, armor, clothing, scales, bones, mechanical parts, markings, horns, claws, or equipment where appropriate.",
                    "Make the NPC visually specific rather than a generic silhouette.",
                    "Use controlled internal shadows, highlights, texture, and secondary color regions.",
                    "Preserve exactly one visible subject."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "sprite sheet",
                    "character sheet",
                    "multiple characters",
                    "multiple poses",
                    "animation frames",
                    "grid",
                    "reference sheet"
                ].join(
                    ", "
                )
            );

            break;

        case "item":
            positive.push(
                [
                    "Exactly one isolated game item.",
                    "Single object only.",
                    "Centered object.",
                    "No environment around the item.",
                    "32-bit pixel art.",
                    "High-detail production-quality game item.",
                    "Use rich but readable internal pixel detail.",
                    "Add material texture, decorative edges, engravings, facets, caps, handles, reflections, wear, or magical accents where appropriate.",
                    "Use controlled highlights, shadows, and coherent secondary color regions.",
                    "Keep the result readable as exactly one isolated item."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "multiple items",
                    "item sheet",
                    "inventory sheet",
                    "sprite sheet",
                    "grid",
                    "collection",
                    "catalog",
                    "environment",
                    "scene"
                ].join(
                    ", "
                )
            );

            break;

        case "obstacle":
            positive.push(
                [
                    "Exactly one isolated physical game obstacle.",
                    "Single object only.",
                    "Grounded readable silhouette.",
                    "Centered.",
                    "32-bit pixel art.",
                    "High-detail production-quality game obstacle.",
                    "Use rich but readable internal pixel detail.",
                    "Add construction details, joints, cracks, bolts, planks, spikes, surface wear, texture, or mechanical parts where appropriate.",
                    "Show clearly differentiated materials and internal shading.",
                    "Preserve a strong readable outer silhouette and exactly one object."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "multiple obstacles",
                    "sprite sheet",
                    "grid",
                    "collection",
                    "scene",
                    "environment"
                ].join(
                    ", "
                )
            );

            break;

        case "background":
            positive.push(
                [
                    "Full game background scene.",
                    "Environmental composition.",
                    "No isolated sprite presentation.",
                    "No interface elements."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "sprite sheet",
                    "character sheet",
                    "UI",
                    "HUD",
                    "text",
                    "logo"
                ].join(
                    ", "
                )
            );

            break;

        case "ui": {
            positive.push(
                [
                    "Generate exactly one standalone game UI element.",
                    "Single isolated interface asset.",
                    "32-bit pixel art.",
                    "Polished production-quality game UI asset.",
                    "Clean readable silhouette.",
                    "Use rich but controlled pixel detail.",
                    "Use deliberate borders, internal shading, highlights, material accents, and secondary color regions where appropriate.",
                    "Maintain very strong readability at actual game UI size.",
                    "Do not add decorative objects outside the requested UI element.",
                    "No complete HUD or UI kit.",
                    "No text unless explicitly requested."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "environment",
                    "scene",
                    "character",
                    "sprite sheet",
                    "multiple UI variants",
                    "UI collection",
                    "UI kit",
                    "full HUD",
                    "full menu",
                    "interface mockup"
                ].join(
                    ", "
                )
            );

            switch (
                request.uiKind
            ) {
                case "icon":
                    positive.push(
                        [
                            "Create exactly one compact square game icon.",
                            "Show one clear visual symbol only.",
                            "Keep the symbol centered.",
                            "High readability at very small resolution.",
                            "Transparent background."
                        ].join(
                            " "
                        )
                    );

                    negative.push(
                        [
                            "multiple icons",
                            "icon sheet",
                            "icon set",
                            "text",
                            "numbers",
                            "button",
                            "panel"
                        ].join(
                            ", "
                        )
                    );

                    break;

                case "button":
                    positive.push(
                        [
                            "Create exactly one horizontal game button.",
                            "Leave the center visually clean for runtime text.",
                            "Do not render text into the button."
                        ].join(
                            " "
                        )
                    );

                    break;

                case "panel":
                    positive.push(
                        [
                            "Create exactly one rectangular game UI panel.",
                            "Use a decorative border.",
                            "Keep a large clean interior area."
                        ].join(
                            " "
                        )
                    );

                    break;

                case "frame":
                    positive.push(
                        [
                            "Create exactly one decorative UI frame.",
                            "Keep the center empty and transparent.",
                            "Decoration belongs primarily on the border."
                        ].join(
                            " "
                        )
                    );

                    break;

                case "bar":
                    positive.push(
                        [
                            "Create exactly one horizontal game status bar.",
                            "Long rectangular shape.",
                            "Clean outer border and inner fill region."
                        ].join(
                            " "
                        )
                    );

                    break;

                default:
                    break;
            }

            break;
        }

        case "tileset": {
            positive.push(
                [
                    "Create a coherent reusable 2D game tileset.",
                    "Use a strict regular grid.",
                    "Every tile must have exactly the same dimensions.",
                    "Tile edges must align cleanly.",
                    "Use consistent perspective, lighting, palette, and pixel density.",
                    "Produce modular environment pieces suitable for constructing game levels."
                ].join(
                    " "
                )
            );

            negative.push(
                [
                    "irregular grid",
                    "different tile sizes",
                    "misaligned tiles",
                    "overlapping tiles",
                    "random object placement",
                    "perspective mismatch",
                    "inconsistent pixel scale",
                    "characters",
                    "UI",
                    "text"
                ].join(
                    ", "
                )
            );

            if (
                request.tileable
            ) {
                positive.push(
                    [
                        "Tiles intended as repeating terrain must be seamless.",
                        "Opposite edges should visually connect without obvious seams."
                    ].join(
                        " "
                    )
                );

                negative.push(
                    [
                        "visible seams",
                        "broken repeating edges",
                        "non-tileable texture"
                    ].join(
                        ", "
                    )
                );
            }

            break;
        }
    }

    return {
        positive:
            positive
                .filter(Boolean)
                .join(
                    "\n"
                ),

        negative:
            negative
                .filter(Boolean)
                .join(
                    ", "
                )
    };
}


export function reinforcePromptAfterValidationFailure(
    prompt:
        AssetGenerationPrompt,

    request:
        NormalizedAssetGenerationRequest,

    failures:
        readonly AssetValidationFailureLike[],

    attempt:
        number
): AssetGenerationPrompt {
    const codes =
        new Set(
            failures.map(
                (failure) =>
                    failure.code
            )
        );

    const positive:
        string[] = [
            prompt.positive,

            `Correction attempt ${attempt}.`
        ];

    const negative:
        string[] = [
            prompt.negative
        ];

    if (
        codes.has(
            "probable_spritesheet"
        ) ||
        codes.has(
            "multiple_subjects"
        )
    ) {
        positive.push(
            [
                "CRITICAL COMPOSITION REQUIREMENT:",
                "the entire image must contain EXACTLY ONE visible subject.",
                "Show one character or one object only.",
                "There must not be a second character, duplicate, clone,",
                "alternate pose, separate version, reference pose,",
                "animation frame, companion object, or additional subject.",
                "Use one centered isolated subject occupying most of the canvas."
            ].join(
                " "
            )
        );

        negative.push(
            [
                "two characters",
                "multiple characters",
                "duplicate character",
                "clones",
                "second subject",
                "multiple subjects",
                "multiple objects",
                "sprite sheet",
                "spritesheet",
                "animation sheet",
                "character sheet",
                "pose sheet",
                "reference sheet",
                "multiple frames",
                "multiple poses",
                "alternate poses",
                "turnaround",
                "grid layout",
                "contact sheet"
            ].join(
                ", "
            )
        );
    }

    if (
        codes.has(
            "subject_too_small"
        )
    ) {
        positive.push(
            [
                "The subject must occupy most of the available canvas.",
                "Use a clear large readable game sprite."
            ].join(
                " "
            )
        );
    }

    return {
        positive:
            positive.join(
                "\n"
            ),

        negative:
            negative
                .filter(Boolean)
                .join(
                    ", "
                )
    };
}