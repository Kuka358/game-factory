import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { getGameSpecSchema, validateGameSpec } from "@game-factory/game-spec";
import { GameDesigner, type AIRequest, type AIResponse, type DesignGameInput } from "../src/index.js";
import { crystalPrompt, PlatformerTestProvider } from "./fixtures/PlatformerTestProvider.js";

const input: DesignGameInput = {
    genre: "platformer", userPrompt: crystalPrompt,
    generation: { engine: "phaser", mode: "template", seed: 2026 },
    templates: ["endless_runner", "platformer"].map(genre => ({ id: genre, genre, version: "1", supportedModes: ["template"], assetRoles: ["player", "obstacle", "background"] })),
    platform: { platform: "browser", keyboardInput: true, touchInput: true }
};
const designer = (provider = new PlatformerTestProvider()) => new GameDesigner({ provider, model: "test", promptRegistry: { async get() { return { id: "game-designer", version: "v1", content: "Follow the provided schema." }; } } });

describe("Platformer Designer", () => {
    it.each([crystalPrompt, "Create an easy snowy mountain platformer with snowflakes and an exit."])("validates request: %s", async userPrompt => {
        const provider = new PlatformerTestProvider();
        const { spec } = await designer(provider).design({ ...input, userPrompt });
        expect(validateGameSpec(spec).valid).toBe(true);
        expect(spec.game.genre).toBe("platformer");
        expect(spec).not.toHaveProperty("runner");
        expect(spec.generation.seed).toBe(2026);
        expect(spec.metadata.description).toBe(userPrompt);
        expect(provider.requests[0]?.structuredOutput?.schema).toBe(getGameSpecSchema("platformer"));
        const payload = JSON.parse(String(provider.requests[0]?.messages[1]?.content));
        expect(payload.selected_genre).toBe("platformer");
        expect(payload.template_catalog.map((template: { id: string }) => template.id)).toEqual(["platformer"]);
        expect(payload.platform_constraints.orientation).toBe("landscape");
        expect(payload.output_contract.schema).toEqual(getGameSpecSchema("platformer"));
    });

    it.each(["missing density", "inverted gaps", "runner fields", "wrong genre"])("repairs %s through existing validation", async fault => {
        class InvalidFirstProvider extends PlatformerTestProvider {
            override async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
                const response = await super.generate<Record<string, unknown>>(request);
                if (this.requests.length === 1) {
                    const config = response.data.platformer as Record<string, unknown>;
                    if (fault === "missing density") delete config.hazard_density;
                    if (fault === "inverted gaps") config.platform_gap_min = 1000;
                    if (fault === "runner fields") response.data.runner = {};
                    if (fault === "wrong genre") response.data.game = { genre: "endless_runner", orientation: "landscape" };
                }
                return { ...response, data: response.data as T };
            }
        }
        const provider = new InvalidFirstProvider();
        expect((await designer(provider).design(input)).spec.game.genre).toBe("platformer");
        expect(provider.requests).toHaveLength(2);
        expect(String(provider.requests[1]?.messages.at(-1)?.content)).toContain("INVALID");
    });

    it("rejects portrait before calling the provider", async () => {
        const provider = new PlatformerTestProvider();
        await expect(designer(provider).design({ ...input, platform: { ...input.platform, orientation: "portrait" } })).rejects.toThrow("landscape");
        expect(provider.requests).toHaveLength(0);
    });

    it("never accepts a schema-valid runner when Platformer was selected", async () => {
        class WrongGenreProvider extends PlatformerTestProvider {
            override async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
                this.requests.push(request);
                const data: unknown = JSON.parse(await readFile(new URL("../../../examples/runner-basic.json", import.meta.url), "utf8"));
                expect(validateGameSpec(data).valid).toBe(true);
                return { provider: this.id, model: request.model, data: data as T };
            }
        }
        const provider = new WrongGenreProvider();
        await expect(designer(provider).design(input)).rejects.toThrow("Must match the selected genre: platformer");
        expect(provider.requests).toHaveLength(3);
    });
});
