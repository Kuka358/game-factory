import {
    OpenAICompatibleProvider
} from "./OpenAICompatibleProvider.js";

export interface OpenRouterProviderOptions {
    apiKey:
        string;

    timeoutMs?:
        number;

    siteUrl?:
        string;

    appName?:
        string;
}

export class OpenRouterProvider
    extends OpenAICompatibleProvider
{
    constructor(
        options:
            OpenRouterProviderOptions
    ) {
        const headers:
            Record<string, string> = {};

        if (options.siteUrl) {
            headers["HTTP-Referer"] =
                options.siteUrl;
        }

        if (options.appName) {
            headers["X-Title"] =
                options.appName;
        }

        super({
            id:
                "openrouter",

            baseUrl:
                "https://openrouter.ai/api/v1/",

            apiKey:
                options.apiKey,

            timeoutMs:
                options.timeoutMs,

            headers,

            bodyExtras: {
                provider: {
                    require_parameters:
                        true,

                    allow_fallbacks:
                        true
                }
            }
        });
    }
}