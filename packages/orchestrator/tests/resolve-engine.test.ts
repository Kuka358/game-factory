import {
    describe,
    expect,
    it
} from "vitest";

import {
    resolveEngine
} from "../src/engines/resolve-engine.js";

describe(
    "resolveEngine",
    () => {
        it(
            "resolves Phaser backend",
            () => {
                const backend =
                    resolveEngine(
                        "phaser"
                    );

                expect(
                    backend.manifest.id
                ).toBe(
                    "phaser"
                );
            }
        );
    }
);