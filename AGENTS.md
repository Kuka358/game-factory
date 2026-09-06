# Game Factory — Agent Instructions

## Goal

Game Factory automatically creates playable HTML5 games from a user prompt.

The system should:

1. generate a GameSpec;
2. choose a deterministic game template;
3. resolve/generate assets;
4. build a Phaser game;
5. run QA;
6. export the result for target platforms.

## Repository rules

- This is a pnpm monorepo.
- Preserve strict TypeScript typing.
- Do not use `any` to silence type errors.
- Do not weaken schemas just to make TypeScript compile.
- Prefer discriminated unions over large interfaces with optional genre-specific fields.
- AI describes WHAT should be generated.
- Deterministic runtime code guarantees HOW it works.
- Generated visual assets must not define gameplay collision geometry.
- Keep asset generation optional where reasonable and provide deterministic fallbacks.
- Do not introduce new architecture without first checking existing packages and patterns.

## Validation

After meaningful changes run:

pnpm typecheck

Run relevant package tests/builds before considering a task complete.

Do not claim completion while typecheck or relevant tests fail.

## Git

- Work in small logical commits.
- Do not rewrite unrelated code.
- Do not commit generated assets, caches, benchmark output or secrets.
- Never modify `.env` values.
- Never expose API keys.

## Current architecture

GameSpec is a union:

- EndlessRunnerGameSpec
- PlatformerGameSpec

Templates currently:

- endless_runner
- platformer

Asset profiles:

- character
- npc
- item
- obstacle
- background
- ui
- tileset

FLUX.2 Klein is the production ComfyUI model.

Tilesets are generated as individual terrain patches and assembled deterministically.

## Platformer rules

Platformer is landscape-only for the first version.

Platform layout must be deterministic from `generation.seed`.

Platform physics must stay independent from generated artwork.

Platformer currently supports:

- left/right movement
- jump
- deterministic platforms
- camera follow
- goal
- enemies
- hazards
- collectibles
- generated level tiles
- score HUD

## Working style

Before implementing a task:

1. inspect relevant existing files;
2. understand existing architecture;
3. make the smallest coherent change;
4. run tests/typecheck;
5. fix failures;
6. summarize changed files and remaining work.

Do not ask the user to manually perform trivial edits you can perform yourself.