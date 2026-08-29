import type {
    EngineBackend
} from "@game-factory/engine-core";

import {
    buildPhaserProject
} from "./build-project.js";

import {
    writePhaserProject
} from "./write-project.js";

export const phaserBackend:
    EngineBackend = {

    manifest: {
        id: "phaser",
        version: "1.0.0"
    },

    async generateProject(
        context
    ): Promise<void> {
        await writePhaserProject(
            context
        );
    },

    async buildProject(
        context
    ): Promise<void> {
        await buildPhaserProject(
            context
        );
    }
};