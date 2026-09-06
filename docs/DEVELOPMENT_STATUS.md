# Development Status

## Completed

### Stages 1–9
Core Game Factory architecture is implemented.

Includes:

- GameSpec
- Phaser runtime
- templates
- SpriteVault integration
- builder
- QA
- OpenRouter/OpenAI-compatible AI layer
- Web API/UI
- Yandex export

### Stage 11
AI Asset Generator + ComfyUI integration complete.

### Stage 12
AI Asset Generation v2 complete.

Production asset generator:

- FLUX.2 Klein 4B FP8
- Qwen 3 4B text encoder
- flux2 VAE
- pixel-art LoRA for sprite profiles

Supported profiles:

- character
- npc
- item
- obstacle
- background
- ui
- tileset

The handoff records asset smoke regression passing all 7 profiles. This is a
historical result, not a guarantee about the current external ComfyUI service.

Semantic/vision asset validation has an implementation and configuration flag,
disabled by default. Production verification/enabling remains deferred.

## Stage 13 — Platformer

### Completed

13.1 Multi-genre GameSpec
13.2 PlatformerTemplate
13.3 PlatformerScene
13.4 deterministic PlatformerLevelGenerator
13.5 generated level_tiles rendering
13.6 enemies
13.7 collectibles
13.8/13.9 hazards separation
13.10 manual Platformer E2E integration

### Current state

Platformer runtime supports:

- movement
- jumping
- deterministic platforms
- camera scrolling
- goal
- enemies
- static hazards
- collectibles
- score
- optional generated platform tiles

### Stage 13.10 integration

- `examples/platformer-manual.json` is the reproducible landscape fixture.
- File and object inputs are validated; hazard density is explicitly required.
- The existing resolver, asset requirements, builder and Phaser runtime are reused.
- Entity collision sizes are fixed independently of artwork dimensions/scale.
- Collectibles, enemies and the goal retain scene fallbacks without optional assets.
- Built-in tilesets now carry atlas metadata; omitted tilesets use plain platforms.
- QA selects runner or Platformer tests from the workspace GameSpec. Platformer
  QA checks input, jumps, falling, enemy/hazard deaths, score, camera, completion,
  restart, tile rendering and collision independence under resized artwork.
- The level generator retains seeded platform geometry and danger priorities;
  collectible density no longer shuffles surviving collectible positions.
- CLI exit status and printed result now reflect QA failures.

See [PLATFORMER_E2E.md](PLATFORMER_E2E.md) for commands and verification limits.

## Next goal

Stage 13.11: verify production FLUX.2 Klein artwork for all eight Platformer roles.
AI Designer remains runner-only; Stage 13.12 has not been enabled.

## Known limits

- Live ComfyUI is unavailable in the integration environment. Synthetic image
  provider regressions verify the generated-asset plumbing, not FLUX visual quality.
- QA's traversal driver targets the manual fixture; it is not a universal solver
  for every schema-valid seed, physics configuration or control combination.
  Broader playability coverage remains Stage 13.14.
- Enemies intentionally suppress hazards on a shared platform, and collectibles
  move away from danger. These are deterministic category interactions.
- Bare `pnpm test` needs `GAME_FACTORY_BUILD_DIR` and `GAME_FACTORY_QA_REPORT`.
  Use `pnpm qa <build-directory>` or the E2E scripts to supply QA configuration.
- The standalone playground still references missing player/obstacle/background
  SVG files. Use complete generated builds for browser QA.
- Vite reports the existing large Phaser bundle warning.

## Verification environment

PowerShell requires `pnpm.cmd` where execution policy blocks the .ps1 launcher.
The existing QA server must run outside the restricted sandbox on this Windows
machine because tsx user lookup fails inside it. Environment-file values remain
unchanged; E2E scripts use process-local configuration and isolated generated output.
