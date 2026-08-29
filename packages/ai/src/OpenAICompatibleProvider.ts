import {
    AIError,
    type AIProvider,
    type AIRequest,
    type AIResponse
} from "./index.js";

export interface OpenAICompatibleProviderOptions {
    id?:
        string;

    baseUrl:
        string;

    chatCompletionsPath?:
        string;

    apiKey?:
        string;

    timeoutMs?:
        number;

    headers?:
        Record<string, string>;

    bodyExtras?:
        Record<string, unknown>;
}

interface ChatCompletionResponseDto {
    model?:
        string;

    choices:
        Array<{
            message: {
                content:
                    string;
            };
        }>;

    usage?: {
        prompt_tokens?:
            number;

        completion_tokens?:
            number;

        total_tokens?:
            number;
    };
}

export class OpenAICompatibleProvider
    implements AIProvider
{
    readonly id:
        string;

    private readonly baseUrl:
        string;

    private readonly chatCompletionsPath:
        string;

    private readonly apiKey?:
        string;

    private readonly timeoutMs:
        number;

    private readonly customHeaders:
        Record<string, string>;

    private readonly bodyExtras:
        Record<string, unknown>;

    constructor(
        options:
            OpenAICompatibleProviderOptions
    ) {
        this.id =
            options.id ??
            "openai-compatible";

        this.baseUrl =
            ensureTrailingSlash(
                options.baseUrl
            );

        this.chatCompletionsPath =
            options.chatCompletionsPath ??
            "chat/completions";

        this.apiKey =
            options.apiKey;

        this.timeoutMs =
            options.timeoutMs ??
            60_000;

        this.customHeaders =
            options.headers ??
            {};

        this.bodyExtras =
            options.bodyExtras ??
            {};
    }

    async generate<T>(
        request:
            AIRequest
    ): Promise<AIResponse<T>> {
        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () =>
                    controller.abort(),
                this.timeoutMs
            );

        try {
            const response =
                await fetch(
                    this.createUrl(),
                    {
                        method:
                            "POST",

                        headers:
                            this.createHeaders(),

                        body:
                            JSON.stringify(
                                createRequestBody(
                                    request,
                                    this.bodyExtras
                                )
                            ),

                        signal:
                            controller.signal
                    }
                );

            if (!response.ok) {
                const body =
                    await safeReadText(
                        response
                    );

                throw new AIError(
                    "request_failed",

                    createHttpErrorMessage(
                        response.status,
                        body
                    ),

                    this.id
                );
            }

            const raw:
                unknown =
                await response.json();

            const parsed =
                parseResponse(
                    raw
                );

            const content =
                parsed.choices[0]!
                    .message.content;

            const data =
                parseContent<T>(
                    content,
                    request,
                    this.id
                );

            return {
                data,

                provider:
                    this.id,

                model:
                    parsed.model ??
                    request.model,

                rawText:
                    content,

                usage:
                    parsed.usage
                        ? {
                            inputTokens:
                                parsed.usage
                                    .prompt_tokens,

                            outputTokens:
                                parsed.usage
                                    .completion_tokens,

                            totalTokens:
                                parsed.usage
                                    .total_tokens
                        }
                        : undefined
            };
        } catch (error) {
            if (
                error instanceof
                AIError
            ) {
                throw error;
            }

            if (
                isAbortError(
                    error
                )
            ) {
                throw new AIError(
                    "timeout",

                    `AI request timed out after ${this.timeoutMs}ms`,

                    this.id,

                    {
                        cause:
                            error
                    }
                );
            }

            throw new AIError(
                "request_failed",

                error instanceof Error
                    ? error.message
                    : "AI request failed",

                this.id,

                {
                    cause:
                        error
                }
            );
        } finally {
            clearTimeout(
                timeout
            );
        }
    }

    private createUrl():
        string
    {
        return new URL(
            this.chatCompletionsPath,
            this.baseUrl
        ).toString();
    }

    private createHeaders():
        Record<string, string>
    {
        const headers:
            Record<string, string> = {
            "content-type":
                "application/json",

            accept:
                "application/json",

            ...this.customHeaders
        };

        if (this.apiKey) {
            headers.authorization =
                `Bearer ${this.apiKey}`;
        }

        return headers;
    }
}

