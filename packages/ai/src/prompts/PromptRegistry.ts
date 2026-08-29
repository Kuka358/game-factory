export interface PromptDefinition {
    id:
        string;

    version:
        string;

    content:
        string;
}

export interface PromptRegistry {
    get(
        id: string,
        version: string
    ): Promise<PromptDefinition>;
}