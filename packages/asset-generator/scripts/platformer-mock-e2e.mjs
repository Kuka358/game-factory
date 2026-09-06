// Offline transport regression: a synthetic ComfyUI HTTP service replaces model
// inference only. The real resolver, provider, processor, cache, atlas builder,
// game builder and browser QA all run. This is not a live FLUX quality test.
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { runGenerationPipeline } from "../../orchestrator/dist/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
process.chdir(root);
await mkdir(path.join(root, "generated"), { recursive: true });
const outputRoot = await mkdtemp(path.join(root, "generated", "platformer-mock-generated-"));
const images = new Map();
const server = createServer((request, response) => {
    void handle(request, response).catch(error => {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(String(error));
    });
});

async function handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && url.pathname === "/prompt") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const { prompt } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const { width, height, profile } = prompt["1"].inputs;
        const full = profile === "background" || profile === "tileset";
        const margin = full ? 0 : 0.2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${width * margin}" y="${height * margin}" width="${width * (1 - margin * 2)}" height="${height * (1 - margin * 2)}" fill="#5080b0"/></svg>`;
        const id = String(images.size + 1);
        images.set(id, await sharp(Buffer.from(svg)).png().toBuffer());
        response.end(JSON.stringify({ prompt_id: id }));
    } else if (url.pathname.startsWith("/history/")) {
        const id = url.pathname.split("/").pop();
        response.end(JSON.stringify({ [id]: { outputs: { "8": { images: [{ filename: id, type: "output" }] } } } }));
    } else if (url.pathname === "/view" && images.has(url.searchParams.get("filename"))) {
        response.setHeader("content-type", "image/png");
        response.end(images.get(url.searchParams.get("filename")));
    } else {
        response.writeHead(404);
        response.end("{}");
    }
}

try {
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    Object.assign(process.env, {
        GAME_FACTORY_ASSET_STRATEGY: "generated_only",
        GAME_FACTORY_IMAGE_PROVIDER: "comfyui",
        GAME_FACTORY_SPRITEVAULT_MODE: "disabled",
        GAME_FACTORY_AI_PROVIDER: "disabled",
        GAME_FACTORY_ASSET_SEMANTIC_VALIDATION: "false",
        GAME_FACTORY_COMFYUI_URL: `http://127.0.0.1:${address.port}`,
        GAME_FACTORY_COMFYUI_MODEL: "synthetic-offline-regression",
        GAME_FACTORY_COMFYUI_OUTPUT_NODE: "8",
        GAME_FACTORY_GENERATED_ASSET_CACHE: path.join(outputRoot, "cache")
    });
    for (const profile of ["character", "npc", "item", "obstacle", "background", "ui", "tileset"]) {
        const workflowPath = path.join(outputRoot, `${profile}-mock-workflow.json`);
        await writeFile(workflowPath, JSON.stringify({
            "1": { class_type: "OfflineRegressionImage", inputs: {
                width: "__GF_WIDTH__", height: "__GF_HEIGHT__", prompt: "__GF_PROMPT__", profile
            } }
        }));
        process.env[`GAME_FACTORY_COMFYUI_${profile.toUpperCase()}_WORKFLOW`] = workflowPath;
        process.env[`GAME_FACTORY_COMFYUI_${profile.toUpperCase()}_MODEL`] = "synthetic-offline-regression";
    }
    const result = await runGenerationPipeline(path.join(root, "examples/platformer-manual.json"), outputRoot);
    const manifest = JSON.parse(await readFile(result.generation.workspace.assetManifestFile, "utf8"));
    if (manifest.assets.length !== 8 || manifest.assets.some(asset => asset.source !== "generated")) {
        throw new Error("Expected eight generated asset roles");
    }
    if (!manifest.assets.find(asset => asset.role === "level_tiles")?.spritesheet) {
        throw new Error("Generated terrain atlas metadata is missing");
    }
    console.log(`Synthetic ComfyUI image requests: ${images.size}`);
    console.log(`Build: ${result.generation.workspace.buildDir}`);
    console.log(`QA: ${result.generation.workspace.qaDir}`);
    console.log(result.success ? "RESULT: PASS (synthetic image provider)" : "RESULT: FAIL");
    if (!result.success) process.exitCode = 1;
} finally {
    await new Promise(resolve => server.close(resolve));
}
