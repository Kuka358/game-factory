import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateGameSpec, isPlatformerGameSpec } from "@game-factory/game-spec";
import { resolveTemplate } from "@game-factory/templates";
import { generate } from "@game-factory/builder";
import { BuiltinAssetManager, createAssetRequirements } from "@game-factory/assets";
import { runQa } from "@game-factory/qa";
import { resolveEngine } from "../src/engines/resolve-engine.js";
import type { BenchmarkCase } from "../../qa/src/benchmark/report.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
process.chdir(root);
const input = process.argv[2];
if (!input) throw new Error("Usage: platformer-proof.mts <preserved benchmark report> [case-id/seed]");
const original = JSON.parse(await readFile(input, "utf8")) as { cases: BenchmarkCase[] };
await mkdir("generated", { recursive: true });
const output = await mkdtemp(path.join(root, "generated", "platformer-proof-"));
const cases = original.cases.filter(c => c.status === "failed" && (!process.argv[3] || `${c.id}/${c.seed}` === process.argv[3]));
if (!cases.length) throw new Error("No matching failed cases");
const sourceFiles = ["packages/engine-phaser/src/debug/PlatformerPhysicsDiagnostics.ts", "packages/engine-phaser/src/templates/platformer/PlatformerScene.ts",
    "packages/qa/proof/platformer.proof.spec.ts", "packages/qa/src/platformer-proof.ts", "packages/qa/src/platformer-barrier-proof.ts",
    "packages/runtime/src/debug/PlatformerDiagnostics.ts", "packages/runtime/src/platformer-physics.ts",
    "packages/engine-phaser/src/create-game.ts", "packages/engine-phaser/src/templates/platformer/PlatformerLevelGenerator.ts",
    "packages/engine-phaser/src/templates/platformer/hazard-clearance.ts", "packages/qa/src/PlatformerDriver.ts", "packages/qa/src/platformer-input.ts",
    "packages/qa/src/platformer-traversal.ts", "packages/qa/src/platformer-lookahead.ts", "packages/orchestrator/scripts/platformer-proof.mts"];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
const results = [];
for (const c of cases) {
    const validation = validateGameSpec(c.spec);
    if (!validation.valid || !isPlatformerGameSpec(validation.data)) throw new Error("Invalid preserved input");
    const spec = validation.data;
    const build = await generate({ spec, template: resolveTemplate(spec).manifest, backend: resolveEngine("phaser"), assetManager: new BuiltinAssetManager(),
        assetRequirements: createAssetRequirements(spec), outputRoot: path.join(output, `${c.id}-${c.seed}`) });
    await writeFile(path.join(path.dirname(build.workspace.buildDir), "proof-input.json"), JSON.stringify(c.browser!.actions!.at(-1)));
    const qa = await runQa({ buildDir: build.workspace.buildDir, suite: "platformer-proof" });
    results.push({ id: c.id, seed: c.seed, exitCode: qa.exitCode, report: path.join(path.dirname(qa.reportPath), "proof-report.json") });
    await writeFile(path.join(output, "index.json"), JSON.stringify({ sourceReport: path.resolve(input), sourceHashes, results }, null, 2));
    if (qa.exitCode !== 0) throw new Error(`Diagnostic infrastructure failed: ${qa.reportPath}`);
}
console.log(`Proof index: ${path.join(output, "index.json")}`);
