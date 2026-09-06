# Architecture

This describes the implementation through Stage 13.10 manual Platformer E2E.
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
  suites target endless runner and the manual Platformer fixture. QA selects the
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

The AI path adds Designer/Reviewer processing before this pipeline. Its template
catalog and Designer output schema remain runner-only. Platformer runtime support
does not imply AI Platformer generation is enabled.

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
hitboxes use fixed world-space dimensions in `platformer-bodies.ts`; dynamic
body sizes compensate for visual scale before passing dimensions to Phaser.
The debug bridge exposes read-only geometry and gameplay state for browser QA.

## Assets

Profiles are character, npc, item, obstacle, background, ui and tileset.
Checked-in FLUX workflows reference FLUX.2 Klein 4B FP8, Qwen 3 4B and flux2 VAE;
the sprite detail workflow also references the pixel-art LoRA. Actual workflow
selection is configurable. Generation is optional via built-in/provider paths.
Semantic/vision validation is implemented behind a disabled-by-default flag;
production validation of that feature remains deferred.
