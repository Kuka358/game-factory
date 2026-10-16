
export type AssetProfile =
    | "character"
    | "npc"
    | "item"
    | "obstacle"
    | "background"
    | "ui"
    | "tileset";

export interface AssetPlanItem {
    id: string;
    role: string;
    description: string;
    profile: AssetProfile;

    width: number;
    height: number;

    transparent: boolean;
    optional: boolean;

    filename: string;
}
