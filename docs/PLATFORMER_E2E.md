# Manual Platformer E2E (Stage 13.10)

The reference spec is `examples/platformer-manual.json`: landscape, seed 12345,
seven platforms, one enemy, two hazards and four collectibles. Input, collision
geometry and layout are deterministic runtime concerns; artwork is visual only.
The manual path does not invoke or enable AI Designer.

## Run

From the repository root (use `pnpm.cmd` in restricted PowerShell sessions):

```sh
pnpm e2e:platformer
pnpm e2e:platformer --fallback-only
pnpm e2e:platformer:mock-generated
```

The first command uses all eight roles and the built-in asset manager, including
a deterministic terrain atlas. The second omits every optional role to exercise
scene fallbacks, plain platforms and scoring without a collectible image.

The third runs a local synthetic ComfyUI HTTP service. Only external model
inference is simulated: the production configuration resolver, ComfyUI provider,
processor, structural validator, cache, terrain patch assembly, builder and
browser QA execute normally. PNGs and spritesheet metadata traverse the complete
generated-only pipeline. This verifies integration, not FLUX artwork quality.

Every command creates an isolated directory under `generated/`, prints the build
and QA paths, and exits unsuccessfully if QA fails. Scripts override configuration
only in their own process; they never edit `.env`. Outputs and caches are ignored.

With a working production ComfyUI service and configured profile workflows:

```sh
pnpm build
node --env-file=.env scripts/platformer-e2e.mjs --generated
```

This mode forces `generated_only` and checks asset provenance. The configured
service was unavailable during Stage 13.10 verification; live FLUX generation and
visual review remain Stage 13.11.

## Validation

Verified on 2026-09-06:

| Check | Result |
| --- | --- |
| Workspace build and typecheck | Passed |
| Unit tests across 10 packages | 87 passed |
| Manual Platformer with built-in atlas/assets | 5 browser tests passed |
| Manual Platformer with optional asset roles omitted | 5 browser tests passed |
| Full generated-only path with synthetic ComfyUI HTTP service | 5 browser tests passed; 15 image requests, 8 asset roles |
| Fresh runner pipeline regression | 1 browser test passed |

Completion screenshots show a score of 40 for the reference Platformer. Live
FLUX visual quality was not tested because the configured service was unavailable.

```sh
pnpm typecheck
pnpm build
pnpm -r --filter '!@game-factory/qa' test
pnpm qa <generated-workspace>/build
```

QA selects the suite using the validated `game-spec.json` beside the build.
Legacy builds without a workspace spec retain runner QA. Reports, failure traces
and completion screenshots are retained under each workspace's `qa/` directory.
The runner smoke test is still exercised separately as a regression.

The five Platformer browser checks cover:

1. Left/right input, grounded jumping, falling and deterministic restart.
2. Actual traversal, collectible score, scrolling camera, goal, restart and asset
   load errors; atlas rendering is checked when spritesheet metadata is present.
3. Enemy contact death.
4. Hazard contact death.
5. Unchanged hitboxes when artwork is replaced with extreme width/height ratios.

Tests observe the existing debug bridge and issue keyboard events; they never
teleport the player, alter physics, grant score or force completion. Input release
runs on browser animation frames to avoid Node/trace transport latency.
Stage 13.12 also reuses the traversal controller for an independent Designer scenario
(see [PLATFORMER_DESIGNER_E2E.md](PLATFORMER_DESIGNER_E2E.md)). It is not a general
solver for arbitrary platformer settings. Broader QA is Stage 13.14.

Unit regressions cover required hazard density, object-input validation, eight
asset requirements, built-in atlas metadata, production generated asset processing,
seed reproducibility, asset-independent layout, density stability and jump bounds.

## Implementation changes

- `examples/platformer-manual.json`, `scripts/platformer-e2e.mjs`, root
  `package.json`: reproducible manual entry point and fallback/generated modes.
- `packages/asset-generator/scripts/platformer-mock-e2e.mjs`: isolated offline
  generated-path integration test using the production pipeline.
- `packages/game-spec/src/platformer-schema.ts` and
  `tests/platformer-validator.test.ts`: required hazard density and regression.
- `packages/orchestrator/src/run-generation-pipeline.ts` and
  `tests/platformer-integration.test.ts`: validate object inputs and verify the
  manual spec, asset contract and deterministic level generation.
- `packages/engine-phaser/src/templates/platformer/PlatformerScene.ts`,
  `PlatformerLevelGenerator.ts`, `platformer-bodies.ts`: fixed world-space bodies,
  collectible fallback, terminal-state guards, stable collectible random consumption
  and read-only debug snapshots.
- `packages/runtime/src/debug/DebugService.ts`: typed Platformer debug details.
- `packages/assets/src/BuiltinAssetManager.ts` and
  `tests/BuiltinAssetManager.test.ts`: deterministic fallback terrain atlas.
- `packages/asset-generator/tests/GeneratedAssetManager.test.ts`: all eight roles
  through production processing and atlas assembly with synthetic source images.
- `packages/qa/playwright.config.ts`, `tests/platformer.smoke.spec.ts`,
  `package.json`, root `pnpm-lock.yaml`: genre selection, per-run artifacts,
  gameplay/geometry regressions and direct GameSpec dependency.
- `apps/cli/src/main.ts`: return failure when pipeline QA fails.
- `docs/ARCHITECTURE.md`, `DEVELOPMENT_STATUS.md`, `ROADMAP.md`, this document:
  implementation status, reproduction commands and explicit verification limits.

The pre-existing audit change removing the empty `platform-core` test script is
retained. No Asset Generator redesign, AI Designer change or environment-file edit
is part of this stage.
