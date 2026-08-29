import type {
    EngineBackend,
    EngineId
} from "@game-factory/engine-core";

import {
    phaserBackend
} from "@game-factory/engine-phaser/backend";

export const engineRegistry:
    Record<
        EngineId,
        EngineBackend
    > = {
        phaser:
            phaserBackend
    };