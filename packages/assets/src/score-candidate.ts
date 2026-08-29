import type {
    AssetCandidate
} from "./AssetProvider.js";

import type {
    AssetRequirement
} from "./AssetRequirement.js";

export function scoreCandidate(
    requirement: AssetRequirement,
    candidate: AssetCandidate
): number {
    let score =
        candidate.score;

    score +=
        scoreDimensions(
            requirement,
            candidate
        );

    score +=
        scoreAnimations(
            requirement,
            candidate
        );

    score +=
        scoreOrientation(
            requirement,
            candidate
        );
    
    score +=
        scoreRoleCompatibility(
            requirement,
            candidate
        );

    return score;
}

function scoreDimensions(
    requirement: AssetRequirement,
    candidate: AssetCandidate
): number {
    const required =
        requirement.requirements
            .dimensions;

    const actual =
        candidate.dimensions;

    if (
        !required ||
        !actual
    ) {
        return 0;
    }

    let score = 0;

    if (
        required.preferredWidth ===
        actual.width
    ) {
        score += 0.05;
    }

    if (
        required.preferredHeight ===
        actual.height
    ) {
        score += 0.05;
    }

    return score;
}

function scoreAnimations(
    requirement: AssetRequirement,
    candidate: AssetCandidate
): number {
    const required =
        requirement.requirements
            .animations;

    if (
        !required ||
        required.length === 0
    ) {
        return 0;
    }

    const available =
        new Set(
            candidate.animations?.map(
                (animation) =>
                    animation.name
            ) ?? []
        );

    const matches =
        required.filter(
            (name) =>
                available.has(name)
        ).length;

    return (
        matches /
        required.length
    ) * 0.15;
}

function scoreOrientation(
    requirement: AssetRequirement,
    candidate: AssetCandidate
): number {
    const required =
        requirement.requirements
            .orientation;

    if (
        !required ||
        !candidate.orientation
    ) {
        return 0;
    }

    return candidate.orientation ===
        required
        ? 0.05
        : -0.05;
}

function scoreRoleCompatibility(
    requirement:
        AssetRequirement,

    candidate:
        AssetCandidate
): number {
    const tags =
        new Set(
            candidate.tags.map(
                (tag) =>
                    tag
                        .trim()
                        .toLowerCase()
            )
        );

    switch (
        requirement.role
    ) {
        case "player":
            return scoreTagProfile(
                tags,

                [
                    "character",
                    "player",
                    "hero",
                    "human",
                    "knight",
                    "warrior"
                ],

                [
                    "background",
                    "environment",
                    "building",
                    "architecture",
                    "item",
                    "weapon",
                    "icon",
                    "ui",
                    "particle",
                    "effect",
                    "tileset",
                    "terrain"
                ]
            );

        case "obstacle":
            return scoreTagProfile(
                tags,

                [
                    "obstacle",
                    "hazard",
                    "trap",
                    "spike",
                    "rock",
                    "crate",
                    "barrel",
                    "thorn"
                ],

                [
                    "character",
                    "player",
                    "hero",
                    "human",
                    "background",
                    "ui",
                    "icon"
                ]
            );

        case "background":
            return scoreTagProfile(
                tags,

                [
                    "background",
                    "environment",
                    "landscape",
                    "scenery",
                    "scene",
                    "sky",
                    "forest",
                    "parallax"
                ],

                [
                    "character",
                    "player",
                    "hero",
                    "human",
                    "item",
                    "weapon",
                    "icon",
                    "ui",
                    "particle",
                    "effect"
                ]
            );

        default:
            return 0;
    }
}

function scoreTagProfile(
    tags:
        ReadonlySet<string>,

    positive:
        readonly string[],

    negative:
        readonly string[]
): number {
    const positiveMatches =
        positive.filter(
            (tag) =>
                tags.has(tag)
        ).length;

    const negativeMatches =
        negative.filter(
            (tag) =>
                tags.has(tag)
        ).length;

    const positiveScore =
        Math.min(
            0.35,
            positiveMatches *
                0.1
        );

    const negativeScore =
        Math.min(
            0.7,
            negativeMatches *
                0.15
        );

    return (
        positiveScore -
        negativeScore
    );
}