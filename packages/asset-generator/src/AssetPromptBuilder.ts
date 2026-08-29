import type {
    AssetGenerationPrompt,
    AssetGenerationRequest
} from "./AssetGenerationTypes.js";

export function buildAssetGenerationPrompt(
    request:
        AssetGenerationRequest
): AssetGenerationPrompt {
    const tags =
        request.tags
            .map(
                (
                    tag
                ) =>
                    tag.trim()
            )
            .filter(
                Boolean
            )
            .join(
                ", "
            );

    const style =
        request.style.trim();

    const positiveParts:
        string[] = [
            "2D game asset",

            `asset role: ${request.role}`,

            `visual style: ${style}`,

            `subject and semantic tags: ${tags}`
        ];

    if (
        request.kind ===
        "sprite"
    ) {
        positiveParts.push(
            "single isolated game sprite",
            "centered composition",
            "entire subject visible",
            "clean silhouette",
            "suitable for use directly in a 2D game"
        );

        if (
            request.transparent
        ) {
            positiveParts.push(
                "transparent background"
            );
        }
    }

    if (
        request.kind ===
        "background"
    ) {
        positiveParts.push(
            "2D game background",
            "full-frame composition",
            "no interface elements",
            "suitable as a gameplay background"
        );
    }

    if (
        request.animation
    ) {
        positiveParts.push(
            `animation concept: ${request.animation}`
        );
    }

    if (
        style ===
        "pixel-art"
    ) {
        positiveParts.push(
            "crisp pixel art",
            "hard pixel edges",
            "consistent pixel scale"
        );
    }

    const negativeParts = [
        "text",
        "letters",
        "logo",
        "watermark",
        "user interface",
        "HUD",
        "border",
        "frame"
    ];

    if (
        request.kind ===
            "sprite" &&
        request.transparent
    ) {
        negativeParts.push(
            "scenery background",
            "opaque background"
        );
    }

    return {
        positive:
            positiveParts.join(
                ", "
            ),

        negative:
            negativeParts.join(
                ", "
            )
    };
}