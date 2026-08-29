import type {
    AssetRequirement
} from "./AssetRequirement.js";

import type {
    AdditionalAssetSpec,
    GameAssetUiKind,
    GameSpec
} from "@game-factory/game-spec";


const RESERVED_ASSET_ROLES =
    new Set([
        "player",
        "obstacle",
        "background"
    ]);


export function createAssetRequirements(
    spec:
        GameSpec
): AssetRequirement[] {
    const globalTags =
        spec.assets.global_tags;

    const style =
        spec.assets.style;

    const player:
        AssetRequirement = {
        type:
            "sprite",

        role:
            "player",

        tags: [
            "player",
            ...spec.assets.roles.player.tags,
            ...globalTags,
            style
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            animations: [
                "idle",
                "run",
                "jump"
            ],

            generation: {
                profile:
                    "character",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    };


    const obstacle:
        AssetRequirement = {
        type:
            "sprite",

        role:
            "obstacle",

        tags: [
            "obstacle",
            ...spec.assets.roles.obstacle.tags,
            ...globalTags,
            style
        ],

        requirements: {
            transparent:
                true,

            orientation:
                "square",

            dimensions: {
                preferredWidth:
                    64,

                preferredHeight:
                    64
            },

            generation: {
                profile:
                    "obstacle",

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    };


    const backgroundDimensions =
        spec.game.orientation ===
            "portrait"
            ? {
                preferredWidth:
                    720,

                preferredHeight:
                    1280
            }
            : {
                preferredWidth:
                    1280,

                preferredHeight:
                    720
            };


    const background:
        AssetRequirement = {
        type:
            "image",

        role:
            "background",

        tags: [
            "background",
            ...spec.assets.roles.background.tags,
            ...globalTags,
            style
        ],

        requirements: {
            transparent:
                false,

            orientation:
                spec.game.orientation,

            dimensions:
                backgroundDimensions,

            generation: {
                profile:
                    "background",

                singleSubject:
                    false,

                allowSpritesheet:
                    false
            }
        }
    };


    const additional =
        spec.assets.additional ??
        [];

    validateAdditionalAssets(
        additional
    );

    const additionalRequirements =
        additional.map(
            (asset) =>
                createAdditionalAssetRequirement(
                    asset,
                    spec
                )
        );


    return [
        player,
        obstacle,
        background,
        ...additionalRequirements
    ];
}


function validateAdditionalAssets(
    assets:
        readonly AdditionalAssetSpec[]
): void {
    const roles =
        new Set<string>();

    for (
        const asset of assets
    ) {
        if (
            RESERVED_ASSET_ROLES.has(
                asset.role
            )
        ) {
            throw new Error(
                `Additional asset role "${asset.role}" is reserved`
            );
        }

        if (
            roles.has(
                asset.role
            )
        ) {
            throw new Error(
                `Duplicate additional asset role "${asset.role}"`
            );
        }

        roles.add(
            asset.role
        );


        if (
            asset.profile ===
                "ui"
        ) {
            if (
                !asset.ui_kind
            ) {
                throw new Error(
                    `Additional UI asset "${asset.role}" must define ui_kind`
                );
            }
        } else if (
            asset.ui_kind !==
            undefined &&
            asset.ui_kind !==
            null
        ) {
            throw new Error(
                [
                    `Additional asset "${asset.role}"`,
                    `uses profile="${asset.profile}"`,
                    "but ui_kind is only valid for profile=\"ui\""
                ].join(
                    " "
                )
            );
        }
    }
}


function createAdditionalAssetRequirement(
    asset:
        AdditionalAssetSpec,

    spec:
        GameSpec
): AssetRequirement {
    const tags = [
        asset.role,
        ...asset.tags,
        ...spec.assets.global_tags,
        spec.assets.style
    ];


    switch (
        asset.profile
    ) {
        case "character":
            return createSingleSpriteRequirement({
                role:
                    asset.role,

                profile:
                    "character",

                tags,

                width:
                    64,

                height:
                    64
            });


        case "npc":
            return createSingleSpriteRequirement({
                role:
                    asset.role,

                profile:
                    "npc",

                tags,

                width:
                    64,

                height:
                    64
            });


        case "item":
            return createSingleSpriteRequirement({
                role:
                    asset.role,

                profile:
                    "item",

                tags,

                width:
                    64,

                height:
                    64
            });


        case "obstacle":
            return createSingleSpriteRequirement({
                role:
                    asset.role,

                profile:
                    "obstacle",

                tags,

                width:
                    64,

                height:
                    64
            });


        case "background":
            return createAdditionalBackgroundRequirement(
                asset.role,
                tags,
                spec
            );


        case "ui":
            return createUiRequirement(
                asset.role,
                tags,
                requireUiKind(
                    asset
                )
            );


        case "tileset":
            return {
                type:
                    "image",

                role:
                    asset.role,

                tags,

                requirements: {
                    transparent:
                        false,

                    orientation:
                        "square",

                    dimensions: {
                        preferredWidth:
                            512,

                        preferredHeight:
                            512
                    },

                    generation: {
                        profile:
                            "tileset",

                        singleSubject:
                            false,

                        allowSpritesheet:
                            true,

                        tileable:
                            true
                    }
                }
            };
    }
}


interface CreateSingleSpriteRequirementInput {
    role:
        string;

    profile:
        "character" |
        "npc" |
        "item" |
        "obstacle";

    tags:
        string[];

    width:
        number;

    height:
        number;
}


function createSingleSpriteRequirement(
    input:
        CreateSingleSpriteRequirementInput
): AssetRequirement {
    return {
        type:
            "sprite",

        role:
            input.role,

        tags:
            input.tags,

        requirements: {
            transparent:
                true,

            orientation:
                input.width ===
                    input.height
                    ? "square"
                    : (
                        input.width >
                            input.height
                            ? "landscape"
                            : "portrait"
                    ),

            dimensions: {
                preferredWidth:
                    input.width,

                preferredHeight:
                    input.height
            },

            generation: {
                profile:
                    input.profile,

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    };
}


function createAdditionalBackgroundRequirement(
    role:
        string,

    tags:
        string[],

    spec:
        GameSpec
): AssetRequirement {
    const portrait =
        spec.game.orientation ===
        "portrait";

    return {
        type:
            "image",

        role,

        tags,

        requirements: {
            transparent:
                false,

            orientation:
                spec.game.orientation,

            dimensions: {
                preferredWidth:
                    portrait
                        ? 720
                        : 1280,

                preferredHeight:
                    portrait
                        ? 1280
                        : 720
            },

            generation: {
                profile:
                    "background",

                singleSubject:
                    false,

                allowSpritesheet:
                    false
            }
        }
    };
}


function createUiRequirement(
    role:
        string,

    tags:
        string[],

    uiKind:
        GameAssetUiKind
): AssetRequirement {
    const dimensions =
        getUiDimensions(
            uiKind
        );

    return {
        type:
            "image",

        role,

        tags,

        requirements: {
            transparent:
                true,

            orientation:
                dimensions.width ===
                    dimensions.height
                    ? "square"
                    : (
                        dimensions.width >
                            dimensions.height
                            ? "landscape"
                            : "portrait"
                    ),

            dimensions: {
                preferredWidth:
                    dimensions.width,

                preferredHeight:
                    dimensions.height
            },

            generation: {
                profile:
                    "ui",

                uiKind,

                singleSubject:
                    true,

                allowSpritesheet:
                    false
            }
        }
    };
}


function requireUiKind(
    asset:
        AdditionalAssetSpec
): GameAssetUiKind {
    if (
        !asset.ui_kind
    ) {
        throw new Error(
            `Additional UI asset "${asset.role}" must define ui_kind`
        );
    }

    return asset.ui_kind;
}


function getUiDimensions(
    uiKind:
        GameAssetUiKind
): {
    width:
        number;

    height:
        number;
} {
    switch (
        uiKind
    ) {
        case "button":
            return {
                width:
                    256,

                height:
                    96
            };


        case "panel":
            return {
                width:
                    512,

                height:
                    384
            };


        case "icon":
            return {
                width:
                    64,

                height:
                    64
            };


        case "frame":
            return {
                width:
                    256,

                height:
                    256
            };


        case "bar":
            return {
                width:
                    384,

                height:
                    64
            };
    }
}