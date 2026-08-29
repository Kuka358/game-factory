import {
    describe,
    expect,
    it
} from "vitest";

import {
    FilePromptRegistry
} from "../src/index.js";

describe(
    "FilePromptRegistry",
    () => {
        it(
            "loads versioned game designer prompt",
            async () => {
                const registry =
                    new FilePromptRegistry();

                const prompt =
                    await registry.get(
                        "game-designer",
                        "v1"
                    );

                expect(
                    prompt.id
                ).toBe(
                    "game-designer"
                );

                expect(
                    prompt.version
                ).toBe(
                    "v1"
                );

                expect(
                    prompt.content
                        .length
                ).toBeGreaterThan(
                    100
                );
            }
        );

        it(
            "rejects unsafe prompt paths",
            async () => {
                const registry =
                    new FilePromptRegistry();

                await expect(
                    registry.get(
                        "../game-designer",
                        "v1"
                    )
                ).rejects.toThrow(
                    /Invalid prompt id/
                );
            }
        );

        it(
            "loads game reviewer prompt",
            async () => {
                const registry =
                    new FilePromptRegistry();

                const prompt =
                    await registry.get(
                        "game-reviewer",
                        "v1"
                    );

                expect(
                    prompt.id
                ).toBe(
                    "game-reviewer"
                );

                expect(
                    prompt.content.length
                ).toBeGreaterThan(
                    100
                );
            }
        );
    }
);