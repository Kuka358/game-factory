import {
    readFile
} from "node:fs/promises";

import type {
    GeneratedImage
} from "../../AssetGenerationTypes.js";

import type {
    ImageGeneratorProvider,
    ImageGeneratorRequest
} from "../../ImageGeneratorProvider.js";

import {
    COMFY_PLACEHOLDERS,

    type ComfyUIWorkflow
} from "./ComfyUIWorkflow.js";

export interface ComfyUIProviderOptions {
    baseUrl?:
        string;

    model:
        string;

    workflowPath?:
        string;

    workflow?:
        ComfyUIWorkflow;

    outputNodeId?:
        string;

    pollIntervalMs?:
        number;

    timeoutMs?:
        number;

    fetchImpl?:
        typeof fetch;
}

interface QueuePromptResponse {
    prompt_id?:
        string;

    number?:
        number;

    node_errors?:
        Record<
            string,
            unknown
        >;

    error?:
        unknown;
}

interface ComfyUIImageOutput {
    filename:
        string;

    subfolder?:
        string;

    type?:
        string;
}

interface ComfyUINodeOutput {
    images?:
        ComfyUIImageOutput[];
}

interface ComfyUIHistoryEntry {
    outputs?:
        Record<
            string,
            ComfyUINodeOutput
        >;

    status?:
        Record<
            string,
            unknown
        >;
}

type ComfyUIHistoryResponse =
    Record<
        string,
        ComfyUIHistoryEntry
    >;

