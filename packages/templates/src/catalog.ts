import {
    endlessRunnerTemplate
} from "./endless-runner/EndlessRunnerTemplate.js";

import {
    platformerTemplate
} from "./platformer/PlatformerTemplate.js";

import type {
    GameTemplate
} from "./Template.js";


export const templateCatalog:
    readonly GameTemplate[] = [
        endlessRunnerTemplate,
        platformerTemplate
    ];