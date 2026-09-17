import {
    mkdtemp,
    rm
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    FileEventJournal,
    MemoryEventJournal
} from "../src/index.js";


const event = {
    runId:
        "run-001",

    type:
        "run_started",

    timestamp:
        "2026-09-17T00:00:00.000Z",

    details: {
        goal:
            "Autonomous development"
    }
} as const;


describe(
    "EventJournal",
    () => {
        it(
            "records events in memory",
            async () => {
                const journal =
                    new MemoryEventJournal();

                await journal.append(
                    event
                );

                expect(
                    await journal.read(
                        "run-001"
                    )
                ).toEqual([
                    event
                ]);
            }
        );


        it(
            "appends and reads file events",
            async () => {
                const directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-events-"
                        )
                    );

                try {
                    const journal =
                        new FileEventJournal({
                            directory
                        });

                    await journal.append(
                        event
                    );

                    await journal.append({
                        runId:
                            "run-001",

                        type:
                            "run_completed",

                        timestamp:
                            "2026-09-17T00:01:00.000Z"
                    });

                    const events =
                        await journal.read(
                            "run-001"
                        );

                    expect(
                        events
                    ).toHaveLength(
                        2
                    );

                    expect(
                        events[0]?.type
                    ).toBe(
                        "run_started"
                    );

                    expect(
                        events[1]?.type
                    ).toBe(
                        "run_completed"
                    );
                } finally {
                    await rm(
                        directory,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );
    }
);