import {
    describe,
    expect,
    it
} from "vitest";

import {
    ComfyUIWorkflowRegistry
} from "../src/index.js";

describe(
    "ComfyUIWorkflowRegistry",
    () => {
        it(
            "resolves profile-specific workflow",
            () => {
                const registry =
                    new ComfyUIWorkflowRegistry({
                        workflows: [
                            {
                                profile:
                                    "character",

                                workflowPath:
                                    "character.json",

                                model:
                                    "character-model",

                                outputNodeId:
                                    "9"
                            },

                            {
                                profile:
                                    "background",

                                workflowPath:
                                    "background.json",

                                model:
                                    "background-model",

                                outputNodeId:
                                    "12"
                            }
                        ]
                    });

                expect(
                    registry.resolve(
                        "character"
                    )
                ).toEqual({
                    profile:
                        "character",

                    workflowPath:
                        "character.json",

                    model:
                        "character-model",

                    outputNodeId:
                        "9"
                });

                expect(
                    registry.resolve(
                        "background"
                    ).workflowPath
                ).toBe(
                    "background.json"
                );
            }
        );

        it(
            "uses fallback workflow during migration",
            () => {
                const registry =
                    new ComfyUIWorkflowRegistry({
                        workflows:
                            [],

                        fallback: {
                            profile:
                                "character",

                            workflowPath:
                                "universal.json",

                            model:
                                "universal-model",

                            outputNodeId:
                                "9"
                        }
                    });

                const result =
                    registry.resolve(
                        "tileset"
                    );

                expect(
                    result.profile
                ).toBe(
                    "tileset"
                );

                expect(
                    result.workflowPath
                ).toBe(
                    "universal.json"
                );
            }
        );

        it(
            "fails when profile is not configured",
            () => {
                const registry =
                    new ComfyUIWorkflowRegistry({
                        workflows:
                            []
                    });

                expect(
                    () =>
                        registry.resolve(
                            "npc"
                        )
                ).toThrow(
                    /npc/
                );
            }
        );
    }
);