function createRequestBody(
    request:
        AIRequest,

    bodyExtras:
        Record<string, unknown>
): Record<string, unknown> {
    const body:
        Record<string, unknown> = {
        ...bodyExtras,

        model:
            request.model,

        messages:
            request.messages.map(
                (message) => ({
                    role:
                        message.role,

                    content:
                        message.content
                })
            ),

        stream:
            false
    };

    if (
        request.temperature !==
        undefined
    ) {
        body.temperature =
            request.temperature;
    }

    if (
        request.maxTokens !==
        undefined
    ) {
        /*
         * max_tokens remains widely
         * supported by OpenAI-compatible
         * APIs, including OpenRouter.
         */
        body.max_tokens =
            request.maxTokens;
    }

    if (
        request.structuredOutput
    ) {
        body.response_format = {
            type:
                "json_schema",

            json_schema: {
                name:
                    request
                        .structuredOutput
                        .name,

                strict:
                    true,

                schema:
                    request
                        .structuredOutput
                        .schema
            }
        };
    }

    return body;
}

function parseContent<T>(
    content:
        string,

    request:
        AIRequest,

    provider:
        string
): T {
    if (
        !request.structuredOutput
    ) {
        return content as T;
    }

    try {
        return JSON.parse(
            content
        ) as T;
    } catch (error) {
        throw new AIError(
            "structured_output_failed",

            "AI provider returned invalid JSON for structured output",

            provider,

            {
                cause:
                    error
            }
        );
    }
}

function parseResponse(
    value:
        unknown
): ChatCompletionResponseDto {
    if (!isRecord(value)) {
        throw new AIError(
            "invalid_response",
            "AI provider returned an invalid response"
        );
    }

    const choices =
        value.choices;

    if (
        !Array.isArray(
            choices
        ) ||
        choices.length === 0
    ) {
        throw new AIError(
            "invalid_response",
            "AI response contains no choices"
        );
    }

    const firstChoice =
        choices[0];

    if (
        !isRecord(
            firstChoice
        ) ||
        !isRecord(
            firstChoice.message
        ) ||
        typeof firstChoice
            .message.content !==
            "string"
    ) {
        throw new AIError(
            "invalid_response",
            "AI response contains no message content"
        );
    }

    const model =
        typeof value.model ===
        "string"
            ? value.model
            : undefined;

    const usage =
        parseUsage(
            value.usage
        );

    return {
        model,

        choices: [
            {
                message: {
                    content:
                        firstChoice
                            .message
                            .content
                }
            }
        ],

        usage
    };
}

function parseUsage(
    value:
        unknown
):
    | ChatCompletionResponseDto[
          "usage"
      ]
    | undefined
{
    if (
        value === undefined
    ) {
        return undefined;
    }

    if (!isRecord(value)) {
        return undefined;
    }

    return {
        prompt_tokens:
            optionalNumber(
                value.prompt_tokens
            ),

        completion_tokens:
            optionalNumber(
                value.completion_tokens
            ),

        total_tokens:
            optionalNumber(
                value.total_tokens
            )
    };
}

function optionalNumber(
    value:
        unknown
): number | undefined {
    return typeof value ===
        "number" &&
        Number.isFinite(value)
        ? value
        : undefined;
}

function isRecord(
    value:
        unknown
): value is
    Record<string, unknown>
{
    return (
        typeof value ===
            "object" &&
        value !== null &&
        !Array.isArray(
            value
        )
    );
}

function isAbortError(
    error:
        unknown
): boolean {
    return (
        error instanceof
            DOMException &&
        error.name ===
            "AbortError"
    );
}

async function safeReadText(
    response:
        Response
): Promise<string> {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

function createHttpErrorMessage(
    status:
        number,

    body:
        string
): string {
    const trimmed =
        body.trim();

    if (!trimmed) {
        return (
            `AI request failed: HTTP ${status}`
        );
    }

    const maximumLength =
        500;

    const safeBody =
        trimmed.length >
        maximumLength
            ? `${trimmed.slice(
                  0,
                  maximumLength
              )}...`
            : trimmed;

    return (
        `AI request failed: HTTP ${status}: ${safeBody}`
    );
}

function ensureTrailingSlash(
    value:
        string
): string {
    return value.endsWith(
        "/"
    )
        ? value
        : `${value}/`;
}