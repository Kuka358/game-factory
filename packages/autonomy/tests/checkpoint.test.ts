import {
    describe,
    expect,
    it
} from "vitest";

import {
    MemoryCheckpointManager
} from "../src/index.js";


describe(
    "MemoryCheckpointManager",
    () => {
        it(
            "records checkpoint lifecycle",
            async () => {
                const manager =
                    new MemoryCheckpointManager();

                const checkpoint =
                    await manager.create(
                        "run-001",
                        "iteration-001"
                    );

                await manager.restore(
                    checkpoint
                );

                await manager.release(
                    checkpoint
                );

                expect(
                    manager.createdIds
                ).toEqual([
                    checkpoint.id
                ]);

                expect(
                    manager.restoredIds
                ).toEqual([
                    checkpoint.id
                ]);

                expect(
                    manager.releasedIds
                ).toEqual([
                    checkpoint.id
                ]);
            }
        );
    }
);