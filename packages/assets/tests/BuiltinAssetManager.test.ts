import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { BuiltinAssetManager } from "../src/BuiltinAssetManager.js";
import { createAssetRequirements } from "../src/create-asset-requirements.js";

it("preserves every Platformer role and supplies usable fallback atlas metadata", async () => {
    const spec = JSON.parse(await readFile(new URL("../../../examples/platformer-manual.json", import.meta.url), "utf8")) as Parameters<typeof createAssetRequirements>[0];
    const directory = await mkdtemp(path.join(os.tmpdir(), "platformer-builtin-assets-"));
    try {
        const requirements = createAssetRequirements(spec);
        const { manifest } = await new BuiltinAssetManager().resolve({ requirements, assetsDir: directory });
        expect(manifest.assets.map(asset => asset.role)).toEqual(requirements.map(requirement => requirement.role));
        expect(manifest.assets.every(asset => asset.source === "builtin")).toBe(true);
        const tiles = manifest.assets.find(asset => asset.role === "level_tiles")!;
        expect(tiles.spritesheet).toEqual({ frameWidth: 64, frameHeight: 64, columns: 8, rows: 1 });
        expect(await readFile(path.join(directory, "level_tiles.svg"), "utf8")).toContain('width="512" height="64"');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
