# Roadmap

## Stage 13

### 13.10 Platformer manual E2E — implemented

Manual GameSpec validation → template resolution → asset requirements → asset
resolution/generation → builder → Phaser runtime → genre-specific QA.

Reproducible commands and test scope are in [PLATFORMER_E2E.md](PLATFORMER_E2E.md).
Production model visual verification remains Stage 13.11. Designer support is Stage 13.12.

### 13.11 Platformer generated level assets — deferred
The real ComfyUI server is unavailable. No real generation workaround is introduced.
Verify:

- level_tiles
- enemy
- collectible
- goal
- score_icon
- background
- player
- obstacle

Fallback behavior must continue working.

### 13.12 AI Designer platformer support — implemented

- reuse the existing Platformer schema and shared template catalog
- explicit Designer/pipeline genre and CLI `--genre platformer`; default runner
- authoritative validation and existing repair/review loops
- builtin prompt-to-browser E2E with a deterministic fake LLM, independent of the manual fixture

Run `pnpm e2e:platformer:designer`; see [PLATFORMER_DESIGNER_E2E.md](PLATFORMER_DESIGNER_E2E.md).

### 13.13 Reviewer support
Add platformer-specific review checks.

### 13.14 Builder / QA
Expand the Stage 13.10 smoke assertions across seeds, movement settings and
control combinations; the current traversal driver covers two integration scenarios.

### 13.15 Full AI-generated Platformer E2E
Prompt
→ AI GameSpec
→ assets
→ build
→ QA
→ playable game.
