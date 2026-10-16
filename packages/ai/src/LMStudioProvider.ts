import {
    OpenAICompatibleProvider
} from "./OpenAICompatibleProvider.js";


export interface LMStudioProviderOptions {
    baseUrl?:
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


export class LMStudioProvider
    extends OpenAICompatibleProvider
{
    constructor(
        options:
            LMStudioProviderOptions = {}
    ) {
        super({
            id:
                "lm-studio",

            baseUrl:
                options.baseUrl ??
                "http://127.0.0.1:1234/v1/",

            apiKey:
                options.apiKey,

            timeoutMs:
                options.timeoutMs ??
                180_000,

            headers:
                options.headers,

            bodyExtras:
                options.bodyExtras
        });
    }
}