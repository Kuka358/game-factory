import type { EventBus } from "./events/EventBus.js";
import type { ScoreService } from "./score/ScoreService.js";
import type { InputService } from "./input/InputService.js";
import type { DebugService } from "./debug/DebugService.js";
import type { PlatformService } from "@game-factory/platform-core";


export interface GameContext {
    events: EventBus;
    score: ScoreService;
    input: InputService;
    debug: DebugService;
    platform: PlatformService;
}