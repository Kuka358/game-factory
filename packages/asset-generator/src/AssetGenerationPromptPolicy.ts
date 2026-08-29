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
                    "Clear readable silhouette."
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
                    "Centered full body sprite."
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
                    "No environment around the item."
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
                    "Centered."
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

        case "ui":
            positive.push(
                [
                    "Single clean game UI element.",
                    "Readable shape.",
                    "Centered interface asset."
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
                    "UI collection"
                ].join(
                    ", "
                )
            );

            break;

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