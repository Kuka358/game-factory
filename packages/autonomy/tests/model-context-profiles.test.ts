import {
    describe,
    expect,
    it
} from "vitest";

import {
    getModelContextPreset,
    listModelContextPresets
} from "../src/index.js";


describe(
    "model context profiles",
    () => {
        it(
            "provides the configured Qwen LM Studio coding preset",
            () => {
                const preset =
                    getModelContextPreset(
                        "qwen3.5-9b-lmstudio-32k"
                    );


                expect(
                    preset
                ).toEqual({
                    id:
                        "qwen3.5-9b-lmstudio-32k",

                    maxOutputTokens:
                        8_192,

                    context: {
                        contextWindowTokens:
                            32_768,

                        safetyMarginTokens:
                            2_048,

                        requestOverheadTokens:
                            512
                    }
                });
            }
        );


        it(
            "normalizes preset identifiers",
            () => {
                expect(
                    getModelContextPreset(
                        "  QWEN3.5-9B-LMSTUDIO-32K  "
                    ).id
                ).toBe(
                    "qwen3.5-9b-lmstudio-32k"
                );
            }
        );


        it(
            "rejects unknown model presets",
            () => {
                expect(
                    () =>
                        getModelContextPreset(
                            "unknown-model"
                        )
                ).toThrow(
                    "Unknown coding model context preset"
                );
            }
        );


        it(
            "returns independent preset objects",
            () => {
                const first =
                    getModelContextPreset(
                        "qwen3.5-9b-lmstudio-32k"
                    );


                const second =
                    getModelContextPreset(
                        "qwen3.5-9b-lmstudio-32k"
                    );


                expect(
                    first
                ).not.toBe(
                    second
                );


                expect(
                    first.context
                ).not.toBe(
                    second.context
                );
            }
        );


        it(
            "lists known presets deterministically",
            () => {
                expect(
                    listModelContextPresets()
                ).toEqual([
                    "qwen3.5-9b-lmstudio-32k"
                ]);
            }
        );
    }
);