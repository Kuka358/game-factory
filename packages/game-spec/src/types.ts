export type GameSpec =
    | EndlessRunnerGameSpec
    | PlatformerGameSpec;


export interface BaseGameSpec {
    schema_version:
        "1.0";

    metadata:
        MetadataSpec;

    generation:
        GenerationSpec;

    assets:
        AssetsSpec;
}


export interface EndlessRunnerGameSpec
    extends BaseGameSpec
{
    game:
        EndlessRunnerGameSettings;

    controls:
        EndlessRunnerControlsSpec;

    player:
        EndlessRunnerPlayerSpec;

    runner:
        RunnerSpec;
}


export interface PlatformerGameSpec
    extends BaseGameSpec
{
    game:
        PlatformerGameSettings;

    controls:
        PlatformerControlsSpec;

    player:
        PlatformerPlayerSpec;

    platformer:
        PlatformerSpec;
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

export type GameGenre =
    | "endless_runner"
    | "platformer";


export type GameSettings =
    | EndlessRunnerGameSettings
    | PlatformerGameSettings;


export interface EndlessRunnerGameSettings {
    genre:
        "endless_runner";

    orientation:
        "landscape" |
        "portrait";
}


export interface PlatformerGameSettings {
    genre:
        "platformer";

    /*
     * Первый platformer template делаем только landscape.
     * Portrait можно добавить позже осознанно.
     */
    orientation:
        "landscape";
}


export type ControlsSpec =
    | EndlessRunnerControlsSpec
    | PlatformerControlsSpec;


export interface EndlessRunnerControlsSpec {
    jump:
        JumpControl[];
}


export interface PlatformerControlsSpec {
    move_left:
        MoveLeftControl[];

    move_right:
        MoveRightControl[];

    jump:
        JumpControl[];
}


export type JumpControl =
    | "keyboard_space"
    | "keyboard_up"
    | "pointer";


export type MoveLeftControl =
    | "keyboard_a"
    | "keyboard_left";


export type MoveRightControl =
    | "keyboard_d"
    | "keyboard_right";


export type PlayerSpec =
    | EndlessRunnerPlayerSpec
    | PlatformerPlayerSpec;


export interface EndlessRunnerPlayerSpec {
    movement: {
        jump_force:
            number;
    };
}


export interface PlatformerPlayerSpec {
    movement: {
        move_speed:
            number;

        jump_force:
            number;
    };
}


export interface RunnerSpec {
    world_speed:
        number;

    obstacle_spawn_interval_ms:
        number;

    speed_increase_per_second:
        number;
}


export interface PlatformerSpec {
    /*
     * Approximate world width in pixels.
     */
    level_length:
        number;

    platform_gap_min:
        number;

    platform_gap_max:
        number;

    platform_width_min:
        number;

    platform_width_max:
        number;

    /*
     * Maximum vertical difference generated between
     * neighboring platform segments.
     */
    platform_height_variation:
        number;

    /*
     * Normalized [0..1] densities used by the deterministic
     * level generator.
     */
    enemy_density:
        number;

    hazard_density:
        number;

    collectible_density:
        number;
}


export function isEndlessRunnerGameSpec(
    spec:
        GameSpec
): spec is EndlessRunnerGameSpec {
    return spec.game.genre ===
        "endless_runner";
}


export function isPlatformerGameSpec(
    spec:
        GameSpec
): spec is PlatformerGameSpec {
    return spec.game.genre ===
        "platformer";
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


