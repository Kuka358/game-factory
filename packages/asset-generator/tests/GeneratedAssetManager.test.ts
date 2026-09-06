import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { expect, it } from "vitest";
import { createAssetRequirements } from "@game-factory/assets";
import { AssetGenerator, GeneratedAssetManager, type ImageGeneratorProvider } from "../src/index.js";

it("resolves all manual Platformer roles through processing and terrain atlas assembly", async () => {
    // Only the expensive external image provider is replaced. Processing,
    // validation, role resolution and TilesetGenerator are production code.
    const provider: ImageGeneratorProvider = {
        id: "offline-regression", model: "synthetic-single-subject",
        async generate(request) {
            const full = request.profile === "background" || request.profile === "tileset";
            const margin = full ? 0 : 0.2;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}"><rect x="${request.width * margin}" y="${request.height * margin}" width="${request.width * (1 - margin * 2)}" height="${request.height * (1 - margin * 2)}" fill="#5080b0"/></svg>`;
            return { bytes: await sharp(Buffer.from(svg)).png().toBuffer(), mimeType: "image/png", width: request.width, height: request.height };
        }
    };
    const spec = JSON.parse(await readFile(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")) as Parameters<typeof createAssetRequirements>[0];
    const directory = await mkdtemp(path.join(os.tmpdir(), "platformer-generated-assets-"));
    try {
        const manager = new GeneratedAssetManager({ generator: new AssetGenerator(provider), style: spec.assets.style });
        const { manifest } = await manager.resolve({ requirements: createAssetRequirements(spec), assetsDir: directory });
        expect(manifest.assets).toHaveLength(8);
        expect(manifest.assets.every(asset => asset.source === "generated")).toBe(true);
        const tiles = manifest.assets.find(asset => asset.role === "level_tiles");
        expect(tiles?.spritesheet).toBeDefined();
        for (const asset of manifest.assets) {
            const metadata = await sharp(path.join(directory, path.basename(asset.gamePath))).metadata();
            expect(metadata.width).toBeGreaterThan(0);
            expect(metadata.height).toBeGreaterThan(0);
            if (asset.spritesheet) {
                expect(metadata.width).toBe(asset.spritesheet.frameWidth * asset.spritesheet.columns);
                expect(metadata.height).toBe(asset.spritesheet.frameHeight * asset.spritesheet.rows);
            }
        }
    } finally {
        // mkdtemp returns a unique absolute test directory under the system temp root.
        await rm(directory, { recursive: true, force: true });
    }
}, 30_000);