export class ComfyUIProvider
    implements ImageGeneratorProvider
{
    readonly id =
        "comfyui";

    readonly model:
        string;

    private readonly configurationId:
        string;

    private readonly baseUrl:
        string;

    private readonly workflowPath?:
        string;

    private readonly workflow?:
        ComfyUIWorkflow;

    private readonly outputNodeId?:
        string;

    private readonly pollIntervalMs:
        number;

    private readonly timeoutMs:
        number;

    private readonly fetchImpl:
        typeof fetch;

    constructor(
        options:
            ComfyUIProviderOptions
    ) {
        this.model =
            options.model;

        this.configurationId =
            [
                options.workflowPath ??
                    "inline-workflow",

                options.outputNodeId ??
                    "auto-output"
            ].join(
                ":"
            );

        this.baseUrl =
            normalizeBaseUrl(
                options.baseUrl ??
                    "http://127.0.0.1:8188"
            );

        this.workflowPath =
            options.workflowPath;

        this.workflow =
            options.workflow;

        this.outputNodeId =
            options.outputNodeId;

        this.pollIntervalMs =
            options.pollIntervalMs ??
            500;

        this.timeoutMs =
            options.timeoutMs ??
            180_000;

        this.fetchImpl =
            options.fetchImpl ??
            fetch;

        if (
            !this.model.trim()
        ) {
            throw new Error(
                "ComfyUIProvider model cannot be empty"
            );
        }

        if (
            !this.workflow &&
            !this.workflowPath
        ) {
            throw new Error(
                "ComfyUIProvider requires workflow or workflowPath"
            );
        }

        if (
            this.pollIntervalMs <=
            0
        ) {
            throw new Error(
                "ComfyUIProvider pollIntervalMs must be positive"
            );
        }

        if (
            this.timeoutMs <=
            0
        ) {
            throw new Error(
                "ComfyUIProvider timeoutMs must be positive"
            );
        }
    }

    async generate(
        request:
            ImageGeneratorRequest
    ): Promise<GeneratedImage> {
        const template =
            await this.loadWorkflow();

        const prepared =
            applyWorkflowParameters(
                template,
                request
            );

        const workflow =
            prepared.workflow;

        const promptId =
            await this.queuePrompt(
                workflow
            );

        const history =
            await this.waitForCompletion(
                promptId
            );

        const imageOutput =
            findImageOutput(
                history,
                this.outputNodeId
            );

        const image =
            await this.downloadImage(
                imageOutput
            );

        return {
            bytes:
                image.bytes,

            mimeType:
                image.mimeType,

            /*
             * In Stage 11.3 we will inspect
             * the returned image bytes and
             * validate the actual dimensions.
             *
             * For now these are the requested
             * workflow dimensions.
             */
            width:
                request.width,

            height:
                request.height,

            seed:
                prepared.seed
        };
    }

    private async loadWorkflow():
        Promise<ComfyUIWorkflow>
    {
        if (
            this.workflow
        ) {
            return cloneValue(
                this.workflow
            );
        }

        if (
            !this.workflowPath
        ) {
            throw new Error(
                "ComfyUI workflow is not configured"
            );
        }

        const source =
            await readFile(
                this.workflowPath,
                "utf8"
            );

        let parsed:
            unknown;

        try {
            parsed =
                JSON.parse(
                    source
                );
        } catch (
            error
        ) {
            throw new Error(
                `Failed to parse ComfyUI workflow: ${this.workflowPath}`,
                {
                    cause:
                        error
                }
            );
        }

        assertWorkflow(
            parsed
        );

        return parsed;
    }

    private async queuePrompt(
        workflow:
            ComfyUIWorkflow
    ): Promise<string> {
        const response =
            await this.fetchImpl(
                `${this.baseUrl}/prompt`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            prompt:
                                workflow
                        })
                }
            );

        const body =
            await readJsonResponse(
                response
            );

        if (
            !response.ok
        ) {
            throw new Error(
                [
                    "ComfyUI rejected workflow.",
                    `HTTP ${response.status}.`,
                    stringifyForError(
                        body
                    )
                ].join(
                    " "
                )
            );
        }

        const value =
            body as
                QueuePromptResponse;

        if (
            value.node_errors &&
            Object.keys(
                value.node_errors
            ).length >
                0
        ) {
            throw new Error(
                [
                    "ComfyUI workflow contains node errors:",
                    stringifyForError(
                        value.node_errors
                    )
                ].join(
                    " "
                )
            );
        }

        if (
            typeof value.prompt_id !==
            "string" ||
            !value.prompt_id
        ) {
            throw new Error(
                `ComfyUI did not return prompt_id: ${stringifyForError(body)}`
            );
        }

        return value.prompt_id;
    }

    private async waitForCompletion(
        promptId:
            string
    ): Promise<ComfyUIHistoryEntry> {
        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            this.timeoutMs
        ) {
            const response =
                await this.fetchImpl(
                    `${this.baseUrl}/history/${encodeURIComponent(
                        promptId
                    )}`
                );

            if (
                !response.ok
            ) {
                throw new Error(
                    `ComfyUI history request failed with HTTP ${response.status}`
                );
            }

            const body =
                await readJsonResponse(
                    response
                );

            const history =
                body as
                    ComfyUIHistoryResponse;

            const entry =
                history[
                    promptId
                ];

            if (
                entry
            ) {
                assertExecutionSucceeded(
                    entry
                );

                if (
                    entry.outputs &&
                    Object.keys(
                        entry.outputs
                    ).length >
                        0
                ) {
                    return entry;
                }
            }

            await delay(
                this.pollIntervalMs
            );
        }

        throw new Error(
            `ComfyUI generation timed out after ${this.timeoutMs}ms`
        );
    }

    private async downloadImage(
        output:
            ComfyUIImageOutput
    ): Promise<{
        bytes:
            Uint8Array;

        mimeType:
            string;
    }> {
        const params =
            new URLSearchParams();

        params.set(
            "filename",
            output.filename
        );

        params.set(
            "subfolder",
            output.subfolder ??
                ""
        );

        params.set(
            "type",
            output.type ??
                "output"
        );

        const response =
            await this.fetchImpl(
                `${this.baseUrl}/view?${params.toString()}`
            );

        if (
            !response.ok
        ) {
            throw new Error(
                `ComfyUI image download failed with HTTP ${response.status}`
            );
        }

        const bytes =
            new Uint8Array(
                await response.arrayBuffer()
            );

        if (
            bytes.byteLength ===
            0
        ) {
            throw new Error(
                "ComfyUI returned an empty image"
            );
        }

        const mimeType =
            normalizeMimeType(
                response.headers.get(
                    "content-type"
                )
            );

        return {
            bytes,
            mimeType
        };
    }

    getIdentity(): {
        provider:
            string;

        model:
            string;

        configurationId:
            string;
    } {
        return {
            provider:
                this.id,

            model:
                this.model,

            configurationId:
                [
                    this.workflowPath ??
                        "inline-workflow",

                    this.outputNodeId ??
                        "auto-output"
                ].join(
                    ":"
                )
        };
    }
}

