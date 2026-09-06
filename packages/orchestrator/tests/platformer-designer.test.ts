import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { validateGameSpec } from "@game-factory/game-spec";
import { templateCatalog } from "@game-factory/templates";
import type { AIRequest, AIResponse } from "@game-factory/ai";
import { crystalPrompt, PlatformerTestProvider } from "../../ai/tests/fixtures/PlatformerTestProvider.js";
import { generateSpecFromPrompt } from "../src/ai/generate-spec-from-prompt.js";

describe("prompt genre integration", () => {
    it.each(["capability", "review"])("preserves the existing %s repair loop", async fault => {
        class RepairProvider extends PlatformerTestProvider {
            private rejected = false;
            override async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
                const response = await super.generate<Record<string, unknown>>(request);
                if (!this.rejected && fault === "capability" && request.structuredOutput?.name === "game_spec") {
                    const assets = response.data.assets as { additional: { role: string; profile: string; tags: string[] }[] };
                    assets.additional.push({ role: "unsupported_decoration", profile: "item", tags: ["decoration"] });
                    this.rejected = true;
                } else if (!this.rejected && fault === "review" && request.structuredOutput?.name === "game_review") {
                    response.data = { valid: false, warnings: ["Make the level easier"], suggested_changes: ["Use wider platforms"] };
                    this.rejected = true;
                }
                return { ...response, data: response.data as T };
            }
        }
        const provider = new RepairProvider();
        const result = await generateSpecFromPrompt({ genre: "platformer", prompt: crystalPrompt, seed: 2026, provider, model: "test" });
        expect(result.review.valid).toBe(true);
        const designs = provider.requests.filter(request => request.structuredOutput?.name === "game_spec");
        expect(designs).toHaveLength(2);
        expect(JSON.parse(String(designs[1]?.messages[1]?.content)).user_prompt).toContain(crystalPrompt);
        for (const request of provider.requests.filter(request => request.structuredOutput?.name === "game_review")) {
            expect(JSON.parse(String(request.messages[1]?.content)).user_prompt).toBe(crystalPrompt);
        }
    });

    it("uses the registered Platformer capabilities and reviews the original prompt", async () => {
        const provider = new PlatformerTestProvider();
        const result = await generateSpecFromPrompt({ genre: "platformer", prompt: crystalPrompt, seed: 2026, provider, model: "test" });
        expect(validateGameSpec(result.spec).valid).toBe(true);
        expect(result.spec.game.genre).toBe("platformer");
        expect(result.spec.generation.seed).toBe(2026);
        const payload = JSON.parse(String(provider.requests[0]?.messages[1]?.content));
        expect(payload.template_catalog).toEqual([templateCatalog.find(template => template.manifest.genre === "platformer")?.manifest].map(manifest => ({
            id: manifest?.id, version: manifest?.version, genre: manifest?.genre,
            supportedModes: manifest?.supportedModes, assetRoles: manifest?.assetRoles,
            additionalAssetCapabilities: manifest?.additionalAssetCapabilities
        })));
        expect(JSON.parse(String(provider.requests[1]?.messages[1]?.content)).user_prompt).toBe(crystalPrompt);
    });

    it("keeps runner as the default, with the existing runner schema and catalog", async () => {
        class RunnerProvider extends PlatformerTestProvider {
            override async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
                if (request.structuredOutput?.name !== "game_spec") return super.generate<T>(request);
                this.requests.push(request);
                const fixture = JSON.parse(await readFile(new URL("../../../examples/runner-basic.json", import.meta.url), "utf8"));
                fixture.generation.seed = 2026;
                return { provider: this.id, model: request.model, data: fixture as T };
            }
        }
        const provider = new RunnerProvider();
        const result = await generateSpecFromPrompt({ prompt: "Create a runner", seed: 2026, provider, model: "test" });
        expect(result.spec.game.genre).toBe("endless_runner");
        const payload = JSON.parse(String(provider.requests[0]?.messages[1]?.content));
        expect(payload.selected_genre).toBe("endless_runner");
        expect(payload.template_catalog.map((template: { id: string }) => template.id)).toEqual(["endless_runner"]);
    });
});
