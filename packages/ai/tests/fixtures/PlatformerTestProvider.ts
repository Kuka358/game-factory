import type { PlatformerGameSpec } from "@game-factory/game-spec";
import type { AIProvider, AIRequest, AIResponse } from "../../src/index.js";

export const crystalPrompt = "Create a small crystal cave platformer where the player jumps across platforms, collects crystals, avoids hazards and reaches the exit.";

// A deterministic LLM boundary stub, not a gameplay implementation or a real model test.
// Deliberately independent of the Stage 13.10 manual GameSpec fixture.
export class PlatformerTestProvider implements AIProvider {
    readonly id = "platformer-test";
    readonly requests: AIRequest[] = [];

    async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
        this.requests.push(request);
        if (request.structuredOutput?.name === "game_review") {
            return { provider: this.id, model: request.model, data: { valid: true, warnings: [], suggested_changes: [] } as T };
        }
        const message = request.messages.find(message => message.role === "user");
        if (typeof message?.content !== "string") throw new Error("Missing Designer input");
        const input = JSON.parse(message.content) as { user_prompt: string; generation_settings: PlatformerGameSpec["generation"] };
        const snow = input.user_prompt.toLowerCase().includes("snow");
        const theme = snow ? "snowy mountain" : "crystal cave";
        const spec: PlatformerGameSpec = {
            schema_version: "1.0",
            metadata: { title: snow ? "Snow Summit" : "Crystal Exit", description: input.user_prompt.slice(0, 500) },
            generation: input.generation_settings,
            game: { genre: "platformer", orientation: "landscape" },
            controls: { move_left: ["keyboard_a", "keyboard_left"], move_right: ["keyboard_d", "keyboard_right"], jump: ["keyboard_space", "keyboard_up", "pointer"] },
            player: { movement: { move_speed: 280, jump_force: 640 } },
            platformer: { level_length: 3000, platform_gap_min: 72, platform_gap_max: 88, platform_width_min: 384, platform_width_max: 448, platform_height_variation: 24, enemy_density: 0.6, hazard_density: 1, collectible_density: 1 },
            assets: {
                style: "pixel-art", global_tags: [theme],
                roles: { player: { tags: ["explorer"] }, obstacle: { tags: [snow ? "ice spikes" : "crystal spikes"] }, background: { tags: [theme] } },
                additional: [
                    { role: "enemy", profile: "npc", tags: ["guardian"] },
                    { role: "collectible", profile: "item", tags: [snow ? "snowflake" : "crystal"] },
                    { role: "goal", profile: "item", tags: ["exit"] },
                    { role: "level_tiles", profile: "tileset", tags: [theme] },
                    { role: "score_icon", profile: "ui", ui_kind: "icon", tags: ["crystal icon"] }
                ]
            }
        };
        return { provider: this.id, model: request.model, data: spec as T };
    }
}
