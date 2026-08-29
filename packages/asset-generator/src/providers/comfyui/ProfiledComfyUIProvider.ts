import type {
    ImageGeneratorIdentity,
    ImageGeneratorProvider,
    ImageGeneratorRequest
} from "../../ImageGeneratorProvider.js";

import type {
    GeneratedImage
} from "../../AssetGenerationTypes.js";

import {
    ComfyUIProvider
} from "./ComfyUIProvider.js";

import {
    ComfyUIWorkflowRegistry
} from "./ComfyUIWorkflowRegistry.js";

export interface ProfiledComfyUIProviderOptions {
    baseUrl?:
        string;

    registry:
        ComfyUIWorkflowRegistry;

    pollIntervalMs?:
        number;

    timeoutMs?:
        number;

    fetchImpl?:
        typeof fetch;
}

export class ProfiledComfyUIProvider
    implements ImageGeneratorProvider
{
    readonly id =
        "comfyui";

    /**
     * Only required for backwards compatibility with
     * ImageGeneratorProvider. Actual model comes from
     * the resolved workflow.
     */
    readonly model =
        "profiled";

    private readonly registry:
        ComfyUIWorkflowRegistry;

    private readonly baseUrl?:
        string;

    private readonly pollIntervalMs?:
        number;

    private readonly timeoutMs?:
        number;

    private readonly fetchImpl?:
        typeof fetch;

    private readonly providers =
        new Map<
            string,
            ComfyUIProvider
        >();

    constructor(
        options:
            ProfiledComfyUIProviderOptions
    ) {
        this.registry =
            options.registry;

        this.baseUrl =
            options.baseUrl;

        this.pollIntervalMs =
            options.pollIntervalMs;

        this.timeoutMs =
            options.timeoutMs;

        this.fetchImpl =
            options.fetchImpl;
    }

    getIdentity(
        request:
            ImageGeneratorRequest
    ): ImageGeneratorIdentity {
        const workflow =
            this.registry.resolve(
                request.profile
            );

        return {
            provider:
                this.id,

            model:
                workflow.model,

            configurationId:
                createConfigurationId(
                    workflow.profile,
                    workflow.workflowPath,
                    workflow.outputNodeId
                )
        };
    }

    async generate(
        request:
            ImageGeneratorRequest
    ): Promise<GeneratedImage> {
        const workflow =
            this.registry.resolve(
                request.profile
            );

        const provider =
            this.resolveProvider(
                workflow.profile,
                workflow.workflowPath,
                workflow.model,
                workflow.outputNodeId,
                workflow.timeoutMs
            );

        return provider.generate(
            request
        );
    }

    private resolveProvider(
        profile:
            string,

        workflowPath:
            string,

        model:
            string,

        outputNodeId:
            string | undefined,

        workflowTimeoutMs:
            number | undefined
    ): ComfyUIProvider {
        const key =
            createConfigurationId(
                profile,
                workflowPath,
                outputNodeId
            );

        const existing =
            this.providers.get(
                key
            );

        if (
            existing
        ) {
            return existing;
        }

        const provider =
            new ComfyUIProvider({
                baseUrl:
                    this.baseUrl,

                model,

                workflowPath,

                outputNodeId,

                pollIntervalMs:
                    this.pollIntervalMs,

                timeoutMs:
                    workflowTimeoutMs ??
                    this.timeoutMs,

                fetchImpl:
                    this.fetchImpl
            });

        this.providers.set(
            key,
            provider
        );

        return provider;
    }
}

function createConfigurationId(
    profile:
        string,

    workflowPath:
        string,

    outputNodeId:
        string | undefined
): string {
    return [
        profile,
        workflowPath,
        outputNodeId ??
            "auto-output"
    ].join(
        ":"
    );
}