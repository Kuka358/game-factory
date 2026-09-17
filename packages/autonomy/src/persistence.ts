import {
    mkdir,
    readFile,
    rename,
    writeFile
} from "node:fs/promises";

import {
    join,
    resolve
} from "node:path";

import type {
    AutonomousRun
} from "./state.js";

import {
    encodeStorageKey
} from "./storage.js";


export interface RunStore {
    save(
        run:
            AutonomousRun
    ): Promise<void>;

    load(
        runId:
            string
    ): Promise<AutonomousRun | null>;
}


export class MemoryRunStore
    implements RunStore
{
    private readonly runs =
        new Map<
            string,
            AutonomousRun
        >();


    async save(
        run:
            AutonomousRun
    ): Promise<void> {
        this.runs.set(
            run.id,
            cloneRun(
                run
            )
        );
    }


    async load(
        runId:
            string
    ): Promise<AutonomousRun | null> {
        const run =
            this.runs.get(
                runId
            );

        return run
            ? cloneRun(
                run
            )
            : null;
    }
}


export interface FileRunStoreOptions {
    directory:
        string;
}


export class FileRunStore
    implements RunStore
{
    private readonly directory:
        string;


    constructor(
        options:
            FileRunStoreOptions
    ) {
        this.directory =
            resolve(
                options.directory
            );
    }


    async save(
        run:
            AutonomousRun
    ): Promise<void> {
        await mkdir(
            this.directory,
            {
                recursive:
                    true
            }
        );

        const targetPath =
            this.getRunPath(
                run.id
            );

        const temporaryPath =
            `${targetPath}.${process.pid}.${Date.now()}.tmp`;

        const serialized =
            `${JSON.stringify(
                run,
                null,
                2
            )}\n`;

        await writeFile(
            temporaryPath,
            serialized,
            "utf8"
        );

        await rename(
            temporaryPath,
            targetPath
        );
    }


    async load(
        runId:
            string
    ): Promise<AutonomousRun | null> {
        const path =
            this.getRunPath(
                runId
            );

        let raw:
            string;

        try {
            raw =
                await readFile(
                    path,
                    "utf8"
                );
        } catch (error) {
            if (
                isNodeError(
                    error
                ) &&
                error.code ===
                    "ENOENT"
            ) {
                return null;
            }

            throw error;
        }

        return parseRunSnapshot(
            raw,
            path
        );
    }


    private getRunPath(
        runId:
            string
    ): string {
        return join(
            this.directory,
            `${encodeStorageKey(
                runId
            )}.json`
        );
    }
}


function cloneRun(
    run:
        AutonomousRun
): AutonomousRun {
    return JSON.parse(
        JSON.stringify(
            run
        )
    ) as AutonomousRun;
}


function parseRunSnapshot(
    raw:
        string,

    source:
        string
): AutonomousRun {
    let value:
        unknown;

    try {
        value =
            JSON.parse(
                raw
            );
    } catch {
        throw new Error(
            `Invalid autonomous run snapshot JSON: ${source}`
        );
    }

    if (
        !isRecord(
            value
        ) ||
        typeof value.id !==
            "string" ||
        typeof value.goal !==
            "string" ||
        typeof value.status !==
            "string" ||
        typeof value.currentIteration !==
            "number" ||
        typeof value.maxIterations !==
            "number" ||
        !Array.isArray(
            value.iterations
        )
    ) {
        throw new Error(
            `Invalid autonomous run snapshot: ${source}`
        );
    }

    return value as unknown as
        AutonomousRun;
}


function isRecord(
    value:
        unknown
): value is Record<string, unknown> {
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


function isNodeError(
    value:
        unknown
): value is NodeJS.ErrnoException {
    return value instanceof
        Error;
}