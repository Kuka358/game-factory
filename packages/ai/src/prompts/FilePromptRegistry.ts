import {
    readFile
} from "node:fs/promises";

import {
    resolve,
    sep
} from "node:path";

import {
    fileURLToPath
} from "node:url";

import type {
    PromptDefinition,
    PromptRegistry
} from "./PromptRegistry.js";

export interface FilePromptRegistryOptions {
    rootPath?:
        string;
}

export class FilePromptRegistry
    implements PromptRegistry
{
    private readonly rootPath:
        string;

    constructor(
        options:
            FilePromptRegistryOptions = {}
    ) {
        this.rootPath =
            options.rootPath ??
            getDefaultPromptRoot();
    }

    async get(
        id: string,
        version: string
    ): Promise<PromptDefinition> {
        validateSegment(
            id,
            "prompt id"
        );

        validateSegment(
            version,
            "prompt version"
        );

        const promptPath =
            resolve(
                this.rootPath,
                id,
                version,
                "system.md"
            );

        const allowedRoot =
            resolve(
                this.rootPath
            ) + sep;

        if (
            !promptPath.startsWith(
                allowedRoot
            )
        ) {
            throw new Error(
                "Invalid prompt path"
            );
        }

        let content:
            string;

        try {
            content =
                await readFile(
                    promptPath,
                    "utf8"
                );
        } catch (
            error
        ) {
            throw new Error(
                `Prompt "${id}/${version}" could not be loaded from ${promptPath}`,

                {
                    cause:
                        error
                }
            );
        }

        return {
            id,
            version,
            content:
                content.trim()
        };
    }
}

function getDefaultPromptRoot():
    string
{
    return fileURLToPath(
        new URL(
            "../../prompts/",
            import.meta.url
        )
    );
}

function validateSegment(
    value: string,
    name: string
): void {
    if (
        !/^[a-z0-9][a-z0-9_-]*$/i
            .test(value)
    ) {
        throw new Error(
            `Invalid ${name}: "${value}"`
        );
    }
}
