export type PipelineProgressStage =
    | "game_design"
    | "spec_generated"
    | "template_selected"
    | "assets_resolving"
    | "project_generating"
    | "testing"
    | "platform_export"
    | "completed";

export interface PipelineProgress {
    stage:
        PipelineProgressStage;

    message?:
        string;
}

export type PipelineProgressListener =
    (
        progress:
            PipelineProgress
    ) => void;