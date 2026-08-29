import {
    OpenAICompatibleProvider,
    OpenRouterProvider,
    type AIProvider
} from "@game-factory/ai";

import type {
    GameFactoryConfig
} from "@game-factory/config";

export interface ResolvedAIProvider {
    provider:
        AIProvider;

    model:
        string;
}

export function resolveAIProvider(
    config:
        GameFactoryConfig
): ResolvedAIProvider {
    const ai =
        config.ai;

    if (
        ai.provider ===
        "disabled"
    ) {
        throw new Error(
            "AI is disabled. Set GAME_FACTORY_AI_PROVIDER."
        );
    }

    if (!ai.model) {
        throw new Error(
            "GAME_FACTORY_AI_MODEL is required"
        );
    }

    switch (
        ai.provider
    ) {
        case "openrouter": {
            if (!ai.apiKey) {
                throw new Error(
                    "GAME_FACTORY_AI_API_KEY is required for OpenRouter"
                );
            }

            return {
                provider:
                    new OpenRouterProvider({
                        apiKey:
                            ai.apiKey,

                        timeoutMs:
                            ai.timeoutMs,

                        siteUrl:
                            ai.siteUrl,

                        appName:
                            ai.appName
                    }),

                model:
                    ai.model
            };
        }

        case "openai-compatible": {
            if (!ai.baseUrl) {
                throw new Error(
                    "GAME_FACTORY_AI_BASE_URL is required for openai-compatible provider"
                );
            }

            return {
                provider:
                    new OpenAICompatibleProvider({
                        id:
                            "openai-compatible",

                        baseUrl:
                            ai.baseUrl,

                        apiKey:
                            ai.apiKey,

                        timeoutMs:
                            ai.timeoutMs
                    }),

                model:
                    ai.model
            };
        }
    }
}