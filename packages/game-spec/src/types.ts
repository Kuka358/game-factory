export interface GameSpec {
    schema_version: "1.0";

    metadata:
        MetadataSpec;

    generation:
        GenerationSpec;

    game:
        GameSettings;

    assets:
        AssetsSpec;

    controls:
        ControlsSpec;

    player:
        PlayerSpec;

    runner:
        RunnerSpec;
}

export type VisualStyle =
    | "pixel-art"
    | "cartoon"
    | "vector";

export interface AssetsSpec {
    style:
        VisualStyle;

    global_tags:
        string[];

    roles: {
        player: {
            tags:
                string[];
        };

        obstacle: {
            tags:
                string[];
        };

        background: {
            tags:
                string[];
        };
    };

    /*
     * Optional so every existing GameSpec remains valid.
     */
    additional?:
        AdditionalAssetSpec[];
}

export interface AssetRoleSpec {
    tags:
        string[];
}

export interface MetadataSpec {
    title: string;
    description: string;
}

export interface GenerationSpec {
    mode: "template" | "hybrid" | "experimental";
    seed: number;
    engine:
        | "phaser";
}

export interface GameSettings {
    genre: "endless_runner";
    orientation: "landscape" | "portrait";
}

export interface ControlsSpec {
    jump: JumpControl[];
}

export type JumpControl =
    | "keyboard_space"
    | "pointer";

export interface PlayerSpec {
    movement: {
        jump_force: number;
    }
}

export interface RunnerSpec {
    world_speed: number;
    obstacle_spawn_interval_ms: number;
    speed_increase_per_second: number;
}

export type GameAssetProfile =
    | "character"
    | "npc"
    | "item"
    | "obstacle"
    | "background"
    | "ui"
    | "tileset";


export type GameAssetUiKind =
    | "button"
    | "panel"
    | "icon"
    | "frame"
    | "bar";


export interface AdditionalAssetSpec {
    /*
     * Runtime role / manifest key.
     *
     * Examples:
     * enemy
     * coin
     * health_icon
     * level_tiles
     */
    role:
        string;

    profile:
        AssetGenerationProfile;

    tags:
        string[];

    /*
     * Used only for profile="ui".
     *
     * nullable is intentional because AJV's
     * JSONSchemaType works much more cleanly with
     * optional nested properties this way.
     */
    ui_kind?:
        AssetUiKind | null;
}

export type AssetGenerationProfile =
    | "character"
    | "npc"
    | "item"
    | "obstacle"
    | "background"
    | "ui"
    | "tileset";


export type AssetUiKind =
    | "button"
    | "panel"
    | "icon"
    | "frame"
    | "bar";


