import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateGameSpec, isPlatformerGameSpec, type PlatformerGameSpec } from "@game-factory/game-spec";
import { GameReviewer, FilePromptRegistry, type AIProvider, type AIRequest } from "@game-factory/ai";
import { resolveTemplate } from "@game-factory/templates";
import { generate } from "@game-factory/builder";
import { BuiltinAssetManager, createAssetRequirements } from "@game-factory/assets";
import { runQa } from "@game-factory/qa";
import { resolveEngine } from "../src/engines/resolve-engine.js";
import { validateTemplateAssetCapabilities } from "../src/ai/validate-template-asset-capabilities.js";
import { generatePlatformerLevel } from "../../engine-phaser/src/templates/platformer/PlatformerLevelGenerator.js";
import { BENCHMARK_PROFILES, BENCHMARK_SEEDS, makeBenchmarkSpec } from "../src/benchmark/platformer-matrix.js";
import { summarize, classifyBrowserFailure, type BenchmarkCase, type BrowserOutcome, type FailureCode, type Phase } from "../../qa/src/benchmark/report.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
process.chdir(root);
const { values } = parseArgs({ options: { mode: { type: "string", default: "smoke" }, spec: { type: "string" }, seed: { type: "string" }, input: { type: "string" }, "expect-pass": { type: "boolean", default: false } } });
if (!["smoke", "full"].includes(values.mode)) throw new Error("--mode must be smoke or full");
if ((values.spec === undefined) !== (values.seed === undefined)) throw new Error("Use --spec and --seed together");
if (values.input && values.spec) throw new Error("Choose --input or --spec/--seed");
const baseResult = validateGameSpec(JSON.parse(await readFile(path.join(root, "examples/platformer-manual.json"), "utf8")));
if (!baseResult.valid || !isPlatformerGameSpec(baseResult.data)) throw new Error("Invalid benchmark base fixture");
let inputs: { id: string; seed: number; spec: PlatformerGameSpec }[];
if (values.input) {
    // Structural validation is still performed and recorded in the per-case phase below.
    const raw = JSON.parse(await readFile(path.resolve(values.input), "utf8")) as PlatformerGameSpec;
    inputs = [{ id: "replay", seed: raw.generation?.seed ?? 0, spec: raw }];
} else {
    const profiles = values.spec ? [values.spec] : BENCHMARK_PROFILES.map(profile => profile.id);
    const seeds = values.seed !== undefined ? [Number(values.seed)] : values.mode === "full" ? [...BENCHMARK_SEEDS] : [2026];
    inputs = profiles.flatMap(id => seeds.map(seed => ({ id, seed, spec: makeBenchmarkSpec(baseResult.data as PlatformerGameSpec, id, seed) })));
}
await mkdir(path.join(root, "generated"), { recursive: true });
const output = await mkdtemp(path.join(root, "generated", `platformer-benchmark-${values.mode}-`));
// LLM boundary only is stubbed. GameReviewer's production deterministic rules run unchanged.
const fakeReviewer: AIProvider = {
    id: "benchmark-fixed-review",
    async generate<T>(request: AIRequest) { return { provider: this.id, model: request.model, data: { valid: true, warnings: [], suggested_changes: [] } as T }; }
};
const reviewer = new GameReviewer({ provider: fakeReviewer, model: "deterministic-benchmark", promptRegistry: new FilePromptRegistry() });
const results: BenchmarkCase[] = [];
const started = new Date().toISOString();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const diffHash = createHash("sha256").update(execFileSync("git", ["diff", "--no-ext-diff"], { cwd: root })).digest("hex");
const sourceHashes = Object.fromEntries(await Promise.all([
    "packages/orchestrator/scripts/platformer-benchmark.mts", "packages/orchestrator/src/benchmark/platformer-matrix.ts",
    "packages/qa/src/PlatformerDriver.ts", "packages/qa/src/platformer-input.ts", "packages/qa/src/platformer-traversal.ts", "packages/qa/src/platformer-lookahead.ts", "packages/qa/benchmark/platformer.benchmark.spec.ts", "packages/qa/src/benchmark/report.ts",
    "packages/engine-phaser/src/templates/platformer/PlatformerScene.ts",
    "packages/engine-phaser/src/create-game.ts", "packages/engine-phaser/src/debug/PlatformerPhysicsDiagnostics.ts",
    "packages/engine-phaser/src/templates/platformer/hazard-clearance.ts",
    "packages/engine-phaser/src/templates/platformer/PlatformerLevelGenerator.ts", "packages/runtime/src/platformer-physics.ts",
    "packages/ai/src/game-reviewer/platformer-semantics.ts"
].map(async file => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
async function save() {
    const aggregate = summarize(results);
    await writeFile(path.join(output, "report.json"), JSON.stringify({ version: 1, mode: values.mode, started, updated: new Date().toISOString(), commit, trackedDiffSha256: diffHash, sourceHashes, plannedCases: inputs.length, aggregate, cases: results }, null, 2));
    const summary = [`# Platformer robustness benchmark`, ``, `Cases: ${aggregate.casesAttempted}/${inputs.length}; specs: ${aggregate.specsAttempted}; seeds: ${aggregate.seedsAttempted}`, `Accepted: ${aggregate.casesAccepted}; generated: ${aggregate.levelsGenerated}; built: ${aggregate.buildsPrepared}`, `Boots: ${aggregate.browserBoots}; QA starts: ${aggregate.qaStarts}; goals reached: ${aggregate.gamesCompleted}; cases passed: ${aggregate.casesPassed}`, `Observed completion: ${(aggregate.observedCompletionRate * 100).toFixed(1)}%`, ``, aggregate.interpretation, ``, `## Failures`, ...Object.entries(aggregate.failures).map(([code, count]) => `- ${code}: ${count}`), ``, `## Reproduction`, ...results.filter(result => result.status === "failed").map(result => `- ${result.id}/${result.seed}: ${result.failureCode} (${result.phase})\n  \`${result.reproduction}\``)].join("\n");
    await writeFile(path.join(output, "summary.md"), summary);
}
for (const input of inputs) {
    const casePath = path.join(output, `${input.id}-${input.seed}`);
    await mkdir(casePath, { recursive: true });
    const inputPath = path.join(casePath, "input-spec.json");
    await writeFile(inputPath, JSON.stringify(input.spec, null, 2));
    const result: BenchmarkCase = { ...input, phase: "spec_validation", status: "failed", failureCode: null, message: "", phases: [], accepted: false, generated: false, built: false, casePath, reproduction: `pnpm benchmark:platformer --input "${inputPath}"` };
    const phase = async <T,>(name: Phase, code: FailureCode, action: () => Promise<T>): Promise<T> => {
        result.phase = name;
        const start = performance.now();
        try { const value = await action(); result.phases.push({ phase: name, status: "passed", durationMs: performance.now() - start }); return value; }
        catch (error) { result.failureCode ??= code; result.phases.push({ phase: name, status: "failed", durationMs: performance.now() - start }); throw error; }
    };
    try {
        const validated = await phase("spec_validation", "spec_invalid", async () => {
            const validation = validateGameSpec(input.spec);
            if (!validation.valid || !isPlatformerGameSpec(validation.data)) throw new Error(JSON.stringify(validation));
            const template = resolveTemplate(validation.data).manifest;
            const capability = validateTemplateAssetCapabilities(validation.data, [template]);
            if (!capability.valid) throw new Error(capability.errors.join("; "));
            return { spec: validation.data, template };
        });
        await phase("semantic_review", "review_rejected", async () => {
            const review = await reviewer.review({ spec: validated.spec, templates: [validated.template], platform: { platform: "browser", keyboardInput: true, touchInput: true } });
            await writeFile(path.join(casePath, "review.json"), JSON.stringify(review, null, 2));
            if (!review.review.valid) throw new Error(JSON.stringify(review.review));
            result.accepted = true;
        });
        await phase("level_generation", "generation_failed", async () => {
            const layout = generatePlatformerLevel({ spec: validated.spec, viewportHeight: 720 });
            result.layoutPath = path.join(casePath, "level.json");
            await writeFile(result.layoutPath, JSON.stringify(layout, null, 2));
            if (!layout.platforms.length || !Number.isFinite(layout.worldWidth) || layout.platforms.some(platform => ![platform.x, platform.y, platform.width, platform.height].every(Number.isFinite))) throw new Error("Invalid generated geometry");
            result.generated = true;
        });
        const build = await phase("runtime_preparation", "runtime_failed", async () => {
            const generated = await generate({ spec: validated.spec, template: validated.template, backend: resolveEngine("phaser"), assetManager: new BuiltinAssetManager(), assetRequirements: createAssetRequirements(validated.spec), outputRoot: casePath });
            result.buildPath = generated.workspace.buildDir;
            const manifest = JSON.parse(await readFile(generated.workspace.assetManifestFile, "utf8")) as { assets: { source: string }[] };
            if (!manifest.assets.every(asset => asset.source === "builtin")) throw new Error("Benchmark requires builtin assets");
            result.built = true;
            return generated;
        });
        result.phase = "browser_boot";
        const qa = await runQa({ buildDir: build.workspace.buildDir, suite: "platformer-benchmark" });
        result.qaReportPath = qa.reportPath;
        try { result.browser = JSON.parse(await readFile(path.join(build.workspace.qaDir, "benchmark-outcome.json"), "utf8")) as BrowserOutcome; }
        catch { result.failureCode = "qa_driver_failure"; throw new Error(`QA launcher/server exited ${qa.exitCode} without an observation; runtime outcome unknown. Inspect ${qa.reportPath}`); }
        const browser = result.browser;
        if (browser.status === "failed" && browser.failureCode === "unknown") {
            const report = JSON.parse(await readFile(qa.reportPath, "utf8")) as { errors: string[] };
            browser.message = report.errors.join("; ") || browser.message;
            browser.failureCode = classifyBrowserFailure(browser.probe, browser.message, browser.runtimeErrors);
        }
        result.phase = browser.phase;
        result.failureCode = browser.failureCode;
        result.message = browser.message;
        result.status = qa.exitCode === 0 && browser.status === "passed" ? "passed" : "failed";
        if (result.status === "failed" && !result.failureCode) result.failureCode = "unknown";
        result.phases.push(...browser.phases);
    } catch (error) {
        result.failureCode ??= "unknown";
        result.message = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
    await writeFile(path.join(casePath, "result.json"), JSON.stringify(result, null, 2));
    await save();
    console.log(`BENCHMARK ${results.length}/${inputs.length}: ${input.id}/${input.seed} ${result.status} ${result.failureCode ?? "completed"}`);
}
console.log(await readFile(path.join(output, "summary.md"), "utf8"));
console.log(`Benchmark report: ${path.join(output, "report.json")}`);
// Measured failures are data, separate from guaranteed regression CI. Unhandled
// infrastructure/argument/report-writing errors still produce a nonzero exit.
// Opt-in for a small promoted regression; ordinary benchmark failures stay data.
if (values["expect-pass"] && results.some(result => result.status !== "passed")) process.exitCode = 1;
