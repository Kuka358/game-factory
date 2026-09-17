import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMER_BODIES } from "../../runtime/src/platformer-physics.js";
import type { DebugRectangle } from "../../runtime/src/debug/DebugService.js";
import type { PlatformerLevelLayout } from "../../engine-phaser/src/templates/platformer/PlatformerLevelGenerator.js";
import type { BenchmarkCase } from "../../qa/src/benchmark/report.js";
import { safeLandingRegions, landingCandidates, hazardClearance } from "../../qa/src/platformer-traversal.js";
import { lookaheadCandidates, selectLookaheadCandidate } from "../../qa/src/platformer-lookahead.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: tsx platformer-diagnose.mts <benchmark-report.json>");
const report = JSON.parse(await readFile(input, "utf8")) as { cases: BenchmarkCase[] };
const sourceReport = path.resolve(input);
process.chdir(fileURLToPath(new URL("../../../", import.meta.url)));
const cases = [];
for (const item of report.cases.filter(c => c.status === "failed" && c.layoutPath)) {
    const layout = JSON.parse(await readFile(item.layoutPath!, "utf8")) as PlatformerLevelLayout;
    const dangers: DebugRectangle[] = [
        ...layout.hazards.map(h => ({ ...h, ...PLATFORMER_BODIES.hazard })),
        ...layout.enemies.map(e => ({ ...e, ...PLATFORMER_BODIES.enemy }))
    ];
    const transitions = layout.platforms.flatMap((source, index) => {
        const starts = safeLandingRegions(source, dangers, item.spec.player.movement.move_speed).flatMap(region => [region.min, region.max]);
        // Inspect forward surfaces, including skips. Candidate sampling is not an
        // exhaustive proof that no other launch point or route exists.
        return layout.platforms.slice(index + 1).flatMap(destination => starts.map(launchX => ({ source: source.index, destination: destination.index, launchX,
            candidates: landingCandidates(item.spec.player.movement, source, launchX, destination, dangers)
        })));
    });
    const before = item.browser?.actions?.at(-1)?.before;
    const sourceIndex = before ? layout.platforms.findIndex(p => Math.abs(p.y - p.height / 2 - before.playerBody.y - before.playerBody.height / 2) < 3 && Math.abs(p.x - before.playerBody.x) < (p.width + before.playerBody.width) / 2) : -1;
    const lookahead = before && sourceIndex >= 0 ? lookaheadCandidates({ movement: item.spec.player.movement, surfaces: layout.platforms, sourceIndex,
        playerX: before.playerBody.x, velocityX: before.playerVelocity?.x ?? 0, dangers, goalX: layout.goal.x, sameSurface: true }) : [];
    const alternatives = sourceIndex < 0 ? [] : [sourceIndex - 1, sourceIndex].filter(index => index >= 0).flatMap(index =>
        safeLandingRegions(layout.platforms[index]!, dangers, item.spec.player.movement.move_speed).flatMap(region =>
            [...new Set([region.min, (region.min + region.max) / 2, region.max])].map(launch => {
                const candidates = lookaheadCandidates({ movement: item.spec.player.movement, surfaces: layout.platforms, sourceIndex: index,
                    playerX: launch, velocityX: 0, dangers, goalX: layout.goal.x, sameSurface: true });
                return { sourceIndex: index, launch, region, candidates, selected: selectLookaheadCandidate(candidates) };
            })));
    cases.push({ id: item.id, seed: item.seed, input: item.spec, originalResult: item.failureCode, originalDebug: item.browser?.debug,
        originalAction: item.browser?.actions?.at(-1), sourceIndex, lookahead, selectedLookahead: selectLookaheadCandidate(lookahead), alternatives,
        transitions, hazards: layout.hazards.map(h => ({ hazard: h, diagnostic: hazardClearance(item.spec.player.movement, layout.platforms[h.platformIndex]!, { ...h, ...PLATFORMER_BODIES.hazard }) })) });
}
await mkdir("generated", { recursive: true });
const output = await mkdtemp(path.join("generated", "platformer-diagnostics-"));
await writeFile(path.join(output, "report.json"), JSON.stringify({ version: 1, sourceReport, scope: "Analytic candidate diagnostics, not exhaustive playability proof; ceiling/side contacts and finite-step timing remain uncertain", cases }, null, 2));
console.log(`Diagnosed ${cases.length} failed cases: ${path.join(output, "report.json")}`);
