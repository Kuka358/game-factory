export type ComfyUIWorkflow =
    Record<
        string,
        ComfyUINode
    >;

export interface ComfyUINode {
    class_type:
        string;

    inputs:
        Record<
            string,
            unknown
        >;

    _meta?:
        Record<
            string,
            unknown
        >;
}

export const COMFY_PLACEHOLDERS = {
    prompt:
        "__GF_PROMPT__",

    negativePrompt:
        "__GF_NEGATIVE_PROMPT__",

    width:
        "__GF_WIDTH__",

    height:
        "__GF_HEIGHT__",

    seed:
        "__GF_SEED__",

    filenamePrefix:
        "__GF_FILENAME_PREFIX__"
} as const;