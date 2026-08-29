import type {
    AssetRequirement
} from "@game-factory/assets";

export interface LocalSearchTag {
    tag: string;
    importance: number;
}

export interface LocalCandidateFacts {
    weightedMatch: number;

    relativePath: string;

    width:
        number | null;

    height:
        number | null;

    isProbableSpriteSheet:
        boolean | null;
}

const ROLE_HINTS:
    Record<
        string,
        readonly string[]
    > = {
    player: [
        "character",
        "human",
        "hero"
    ],

    obstacle: [
        "obstacle",
        "trap",
        "hazard"
    ],

    background: [
        "background",
        "environment",
        "scenery"
    ]
};

export function createLocalSearchTags(
    requirement:
        AssetRequirement
): LocalSearchTag[] {
    const result =
        new Map<
            string,
            number
        >();

    requirement.tags.forEach(
        (
            tag,
            index
        ) => {
            addTag(
                result,
                tag,

                index === 0
                    ? 2.5
                    : 1
            );
        }
    );

    const hints =
        ROLE_HINTS[
            requirement.role
        ] ?? [];

    for (
        const tag of
        hints
    ) {
        addTag(
            result,
            tag,
            0.4
        );
    }

    return [
        ...result.entries()
    ].map(
        ([
            tag,
            importance
        ]) => ({
            tag,
            importance
        })
    );
}

export function scoreLocalCandidate(
    requirement:
        AssetRequirement,

    facts:
        LocalCandidateFacts
): number {
    let score =
        facts.weightedMatch /
        2.5;

    score +=
        scorePath(
            requirement.role,
            facts.relativePath
        );

    score +=
        scoreGeometry(
            requirement.role,
            facts
        );

    return clamp(
        score,
        0,
        1
    );
}

export function getRoleSqlFilter(
    role: string
): string {
    switch (role) {
        case "player":
            return `
                AND f.has_alpha = 1

                AND f.width IS NOT NULL
                AND f.height IS NOT NULL

                AND f.width > 0
                AND f.height > 0

                AND (
                    1.0 * f.width /
                    f.height
                ) BETWEEN 0.4 AND 2.5

                AND COALESCE(
                    f.is_probable_sprite_sheet,
                    0
                ) = 0

                AND LOWER(
                    REPLACE(
                        f.relative_path,
                        '\\',
                        '/'
                    )
                ) NOT LIKE '%/buildings/%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%background%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%tileset%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%faceset%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%spritesheet%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%particle%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%effect%'
            `;

        case "obstacle":
            return `
                AND f.has_alpha = 1

                AND f.width IS NOT NULL
                AND f.height IS NOT NULL

                AND f.width > 0
                AND f.height > 0

                AND COALESCE(
                    f.is_probable_sprite_sheet,
                    0
                ) = 0

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%background%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%character%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%player%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%faceset%'
            `;

        case "background":
            return `
                AND f.width IS NOT NULL
                AND f.height IS NOT NULL

                AND f.width >= 640
                AND f.height >= 360

                AND f.orientation =
                    'landscape'

                AND COALESCE(
                    f.is_probable_sprite_sheet,
                    0
                ) = 0

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%icon%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%character%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%faceset%'

                AND LOWER(
                    f.relative_path
                ) NOT LIKE '%spritesheet%'
            `;

        default:
            return "";
    }
}

function scorePath(
    role: string,
    path: string
): number {
    const value =
        path
            .replaceAll(
                "\\",
                "/"
            )
            .toLowerCase();

    switch (role) {
        case "player":
            return scoreTerms(
                value,

                [
                    "character",
                    "actor",
                    "battler",
                    "troops",
                    "warrior",
                    "knight",
                    "hero"
                ],

                [
                    "building",
                    "castle",
                    "house",
                    "tower",
                    "background",
                    "terrain",
                    "tileset",
                    "item",
                    "weapon",
                    "particle",
                    "effect",
                    "ui",
                    "icon"
                ]
            );

        case "obstacle":
            return scoreTerms(
                value,

                [
                    "obstacle",
                    "spike",
                    "trap",
                    "hazard",
                    "rock",
                    "crate",
                    "barrel",
                    "thorn",
                    "barricade"
                ],

                [
                    "character",
                    "player",
                    "hero",
                    "background",
                    "ui",
                    "icon"
                ]
            );

        case "background":
            return scoreTerms(
                value,

                [
                    "background",
                    "/bg",
                    "_bg",
                    "environment",
                    "scene",
                    "landscape",
                    "forest",
                    "sky",
                    "parallax"
                ],

                [
                    "character",
                    "actor",
                    "player",
                    "faceset",
                    "item",
                    "weapon",
                    "particle",
                    "effect",
                    "icon",
                    "/ui/"
                ]
            );

        default:
            return 0;
    }
}

