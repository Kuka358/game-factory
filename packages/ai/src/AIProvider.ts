export type AIMessageRole =
    | "system"
    | "user"
    | "assistant";

export interface AIMessage {
    role:
        AIMessageRole;

    content:
        string;
}

export type AIJsonSchema =
    Record<string, unknown>;

export interface AIStructuredOutput {
    name:
        string;

    schema:
        AIJsonSchema;
}

export interface AIRequest {
    model:
        string;

    messages:
        readonly AIMessage[];

    temperature?:
        number;

    maxTokens?:
        number;

    structuredOutput?:
        AIStructuredOutput;
}

export interface AIUsage {
    inputTokens?:
        number;

    outputTokens?:
        number;

    totalTokens?:
        number;
}

export interface AIResponse<T> {
    data:
        T;

    provider:
        string;

    model:
        string;

    usage?:
        AIUsage;

    rawText?:
        string;
}

export interface AIProvider {
    readonly id:
        string;

    generate<T>(
        request:
            AIRequest
    ): Promise<AIResponse<T>>;
}