import { parseArgs } from "node:util";
import { templateCatalog } from "@game-factory/templates";

export function parseGenerationInput(args: string[]) {
    const { values, positionals } = parseArgs({
        args,
        options: { genre: { type: "string" } },
        allowPositionals: true
    });
    const genre = values.genre === undefined ? undefined : templateCatalog
        .find(template => template.manifest.genre === values.genre)?.manifest.genre;
    if (values.genre !== undefined && genre === undefined) {
        throw new Error(`Unsupported genre: ${values.genre}. Choose ${templateCatalog.map(template => template.manifest.genre).join(" or ")}.`);
    }
    const input = positionals.join(" ").trim();
    if (genre && input.toLowerCase().endsWith(".json")) {
        throw new Error("--genre selects a prompt genre; a GameSpec file already declares its genre");
    }
    return { input, genre };
}