function scoreGeometry(
    role: string,
    facts:
        LocalCandidateFacts
): number {
    if (
        facts.width === null ||
        facts.height === null ||
        facts.width <= 0 ||
        facts.height <= 0
    ) {
        return 0;
    }

    const aspect =
        facts.width /
        facts.height;

    switch (role) {
        case "player": {
            const distance =
                Math.abs(
                    Math.log(
                        aspect
                    )
                );

            return Math.max(
                0,
                0.15 -
                distance * 0.08
            );
        }

        case "obstacle": {
            if (
                aspect >= 0.4 &&
                aspect <= 1.8
            ) {
                return 0.1;
            }

            return 0;
        }

        case "background": {
            const target =
                16 / 9;

            const ratioDistance =
                Math.abs(
                    Math.log(
                        aspect /
                        target
                    )
                );

            let score =
                Math.max(
                    0,
                    0.15 -
                    ratioDistance *
                    0.1
                );

            const pixels =
                facts.width *
                facts.height;

            if (
                pixels >=
                1280 * 720
            ) {
                score += 0.1;
            }

            return score;
        }

        default:
            return 0;
    }
}

function scoreTerms(
    value: string,

    positive:
        readonly string[],

    negative:
        readonly string[]
): number {
    let score = 0;

    if (
        positive.some(
            (term) =>
                value.includes(
                    term
                )
        )
    ) {
        score += 0.2;
    }

    if (
        negative.some(
            (term) =>
                value.includes(
                    term
                )
        )
    ) {
        score -= 0.5;
    }

    return score;
}

function addTag(
    result:
        Map<string, number>,

    value:
        string,

    importance:
        number
): void {
    const tag =
        value
            .trim()
            .toLowerCase();

    if (!tag) {
        return;
    }

    const current =
        result.get(
            tag
        ) ?? 0;

    result.set(
        tag,
        Math.max(
            current,
            importance
        )
    );
}

function clamp(
    value: number,
    min: number,
    max: number
): number {
    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}

export function isLocalCandidateAllowed(
    requirement:
        AssetRequirement,

    fileTags:
        readonly string[],

    relativePath:
        string
): boolean {
    const tags =
        new Set(
            fileTags.map(
                (tag) =>
                    tag
                        .trim()
                        .toLowerCase()
            )
        );

    const path =
        relativePath
            .replaceAll(
                "\\",
                "/"
            )
            .toLowerCase();

    switch (
        requirement.role
    ) {
        case "player":
            return isPlayerAllowed(
                requirement,
                tags,
                path
            );

        case "obstacle":
            return isObstacleAllowed(
                requirement,
                tags,
                path
            );

        case "background":
            return isBackgroundAllowed(
                requirement,
                tags,
                path
            );

        default:
            return true;
    }
}

function isPlayerAllowed(
    requirement:
        AssetRequirement,

    tags:
        ReadonlySet<string>,

    path:
        string
): boolean {
    const primaryTag =
        requirement.tags[0]
            ?.toLowerCase();

    if (
        primaryTag &&
        !tags.has(primaryTag) &&
        !path.includes(primaryTag)
    ) {
        return false;
    }

    const forbidden = [
        "building",
        "background",
        "tileset",
        "terrain",
        "weapon",
        "item",
        "icon",
        "particle"
    ];

    return !forbidden.some(
        (tag) =>
            tags.has(tag)
    );
}

function isObstacleAllowed(
    requirement:
        AssetRequirement,

    tags:
        ReadonlySet<string>,

    path:
        string
): boolean {
    const primaryTag =
        requirement.tags[0]
            ?.toLowerCase();

    if (!primaryTag) {
        return true;
    }

    const aliases =
        primaryTag === "spike"
            ? [
                "spike",
                "spikes"
            ]
            : [
                primaryTag
            ];

    return aliases.some(
        (tag) =>
            tags.has(tag) ||
            path.includes(tag)
    );
}

function isBackgroundAllowed(
    requirement:
        AssetRequirement,

    tags:
        ReadonlySet<string>,

    path:
        string
): boolean {
    /*
     * Style is much more important here
     * than a loose "background" match.
     *
     * Otherwise anime / photo / modern
     * backgrounds can win.
     */
    if (
        requirement.tags.includes(
            "pixel-art"
        ) &&
        !tags.has(
            "pixel-art"
        ) &&
        !path.includes(
            "pixel"
        )
    ) {
        return false;
    }

    const forbiddenTags = [
        "character",
        "human",
        "item",
        "weapon",
        "particle",
        "icon",
        "ui"
    ];

    if (
        forbiddenTags.some(
            (tag) =>
                tags.has(tag)
        )
    ) {
        return false;
    }

    const forbiddenPathTerms = [
        "bathroom",
        "toilet",
        "bedroom",
        "apartment",
        "office",
        "school",
        "kitchen",
        "modern"
    ];

    if (
        forbiddenPathTerms.some(
            (term) =>
                path.includes(term)
        )
    ) {
        return false;
    }

    return true;
}