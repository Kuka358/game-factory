# Architecture

This describes the implementation through Stage 13.16 Platformer traversal lookahead.
See DEVELOPMENT_STATUS.md, PLATFORMER_E2E.md and ROADMAP.md for verification scope.

## Packages and pipeline

- `game-spec`: strict TypeScript `GameSpec` union and AJV validators for
  `EndlessRunnerGameSpec` and `PlatformerGameSpec`, with Platformer cross-field checks.
- `templates`: deterministic resolution of `endless_runner` and `platformer`.
- `assets`: asset requirements, manifests, provider selection and built-in SVG fallbacks.
- `spritevault-client`: SpriteVault asset lookup integration.
- `asset-generator`: ComfyUI generation, processing, validation, caching and
  deterministic assembly of individually generated terrain patches into tilesets.
- `runtime`: shared input, events, score, debug state and platform context.
- `engine-core`: backend contracts. `engine-phaser`: Phaser scenes and Vite project generation/build.
- `builder`: writes spec/manifests, resolves assets and invokes the selected backend.
- `qa`: Playwright build server, debug driver and JSON reports. Its only gameplay
  suites target endless runner and Platformer (manual and Designer scenarios). QA selects the
  suite from the validated workspace GameSpec and stores artifacts with the report.
- `platform-core`, `platform-web`, `platform-yandex`: platform contracts, browser
  mock, Yandex SDK integration and export tooling.
- `config`, `ai`, `orchestrator`: configuration, Designer/Reviewer providers and
  coordination of spec, template, assets, build and QA.
- `apps/cli`, `apps/api`, `apps/web`: entry points and web UI.
  `apps/playground` is a runner development fixture.

`runGenerationPipeline` accepts a JSON file path or a typed GameSpec. The file
path is validated on load; object inputs are also validated. It resolves the
template, asset requirements/manager and engine, runs the builder, then QA.
Platform export is a separate operation.

The AI path adds Designer/Reviewer processing before this pipeline. `GameSpec`'s
existing genre union remains authoritative; `getGameSpecSchema` selects its existing
AJV schema and the shared `templateCatalog` supplies matching manifests/capabilities.
Designer accepts an explicit `genre`, as do `generateSpecFromPrompt` and
`runPromptGenerationPipeline`; omission retains `endless_runner`. CLI exposes
`--genre platformer`. There is no natural-language classifier. API/web currently
use the runner default. Manual files continue to declare their own genre.
Designer validates every response and repairs invalid output or a mismatched genre
with the existing retry loop. The orchestrator then enforces generation settings,
asset capabilities and Reviewer approval before invoking the unchanged build pipeline.
Platformer is landscape-only. Production LLM providers are reused; the new E2E
uses a deterministic local fake LLM over the existing OpenAI-compatible transport.

Reviewer now runs deterministic Platformer semantic checks before LLM review,
using the same gameplay constants as Phaser. Failures feed the existing repair
loop; optional score/priority concerns remain warnings. See
[PLATFORMER_REVIEWER.md](PLATFORMER_REVIEWER.md) for ownership, precise rejection
conditions and limits. This is not arbitrary-seed playability certification.

The optional robustness benchmark reuses these same validation/review, generation,
builtin builder and QA components, recording separate phases and observed completion
across a fixed spec/seed matrix. A separate Playwright config uses the same server
and shared Platformer driver; ordinary regressions do not enforce its success rate.
See [PLATFORMER_BENCHMARK.md](PLATFORMER_BENCHMARK.md) for measurement and reproduction.

Stage 13.15 adds a small QA-owned analytic traversal diagnostic using runtime
physics constants, plus optional velocity on the existing debug bridge. The
shared QA driver uses safe candidate regions and records action evidence. No
generator, GameSpec or Reviewer architecture changes are involved. See
[PLATFORMER_RELIABILITY.md](PLATFORMER_RELIABILITY.md) for scope and verification.

Stage 13.16 extends this same driver with three samples per safe interval, one
onward transition, geometry-derived delayed horizontal input, and ceiling-aware
arc estimates. Candidate continuation is a ranking estimate; actual state is read
again after landing. Intermediate contact uncertainty and evidence-gated failure
classification remain QA-owned. GameSpec, Reviewer, generator, physics and assets
are unchanged. See [PLATFORMER_LOOKAHEAD.md](PLATFORMER_LOOKAHEAD.md).

## Platformer

The schema supports landscape/template/Phaser games. The level generator uses the
generation seed, settings and viewport height to place rectangular platforms,
spawn, goal, enemies, hazards and collectibles. Jump reach constrains platform
gaps and rises. Enemies take priority over hazards, with at most one danger per
eligible platform; spawn and finish areas are protected.

The scene supports held left/right input, grounded jumps, camera follow,
stationary lethal enemies/hazards, collectible scoring (+10), death, completion
and restart. Hazard artwork uses the base `obstacle` role.

Optional roles are `enemy`, `collectible`, `goal`, `level_tiles` and `score_icon`.
Enemy, collectible and goal have scene fallbacks; missing/invalid tileset metadata
falls back to plain platform rectangles. The built-in asset manager supplies a
deterministic SVG atlas when a tileset is requested. The score HUD works without
its decorative icon.

Platform collision rectangles are independent of generated tiles. Other entity
hitboxes use fixed world-space dimensions from `runtime/src/platformer-physics.ts`,
re-exported by `platformer-bodies.ts`; dynamic
body sizes compensate for visual scale before passing dimensions to Phaser.
The debug bridge exposes read-only geometry and gameplay state for browser QA.

Stage 13.17 adds an opt-in `?platformerDiagnostics=1` debug provider for bounded
real-Arcade step capture and isolated supported-input trials. It is absent in
normal games. Diagnostic support-region graphs preserve uncertain transitions;
only sufficient geometry/physics cut certificates can establish no goal route.
These tools do not run in Reviewer or gameplay navigation.

Platformer QA releases movement using observed horizontal advance between render
samples, accounting for old velocity being integrated before a released key is
consumed. The same self-contained browser callback is covered by deterministic
input-cadence tests. Route selection remains the existing bounded lookahead.

After proving four low-jump layouts unreachable, hazard generation now limits
exposed height when a height-reachable lethal body is too wide to clear during
the jump. It preserves hazard body dimensions, counts, horizontal placement and
random streams. Gravity, speed and jump force are unchanged; the existing 60 Hz
Arcade default is explicitly shared. This local clearance invariant does not
certify arbitrary generated routes. See [PLATFORMER_PHYSICS_PROOF.md](PLATFORMER_PHYSICS_PROOF.md).

## Assets

Profiles are character, npc, item, obstacle, background, ui and tileset.
Checked-in FLUX workflows reference FLUX.2 Klein 4B FP8, Qwen 3 4B and flux2 VAE;
the sprite detail workflow also references the pixel-art LoRA. Actual workflow
selection is configurable. Generation is optional via built-in/provider paths.
Semantic/vision validation is implemented behind a disabled-by-default flag;
production validation of that feature remains deferred.
