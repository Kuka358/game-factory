import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runGenerationPipeline } from "../packages/orchestrator/dist/index.js";

// Use the production pipeline, not an alternative builder or QA harness.
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(repositoryRoot);
const generated = process.argv.includes("--generated");
const fallbackOnly = process.argv.includes("--fallback-only");
if (generated && fallbackOnly) throw new Error("Choose either --generated or --fallback-only");
if (generated) {
    process.env.GAME_FACTORY_ASSET_STRATEGY = "generated_only";
    process.env.GAME_FACTORY_SPRITEVAULT_MODE = "disabled";
} else {
    process.env.GAME_FACTORY_ASSET_STRATEGY = "";
    process.env.GAME_FACTORY_IMAGE_PROVIDER = "disabled";
    process.env.GAME_FACTORY_SPRITEVAULT_MODE = "disabled";
    process.env.GAME_FACTORY_AI_PROVIDER = "disabled";
    process.env.GAME_FACTORY_ASSET_SEMANTIC_VALIDATION = "false";
}
// Unique output confines the builder's project cleanup to this new run.
const { mkdir } = await import("node:fs/promises");
await mkdir(path.join(repositoryRoot, "generated"), { recursive: true });
const outputRoot = await mkdtemp(path.join(repositoryRoot, "generated", "platformer-e2e-"));
let specPath = path.join(repositoryRoot, "examples", "platformer-manual.json");
if (fallbackOnly) {
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    delete spec.assets.additional;
    specPath = path.join(outputRoot, "fallback-spec.json");
    await writeFile(specPath, JSON.stringify(spec, null, 2));
}
const result = await runGenerationPipeline(specPath, outputRoot);
const manifest = JSON.parse(await readFile(result.generation.workspace.assetManifestFile, "utf8"));
if (generated && !manifest.assets.every(asset => asset.source === "generated")) {
    throw new Error("Generated E2E resolved a non-generated asset");
}
console.log(`Build: ${result.generation.workspace.buildDir}`);
console.log(`QA: ${result.generation.workspace.qaDir}`);
console.log(result.success ? "RESULT: PASS" : "RESULT: FAIL");
if (!result.success) process.exitCode = 1;
