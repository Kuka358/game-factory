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

Asset smoke regression passes all 7 profiles.

Semantic/vision asset validation is intentionally deferred.

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

## Next goal

Build a complete manual Platformer E2E before enabling platformer generation in the AI Designer.

Do not enable AI platformer generation until the deterministic platformer pipeline is proven end-to-end.