import {
    DebugService
} from "./debug/DebugService.js";

import {
    EventBus
} from "./events/EventBus.js";

import {
    ScoreService
} from "./score/ScoreService.js";

import type {
    InputService
} from "./input/InputService.js";

import type {
    PlatformService
} from "@game-factory/platform-core";

import type {
    GameContext
} from "./GameContext.js";

export interface GameContextDependencies {
    input:
        InputService;

    platform:
        PlatformService;
}

export function createGameContext(
    dependencies:
        GameContextDependencies
): GameContext {
    const events =
        new EventBus();

    const debug =
        new DebugService();

    const score =
        new ScoreService(
            events
        );

    return {
        debug,
        events,

        input:
            dependencies.input,

        score,

        platform:
            dependencies.platform
    };
}