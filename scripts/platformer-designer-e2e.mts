import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AIRequest, AIStructuredOutput } from "../packages/ai/src/index.js";
import { crystalPrompt, PlatformerTestProvider } from "../packages/ai/tests/fixtures/PlatformerTestProvider.js";
import { runPromptGenerationPipeline } from "../packages/orchestrator/dist/index.js";
import { getGameSpecSchema } from "../packages/game-spec/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const provider = new PlatformerTestProvider();
// Exercise the production OpenAI-compatible transport and prompt pipeline.
// Only the external LLM boundary is fake; no image-generation service is used.
const server = createServer(async (request, response) => {
    try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { model: string; messages: AIRequest["messages"]; response_format: { json_schema: AIStructuredOutput } };
        const result = await provider.generate({ model: body.model, messages: body.messages, structuredOutput: body.response_format.json_schema });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ model: body.model, choices: [{ message: { content: JSON.stringify(result.data) } }] }));
    } catch (error) {
        response.writeHead(500);
        response.end(String(error));
    }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
    const address = server.address();
    assert(address && typeof address !== "string");
    Object.assign(process.env, {
        GAME_FACTORY_AI_PROVIDER: "openai-compatible", GAME_FACTORY_AI_MODEL: "deterministic-platformer-test",
        GAME_FACTORY_AI_API_KEY: "", GAME_FACTORY_AI_BASE_URL: `http://127.0.0.1:${address.port}/v1/`,
        GAME_FACTORY_ASSET_STRATEGY: "", GAME_FACTORY_IMAGE_PROVIDER: "disabled",
        GAME_FACTORY_SPRITEVAULT_MODE: "disabled", GAME_FACTORY_ASSET_SEMANTIC_VALIDATION: "false"
    });
    await mkdir(path.join(root, "generated"), { recursive: true });
    const output = await mkdtemp(path.join(root, "generated", "platformer-designer-e2e-"));
    const result = await runPromptGenerationPipeline(crystalPrompt, output, { genre: "platformer", seed: 2026 });
    assert.equal(result.success, true, "Platformer browser QA must pass");
    assert.deepEqual(provider.requests.map(request => request.structuredOutput?.name), ["game_spec", "game_review"]);
    assert.deepEqual(provider.requests[0]?.structuredOutput?.schema, getGameSpecSchema("platformer"));
    const manifest = JSON.parse(await readFile(result.generation.workspace.assetManifestFile, "utf8")) as { assets: { source: string }[] };
    assert.equal(manifest.assets.length, 8);
    assert(manifest.assets.every(asset => asset.source === "builtin"));
    console.log(`Build: ${result.generation.workspace.buildDir}`);
    console.log(`QA: ${result.generation.workspace.qaDir}`);
    console.log("RESULT: PASS (deterministic fake LLM, builtin assets)");
} finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
