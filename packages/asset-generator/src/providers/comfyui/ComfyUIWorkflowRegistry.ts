import type {
    AssetGenerationProfile
} from "@game-factory/assets";

export interface ComfyUIWorkflowProfile {
    profile:
        AssetGenerationProfile;

    workflowPath:
        string;

    /**
     * Optional explicit SaveImage node.
     */
    outputNodeId?:
        string;

    /**
     * Metadata model identifier.
     *
     * The actual checkpoint may still be encoded
     * inside the ComfyUI workflow.
     */
    model:
        string;

    timeoutMs?:
        number;
}

export interface ComfyUIWorkflowRegistryOptions {
    workflows:
        readonly ComfyUIWorkflowProfile[];

    /**
     * Optional fallback workflow.
     *
     * During migration we will point this at the
     * currently working universal workflow.
     */
    fallback?:
        ComfyUIWorkflowProfile;
}

export class ComfyUIWorkflowRegistry {
    private readonly workflows =
        new Map<
            AssetGenerationProfile,
            ComfyUIWorkflowProfile
        >();

    private readonly fallback?:
        ComfyUIWorkflowProfile;

    constructor(
        options:
            ComfyUIWorkflowRegistryOptions
    ) {
        for (
            const workflow of
            options.workflows
        ) {
            if (
                this.workflows.has(
                    workflow.profile
                )
            ) {
                throw new Error(
                    `Duplicate ComfyUI workflow for profile "${workflow.profile}"`
                );
            }

            validateWorkflow(
                workflow
            );

            this.workflows.set(
                workflow.profile,
                {
                    ...workflow
                }
            );
        }

        if (
            options.fallback
        ) {
            validateWorkflow(
                options.fallback
            );

            this.fallback = {
                ...options.fallback
            };
        }
    }

    resolve(
        profile:
            AssetGenerationProfile
    ): ComfyUIWorkflowProfile {
        const workflow =
            this.workflows.get(
                profile
            );

        if (
            workflow
        ) {
            return workflow;
        }

        if (
            this.fallback
        ) {
            return {
                ...this.fallback,

                /*
                 * The requested semantic profile
                 * remains visible to callers.
                 */
                profile
            };
        }

        throw new Error(
            `No ComfyUI workflow configured for asset profile "${profile}"`
        );
    }

    has(
        profile:
            AssetGenerationProfile
    ): boolean {
        return (
            this.workflows.has(
                profile
            ) ||
            this.fallback !==
                undefined
        );
    }
}

function validateWorkflow(
    workflow:
        ComfyUIWorkflowProfile
): void {
    if (
        !workflow.workflowPath.trim()
    ) {
        throw new Error(
            `ComfyUI workflow path for "${workflow.profile}" cannot be empty`
        );
    }

    if (
        !workflow.model.trim()
    ) {
        throw new Error(
            `ComfyUI model for "${workflow.profile}" cannot be empty`
        );
    }

    if (
        workflow.timeoutMs !==
            undefined &&
        workflow.timeoutMs <=
            0
    ) {
        throw new Error(
            `ComfyUI timeout for "${workflow.profile}" must be positive`
        );
    }
}