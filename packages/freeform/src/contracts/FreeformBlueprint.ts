
import type {
    AssetPlanItem
} from "./AssetPlan.js";

export interface FreeformBlueprint {
    schemaVersion: "1.0";

    id: string;
    title: string;
    pitch: string;

    target: "web" | "yandex";

    technology: {
        engine: "phaser";
        language: "typescript";
    };

    viewport: {
        width: number;
        height: number;
        orientation: "landscape" | "portrait";
    };

    controls: Array<{
        action: string;
        input: string;
        description: string;
    }>;

    mechanics: Array<{
        id: string;
        rules: string[];
        failureModes: string[];
    }>;

    scenes: Array<{
        id: string;
        purpose: string;
        transitions: string[];
    }>;

    visualStyle: {
        style: string;
        paletteNotes: string;
        camera: string;
    };

    assets: AssetPlanItem[];

    acceptance: Array<{
        id: string;
        scenario: string;
        expected: string;
    }>;

    constraints: {
        offlineRuntime: boolean;
        noRemoteCode: true;
        scope: "small-2d";
    };
}
