import { describe, expect, it } from "vitest";

import { validateGameSpec } from "../src/validator.js";

describe("validateGameSpec", () => {
    it("accepts a valid endless runner spec", () => {
        const spec = {
            schema_version: "1.0",

            metadata: {
                title: "Dragon Escape",
                description: "Knight escapes from a dragon"
            },

            generation: {
                mode: "template",
                engine: "phaser",
                seed: 19283956
            },

            game: {
                genre: "endless_runner",
                orientation: "landscape"
            },

            controls: {
                jump: [
                    "keyboard_space",
                    "pointer"
                ]
            },

            player: {
                movement: {
                    jump_force: 580
                }
            },

            runner: {
                world_speed: 320,
                obstacle_spawn_interval_ms: 1800,
                speed_increase_per_second: 0.02
            },

            assets: {
                style:
                    "pixel-art",

                global_tags: [
                    "medieval"
                ],

                roles: {
                    player: {
                        tags: [
                            "knight"
                        ]
                    },

                    obstacle: {
                        tags: [
                            "spike"
                        ]
                    },

                    background: {
                        tags: [
                            "castle"
                        ]
                    }
                }
            },
        };

        const result = validateGameSpec(spec);

        console.log(JSON.stringify(result, null, 2));

        expect(result.valid).toBe(true);
    });

    it("rejects an invalid endless runner spec", () => {
        const spec = {
            schema_version: "2.0",

            metadata: {
                title: "",
                description: "Broken runner"
            },

            generation: {
                mode: "template",
                engine: "phaser",
                seed: -100
            },

            game: {
                genre: "endless_runner",
                orientation: "square"
            },

            controls: {
                jump: []
            },

            player: {
                movement: {
                    jump_force: -580
                }
            },

            assets: {
                style:
                    "pixel-art",

                global_tags: [
                    "medieval"
                ],

                roles: {
                    player: {
                        tags: [
                            "knight"
                        ]
                    },

                    obstacle: {
                        tags: [
                            "spike"
                        ]
                    },

                    background: {
                        tags: [
                            "castle"
                        ]
                    }
                }
            },

            runner: {
                world_speed: "fast",
                obstacle_spawn_interval_ms: 10,
                speed_increase_per_second: -1
            }
        };

        const result = validateGameSpec(spec);

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors.length).toBeGreaterThan(1);
        }
    });

    it("reports the path of a missing required property", () => {
        const spec = {
            schema_version: "1.0",

            metadata: {
                title: "Dragon Escape",
                description: "Knight escapes from a dragon"
            },

            generation: {
                mode: "template",
                engine: "phaser",
                seed: 123
            },

            game: {
                genre: "endless_runner",
                orientation: "landscape"
            },

            controls: {
                jump: ["pointer"]
            },

            player: {
                movement: {
                    jump_force: 580
                }
            },

            assets: {
                style:
                    "pixel-art",

                global_tags: [
                    "medieval"
                ],

                roles: {
                    player: {
                        tags: [
                            "knight"
                        ]
                    },

                    obstacle: {
                        tags: [
                            "spike"
                        ]
                    },

                    background: {
                        tags: [
                            "castle"
                        ]
                    }
                }
            },

            runner: {
                obstacle_spawn_interval_ms: 1800,
                speed_increase_per_second: 0.02
            }
        };

        const result = validateGameSpec(spec);

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/runner/world_speed",
                message: "Required property is missing"
            });
        }
    });

    it("rejects unknown properties", () => {
        const spec = {
            schema_version: "1.0",

            metadata: {
                title: "Dragon Escape",
                description: "Knight escapes from a dragon"
            },

            generation: {
                mode: "template",
                engine: "phaser",
                seed: 123
            },

            game: {
                genre: "endless_runner",
                orientation: "landscape"
            },

            controls: {
                jump: ["pointer"]
            },

            player: {
                movement: {
                    jump_force: 580
                }
            },

            assets: {
                style:
                    "pixel-art",

                global_tags: [
                    "medieval"
                ],

                roles: {
                    player: {
                        tags: [
                            "knight"
                        ]
                    },

                    obstacle: {
                        tags: [
                            "spike"
                        ]
                    },

                    background: {
                        tags: [
                            "castle"
                        ]
                    }
                }
            },

            runner: {
                world_speed: 320,
                obstacle_spawn_interval_ms: 1800,
                speed_increase_per_second: 0.02,

                speed_typo: 123
            }
        };

        const result = validateGameSpec(spec);

        expect(result.valid).toBe(false);

        if (!result.valid) {
            expect(result.errors).toContainEqual({
                path: "/runner/speed_typo",
                message: "Unknown property"
            });
        }
    });
});