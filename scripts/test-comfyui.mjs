import {
    AssetGenerator,
    ComfyUIProvider
} from "../packages/asset-generator/dist/index.js";

import {
    writeFile
} from "node:fs/promises";

const provider =
    new ComfyUIProvider({
        baseUrl:
            "http://192.168.0.14:8188",

        model:
            "your-checkpoint-name",

        workflowPath:
            "./config/comfyui/game-asset.json",

        /*
         * Если workflow создаёт несколько
         * изображений, здесь лучше явно
         * указать node id SaveImage.
         */
        outputNodeId:
            "8",

        timeoutMs:
            300_000
    });

const generator =
    new AssetGenerator(
        provider
    );

const result =
    await generator.generate({
        role:
            "player",

        kind:
            "sprite",

        tags: [
            "medieval knight",
            "running",
            "side view"
        ],

        style:
            "pixel-art",

        width:
            256,

        height:
            256,

        transparent:
            true,

        seed:
            123
    });

await writeFile(
    "./comfy-test.png",
    result.image.bytes
);

console.log(
    result.metadata
);