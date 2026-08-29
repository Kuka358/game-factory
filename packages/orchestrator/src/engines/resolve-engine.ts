import type {
    EngineBackend,
    EngineId
} from "@game-factory/engine-core";

import {
    engineRegistry
} from "./engine-registry.js";

export function resolveEngine(
    engineId: EngineId
): EngineBackend {
    const backend =
        engineRegistry[
            engineId
        ];

    if (!backend) {
        throw new Error(
            `Engine backend not found: ${engineId}`
        );
    }

    return backend;
}