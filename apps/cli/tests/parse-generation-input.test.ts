import { expect, it } from "vitest";
import { parseGenerationInput } from "../src/parse-generation-input.js";

it("passes an explicit Platformer selection independently from the prompt", () => {
    expect(parseGenerationInput(["--genre", "platformer", "Create a cave platformer"])).toEqual({
        genre: "platformer", input: "Create a cave platformer"
    });
});
it("preserves unselected prompts and file inputs", () => {
    expect(parseGenerationInput(["A", "runner"])).toEqual({ input: "A runner", genre: undefined });
    expect(parseGenerationInput(["examples/platformer-manual.json"]).input).toBe("examples/platformer-manual.json");
});
it("rejects unsupported genres and ambiguous file overrides", () => {
    expect(() => parseGenerationInput(["--genre", "racing", "Race"])).toThrow("Unsupported genre");
    expect(() => parseGenerationInput(["--genre", "platformer", "runner.json"])).toThrow("already declares");
});
