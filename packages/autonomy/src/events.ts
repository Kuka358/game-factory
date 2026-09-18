import {
    appendFile,
    mkdir,
    readFile
} from "node:fs/promises";

import {
    join,
    resolve
} from "node:path";

import {
    encodeStorageKey
} from "./storage.js";


export type AutonomyEventType =
    | "run_started"
    | "run_resumed"
    | "run_recovered"
    | "iteration_planned"
    | "iteration_replanned"
    | "checkpoint_created"
    | "checkpoint_restored"
    | "checkpoint_released"
    | "worker_attempt_started"
    | "worker_attempt_completed"
    | "verification_completed"
    | "repair_requested"
    | "escalation_requested"
    | "iteration_completed"
    | "run_completed"
    | "run_blocked"
    | "run_failed";


export interface AutonomyEvent {
    runId:
        string;

    type:
        AutonomyEventType;

    timestamp:
        string;

    iterationId?:
        string;

    attempt?:
        number;

    details?:
        Readonly<
            Record<string, unknown>
        >;
}


export interface EventJournal {
    append(
        event:
            AutonomyEvent
    ): Promise<void>;

    read(
        runId:
            string
    ): Promise<readonly AutonomyEvent[]>;
}


export class MemoryEventJournal
    implements EventJournal
{
    private readonly events:
        AutonomyEvent[] = [];


    async append(
        event:
            AutonomyEvent
    ): Promise<void> {
        this.events.push({
            ...event,

            details:
                event.details
                    ? {
                        ...event.details
                    }
                    : undefined
        });
    }


    async read(
        runId:
            string
    ): Promise<readonly AutonomyEvent[]> {
        return this.events
            .filter(
                event =>
                    event.runId ===
                    runId
            )
            .map(
                event => ({
                    ...event,

                    details:
                        event.details
                            ? {
                                ...event.details
                            }
                            : undefined
                })
            );
    }
}


export interface FileEventJournalOptions {
    directory:
        string;
}


export class FileEventJournal
    implements EventJournal
{
    private readonly directory:
        string;


    constructor(
        options:
            FileEventJournalOptions
    ) {
        this.directory =
            resolve(
                options.directory
            );
    }


    async append(
        event:
            AutonomyEvent
    ): Promise<void> {
        await mkdir(
            this.directory,
            {
                recursive:
                    true
            }
        );

        await appendFile(
            this.getJournalPath(
                event.runId
            ),
            `${JSON.stringify(
                event
            )}\n`,
            "utf8"
        );
    }


    async read(
        runId:
            string
    ): Promise<readonly AutonomyEvent[]> {
        let raw:
            string;

        try {
            raw =
                await readFile(
                    this.getJournalPath(
                        runId
                    ),
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
                return [];
            }

            throw error;
        }

        const lines =
            raw
                .split(
                    "\n"
                )
                .filter(
                    line =>
                        line.trim()
                            .length >
                        0
                );

        return lines.map(
            line => {
                const value:
                    unknown =
                    JSON.parse(
                        line
                    );

                if (
                    !isEvent(
                        value
                    )
                ) {
                    throw new Error(
                        `Invalid autonomy event in journal for run ${runId}`
                    );
                }

                return value;
            }
        );
    }


    private getJournalPath(
        runId:
            string
    ): string {
        return join(
            this.directory,
            `${encodeStorageKey(
                runId
            )}.events.ndjson`
        );
    }
}


function isEvent(
    value:
        unknown
): value is AutonomyEvent {
    if (
        typeof value !==
            "object" ||
        value ===
            null ||
        Array.isArray(
            value
        )
    ) {
        return false;
    }

    const candidate =
        value as Record<
            string,
            unknown
        >;

    return (
        typeof candidate.runId ===
            "string" &&
        typeof candidate.type ===
            "string" &&
        typeof candidate.timestamp ===
            "string"
    );
}


function isNodeError(
    value:
        unknown
): value is NodeJS.ErrnoException {
    return value instanceof
        Error;
}