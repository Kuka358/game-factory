import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateGameSpec, isPlatformerGameSpec } from "@game-factory/game-spec";
import { GameReviewer, FilePromptRegistry, type AIProvider, type AIRequest } from "@game-factory/ai";
import { resolveTemplate } from "@game-factory/templates";
import { BENCHMARK_PROFILES, BENCHMARK_SEEDS, makeBenchmarkSpec } from "../src/benchmark/platformer-matrix.js";
import { validateTemplateAssetCapabilities } from "../src/ai/validate-template-asset-capabilities.js";
import { classifyBrowserFailure, summarize, type BenchmarkCase } from "../../qa/src/benchmark/report.js";

const provider: AIProvider = { id: "test", async generate<T>(request: AIRequest) { return { model: request.model, provider: this.id, data: { valid: true, warnings: [], suggested_changes: [] } as T }; } };
describe("Platformer robustness benchmark infrastructure", () => {
    it("all 30 deterministic matrix cases pass the existing pre-generation gates", async () => {
        const base = validateGameSpec(JSON.parse(await readFile(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")));
        if (!base.valid || !isPlatformerGameSpec(base.data)) throw new Error("Invalid fixture");
        const baseSpec = base.data;
        const reviewer = new GameReviewer({ provider, model: "test", promptRegistry: new FilePromptRegistry() });
        const cases = new Set<string>();
        for (const profile of BENCHMARK_PROFILES) for (const seed of BENCHMARK_SEEDS) {
            const spec = makeBenchmarkSpec(base.data, profile.id, seed);
            expect(makeBenchmarkSpec(base.data, profile.id, seed)).toEqual(spec);
            expect(validateGameSpec(spec).valid).toBe(true);
            const template = resolveTemplate(spec).manifest;
            expect(validateTemplateAssetCapabilities(spec, [template]).valid).toBe(true);
            expect((await reviewer.review({ spec, templates: [template], platform: { platform: "browser", keyboardInput: true, touchInput: true } })).review.valid).toBe(true);
            cases.add(`${profile.id}/${seed}`);
        }
        expect(cases.size).toBe(30);
        expect(() => makeBenchmarkSpec(baseSpec, "nonexistent", 1)).toThrow("Unknown benchmark spec");
        expect(() => makeBenchmarkSpec(baseSpec, "reference", -1)).toThrow("Seed");
    });
    it("does not label failed navigation or missing evidence as an unreachable game", () => {
        expect(classifyBrowserFailure("navigation", "Player died next to a hazard", [])).toBe("qa_driver_failure");
        expect(classifyBrowserFailure("navigation", "Waypoint timed out", [])).toBe("qa_timeout");
        expect(classifyBrowserFailure("navigation", "Timed out", ["Uncaught TypeError"])).toBe("runtime_failed");
        expect(classifyBrowserFailure("restart", "Game over remains set", [])).toBe("restart_failure");
        expect(classifyBrowserFailure("jump", "No upward displacement", [])).toBe("jump_failure");
    });
    it("reports observed completion independently from successful QA/restart", () => {
        const base = { id: "reference", seed: 1, accepted: true, generated: true, built: true };
        const cases = [
            { ...base, status: "passed", failureCode: null, browser: { completed: true, booted: true, qaStarted: true } },
            { ...base, seed: 42, status: "failed", failureCode: "restart_failure", browser: { completed: true, booted: true, qaStarted: true } },
            { ...base, seed: 2026, status: "failed", failureCode: "qa_driver_failure", browser: { completed: false, booted: true, qaStarted: true } }
        ] as BenchmarkCase[];
        const result = summarize(cases);
        expect(result.gamesCompleted).toBe(2);
        expect(result.casesPassed).toBe(1);
        expect(result.observedCompletionRate).toBeCloseTo(2 / 3);
        expect(result.failures).toEqual({ restart_failure: 1, qa_driver_failure: 1 });
        expect(summarize([]).observedCompletionRate).toBe(0);
    });
});
