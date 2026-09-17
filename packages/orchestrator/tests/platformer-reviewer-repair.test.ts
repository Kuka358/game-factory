import { describe, expect, it } from "vitest";
import { validateGameSpec, type PlatformerGameSpec } from "@game-factory/game-spec";
import type { AIRequest, AIResponse } from "@game-factory/ai";
import { PlatformerTestProvider, crystalPrompt } from "../../ai/tests/fixtures/PlatformerTestProvider.js";
import { generateSpecFromPrompt } from "../src/ai/generate-spec-from-prompt.js";

class SemanticFailureProvider extends PlatformerTestProvider {
    designs = 0;
    constructor(private readonly persistent: boolean, private readonly malformedRepair = false) { super(); }
    override async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
        const response = await super.generate<PlatformerGameSpec>(request);
        if (request.structuredOutput?.name === "game_spec") {
            this.designs++;
            if (this.designs === 1 || this.persistent) {
                Object.assign(response.data.platformer, { platform_gap_min: 0, platform_gap_max: 0, platform_height_variation: 0, enemy_density: 1 });
                response.data.player.movement.jump_force = 1;
                expect(validateGameSpec(response.data).valid).toBe(true);
            } else if (this.malformedRepair && this.designs === 2) {
                response.data.player.movement.jump_force = -1;
            }
        }
        return { ...response, data: response.data as T };
    }
}
const run = (provider: SemanticFailureProvider) => generateSpecFromPrompt({ genre: "platformer", seed: 2026, prompt: crystalPrompt, model: "test", provider });
describe("Designer to semantic Reviewer repair", () => {
    it.each([false, true])("revalidates the repair through schema and Reviewer (malformed intermediate: %s)", async malformed => {
        const provider = new SemanticFailureProvider(false, malformed);
        const result = await run(provider);
        expect(result.review.valid).toBe(true);
        expect(validateGameSpec(result.spec).valid).toBe(true);
        expect(result.spec.generation.seed).toBe(2026);
        expect(result.spec.player.movement.jump_force).toBe(640);
        expect(provider.designs).toBe(malformed ? 3 : 2);
        const repair = provider.requests.find((request, index) => index > 0 && request.structuredOutput?.name === "game_spec");
        expect(String(repair?.messages[1]?.content)).toContain("guaranteed lethal obstacle");
        expect(provider.requests.filter(request => request.structuredOutput?.name === "game_review")).toHaveLength(1);
        const repeated = await run(new SemanticFailureProvider(false, malformed));
        expect(repeated.spec).toEqual(result.spec);
    });
    it("stops at the existing three-design limit when identical invalid specs recur", async () => {
        const provider = new SemanticFailureProvider(true);
        await expect(run(provider)).rejects.toMatchObject({ code: "review_failed" });
        expect(provider.designs).toBe(3);
        expect(provider.requests.filter(request => request.structuredOutput?.name === "game_review")).toHaveLength(0);
    });
});
