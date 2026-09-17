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
13.12 explicit Platformer Designer and prompt E2E integration
13.13 deterministic Platformer semantic Reviewer and existing repair integration
13.14 Platformer robustness benchmark and measured smoke/full baseline
13.15 Platformer traversal diagnostics, targeted QA fixes and measured comparison
13.16 bounded Platformer lookahead, ceiling diagnostics and regression comparison

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

### Stage 13.12 integration

- Designer and prompt pipeline accept the existing GameSpec genre type; CLI accepts
  `--genre platformer`. Omitted genre preserves runner behavior; inference is not added.
- The existing schemas and template catalog provide the output contract and supported
  assets. Schema errors and genre mismatches use Designer's existing repair loop.
- Platformer instructions map requests to supported movement, terrain and densities;
  score, camera, exit, death and restart remain built-in runtime behaviors.
- `pnpm e2e:platformer:designer` starts from a readable crystal cave request, uses
  a deterministic fake LLM and builtin assets, then runs the production pipeline
  and all five existing Platformer browser tests. It does not load the manual fixture.
- See [PLATFORMER_DESIGNER_E2E.md](PLATFORMER_DESIGNER_E2E.md) for verification.

### Stage 13.13 integration

- Existing Reviewer performs deterministic Platformer control and guaranteed
  flat-ground barrier checks before the LLM; existing repair limits are preserved.
- Optional collectible reach and enemy/hazard priority produce warnings.
- Shared physics constants retain the existing numeric values and deterministic
  generator/runtime behavior. No asset-generation changes were made.
- See [PLATFORMER_REVIEWER.md](PLATFORMER_REVIEWER.md) for invariants and verification.
- Final resumed regression: build/typecheck PASS, 117 unit/regression tests and
  21 browser tests PASS (Designer, manual, fallback, mock generated-only, Runner).

## Next goal

Stage 13.14 is complete: smoke 4/6 (66.7%), full 17/30 (56.7%) observed QA
completions. All cases passed validation/review/generation/build/boot; the 13 full
failures are conservative navigation classifications, not proofs of unreachable
levels. Two representative failures were reproduced individually. Build/typecheck,
120 unit/regression tests and 21 guaranteed browser tests pass.
See [PLATFORMER_BENCHMARK.md](PLATFORMER_BENCHMARK.md).
Stage 13.15 is complete: unchanged full matrix improved 17/30 → 21/30 (70%);
smoke improved 4/6 → 5/6 (83.3%), with no previously passing full case regressed.
Build/typecheck, 126 unit/regression and 21 browser tests pass. Three representative
remaining failures were reproduced individually. Nine full failures remain
conservative navigation classifications with scoped geometry/physics evidence.
Generator, Reviewer rules and game physics were not changed by Stage 13.15.
See [PLATFORMER_RELIABILITY.md](PLATFORMER_RELIABILITY.md).
Stage 13.16: unchanged full matrix improved 21/30 → 24/30 (80%); smoke remains
5/6 (83.3%). All previously successful cases are preserved. Build/typecheck,
135 unit/regression tests and 22 guaranteed browser checks pass (the previous 21
plus narrow-fast/1). Narrow-fast/1, /42 and /12345 are newly resolved. Six
navigation failures remain, with no runtime errors or whole-level impossibility
claims. Generator, Reviewer, physics, assets, matrix and timeouts are unchanged.
See [PLATFORMER_LOOKAHEAD.md](PLATFORMER_LOOKAHEAD.md) for reports and replay evidence.
Stage 13.17 is complete: bounded real-Arcade capture and empirical
trials distinguish local QA failures from sufficient no-route cut certificates.
Four original low-jump levels had a proven lethal-span obstruction; a targeted
physics-derived exposed-hazard-height correction now passes all four real
crossing regressions. Narrow/high alternatives remain scoped local evidence,
not global playability proofs. See [PLATFORMER_PHYSICS_PROOF.md](PLATFORMER_PHYSICS_PROOF.md)
for the pre-change diagnosis, correction, commands and final validation.
The resumed unchanged matrix is 24/30 full and 5/6 smoke; all 24 Stage 13.16
successes are preserved. Build/typecheck, 155 unit tests, 22 configured browser
checks and bounded physical diagnostics pass. Representative remaining failures
reproduce without runtime errors. Decision gate A recommends one final narrow
QA stage for takeoff alignment and demonstrated bypasses; Stage 13.18 has not
started. No corrected whole level is certified unreachable; high-jump 6→7
remains uncertain.
Stage 13.11 remains deferred because the real ComfyUI server is unavailable;
production FLUX.2 Klein visual verification has not been performed.

## Known limits

- Live ComfyUI is unavailable in the integration environment. Synthetic image
  provider regressions verify the generated-asset plumbing, not FLUX visual quality.
- QA's traversal driver covers the manual and Designer scenarios; it is not a universal solver
  for every schema-valid seed, physics configuration or control combination.
  Stage 13.14 measures a broader matrix but does not certify arbitrary-seed playability.
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