function applyWorkflowParameters(
    workflow:
        ComfyUIWorkflow,

    request:
        ImageGeneratorRequest
): {
    workflow:
        ComfyUIWorkflow;

    seed:
        number;
} {
    const seed =
        request.seed ??
        randomSeed();

    const replacements =
        new Map<
            string,
            unknown
        >([
            [
                COMFY_PLACEHOLDERS
                    .prompt,
                request.prompt
            ],

            [
                COMFY_PLACEHOLDERS
                    .negativePrompt,
                request
                    .negativePrompt ??
                    ""
            ],

            [
                COMFY_PLACEHOLDERS
                    .width,
                request.width
            ],

            [
                COMFY_PLACEHOLDERS
                    .height,
                request.height
            ],

            [
                COMFY_PLACEHOLDERS
                    .seed,
                seed
            ],

            [
                COMFY_PLACEHOLDERS
                    .filenamePrefix,

                `game_factory_${Date.now()}`
            ]
        ]);

    return {
        workflow:
            replacePlaceholders(
                cloneValue(
                    workflow
                ),
                replacements
            ) as ComfyUIWorkflow,

        seed
    };
}

function replacePlaceholders(
    value:
        unknown,

    replacements:
        ReadonlyMap<
            string,
            unknown
        >
): unknown {
    if (
        typeof value ===
        "string"
    ) {
        /*
        * Exact placeholder replacement preserves the
        * original value type.
        *
        * This is important for numeric ComfyUI inputs:
        *
        * "__GF_SEED__" -> 123
        * "__GF_WIDTH__" -> 512
        *
        * rather than strings "123" / "512".
        */
        if (
            replacements.has(
                value
            )
        ) {
            return replacements.get(
                value
            );
        }

        /*
        * Text inputs may embed placeholders inside a larger
        * prompt:
        *
        * "__GF_PROMPT__, exactly one character..."
        *
        * Previously these placeholders were never replaced,
        * causing ComfyUI to receive the literal token
        * "__GF_PROMPT__" instead of the requested subject.
        */
        let result =
            value;

        for (
            const [
                placeholder,
                replacement
            ] of replacements
        ) {
            if (
                !result.includes(
                    placeholder
                )
            ) {
                continue;
            }

            result =
                result
                    .split(
                        placeholder
                    )
                    .join(
                        String(
                            replacement
                        )
                    );
        }

        return result;
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return value.map(
            (
                item
            ) =>
                replacePlaceholders(
                    item,
                    replacements
                )
        );
    }

    if (
        isRecord(
            value
        )
    ) {
        const result:
            Record<
                string,
                unknown
            > = {};

        for (
            const [
                key,
                child
            ] of
            Object.entries(
                value
            )
        ) {
            result[
                key
            ] =
                replacePlaceholders(
                    child,
                    replacements
                );
        }

        return result;
    }

    return value;
}

