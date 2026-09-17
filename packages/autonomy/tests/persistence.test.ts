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
    FileRunStore,
    MemoryRunStore,
    createAutonomousRun
} from "../src/index.js";


describe(
    "RunStore",
    () => {
        it(
            "stores isolated copies in memory",
            async () => {
                const store =
                    new MemoryRunStore();

                const run =
                    createAutonomousRun({
                        id:
                            "memory-run",

                        goal:
                            "Persist state",

                        maxIterations:
                            5
                    });

                await store.save(
                    run
                );

                run.status =
                    "failed";

                const loaded =
                    await store.load(
                        run.id
                    );

                expect(
                    loaded?.status
                ).toBe(
                    "planning"
                );
            }
        );


        it(
            "saves and loads a file snapshot",
            async () => {
                const directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-autonomy-"
                        )
                    );

                try {
                    const store =
                        new FileRunStore({
                            directory
                        });

                    const run =
                        createAutonomousRun({
                            id:
                                "file-run",

                            goal:
                                "Persist to disk",

                            maxIterations:
                                7,

                            now:
                                "2026-09-17T00:00:00.000Z"
                        });

                    await store.save(
                        run
                    );

                    const loaded =
                        await store.load(
                            run.id
                        );

                    expect(
                        loaded
                    ).toEqual(
                        run
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


        it(
            "returns null for a missing file snapshot",
            async () => {
                const directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "game-factory-autonomy-"
                        )
                    );

                try {
                    const store =
                        new FileRunStore({
                            directory
                        });

                    expect(
                        await store.load(
                            "missing"
                        )
                    ).toBeNull();
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