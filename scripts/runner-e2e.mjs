import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runGenerationPipeline } from "../packages/orchestrator/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
Object.assign(process.env, {
    GAME_FACTORY_ASSET_STRATEGY: "", GAME_FACTORY_IMAGE_PROVIDER: "disabled",
    GAME_FACTORY_SPRITEVAULT_MODE: "disabled", GAME_FACTORY_AI_PROVIDER: "disabled",
    GAME_FACTORY_ASSET_SEMANTIC_VALIDATION: "false"
});
await mkdir(path.join(root, "generated"), { recursive: true });
const output = await mkdtemp(path.join(root, "generated", "runner-e2e-"));
const result = await runGenerationPipeline(path.join(root, "examples", "runner-basic.json"), output);
console.log(`QA: ${result.generation.workspace.qaDir}`);
console.log(result.success ? "RESULT: PASS" : "RESULT: FAIL");
if (!result.success) process.exitCode = 1;