function findImageOutput(
    history:
        ComfyUIHistoryEntry,

    outputNodeId?:
        string
): ComfyUIImageOutput {
    const outputs =
        history.outputs;

    if (
        !outputs
    ) {
        throw new Error(
            "ComfyUI history contains no outputs"
        );
    }

    if (
        outputNodeId
    ) {
        const output =
            outputs[
                outputNodeId
            ];

        const image =
            output
                ?.images
                ?.[0];

        if (
            !image
        ) {
            throw new Error(
                `ComfyUI output node ${outputNodeId} did not produce an image`
            );
        }

        return validateImageOutput(
            image
        );
    }

    for (
        const output of
        Object.values(
            outputs
        )
    ) {
        const image =
            output.images
                ?.[0];

        if (
            image
        ) {
            return validateImageOutput(
                image
            );
        }
    }

    throw new Error(
        "ComfyUI workflow completed without image output"
    );
}

function validateImageOutput(
    value:
        ComfyUIImageOutput
): ComfyUIImageOutput {
    if (
        typeof value.filename !==
            "string" ||
        !value.filename
    ) {
        throw new Error(
            "ComfyUI image output does not contain filename"
        );
    }

    return {
        filename:
            value.filename,

        subfolder:
            value.subfolder ??
            "",

        type:
            value.type ??
            "output"
    };
}

function assertExecutionSucceeded(
    entry:
        ComfyUIHistoryEntry
): void {
    const status =
        entry.status;

    if (
        !status
    ) {
        return;
    }

    const statusString =
        typeof status.status_str ===
            "string"
            ? status.status_str
            : undefined;

    const completed =
        typeof status.completed ===
            "boolean"
            ? status.completed
            : undefined;

    if (
        statusString ===
            "error" ||
        statusString ===
            "failed"
    ) {
        throw new Error(
            `ComfyUI execution failed: ${stringifyForError(status)}`
        );
    }

    /*
     * Some ComfyUI versions expose
     * completed=false while execution
     * is still running.
     *
     * That is not an error.
     */
    void completed;
}

function assertWorkflow(
    value:
        unknown
): asserts value is
    ComfyUIWorkflow
{
    if (
        !isRecord(
            value
        )
    ) {
        throw new Error(
            "ComfyUI workflow must be an object"
        );
    }

    const entries =
        Object.entries(
            value
        );

    if (
        entries.length ===
        0
    ) {
        throw new Error(
            "ComfyUI workflow cannot be empty"
        );
    }

    for (
        const [
            nodeId,
            node
        ] of
        entries
    ) {
        if (
            !isRecord(
                node
            ) ||
            typeof node.class_type !==
                "string" ||
            !isRecord(
                node.inputs
            )
        ) {
            throw new Error(
                `Invalid ComfyUI API workflow node: ${nodeId}`
            );
        }
    }
}

function normalizeBaseUrl(
    value:
        string
): string {
    return value.replace(
        /\/+$/,
        ""
    );
}

function normalizeMimeType(
    value:
        string | null
): string {
    if (
        !value
    ) {
        return "image/png";
    }

    return value
        .split(
            ";",
            1
        )[0]
        ?.trim() ||
        "image/png";
}

async function readJsonResponse(
    response:
        Response
): Promise<unknown> {
    const text =
        await response.text();

    if (
        !text
    ) {
        return {};
    }

    try {
        return JSON.parse(
            text
        );
    } catch {
        return {
            raw:
                text
        };
    }
}

function isRecord(
    value:
        unknown
): value is
    Record<
        string,
        unknown
    > {
    return (
        typeof value ===
            "object" &&
        value !==
            null &&
        !Array.isArray(
            value
        )
    );
}

function cloneValue<T>(
    value:
        T
): T {
    return structuredClone(
        value
    );
}

function randomSeed():
    number {
    return Math.floor(
        Math.random() *
        2_147_483_647
    );
}

function delay(
    milliseconds:
        number
): Promise<void> {
    return new Promise(
        (
            resolve
        ) => {
            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
}

function stringifyForError(
    value:
        unknown
): string {
    try {
        return JSON.stringify(
            value
        );
    } catch {
        return String(
            value
        );
    }
}