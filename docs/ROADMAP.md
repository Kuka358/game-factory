# Roadmap

## Stage 13

### 13.10 Platformer manual E2E — implemented

Manual GameSpec validation → template resolution → asset requirements → asset
resolution/generation → builder → Phaser runtime → genre-specific QA.

Reproducible commands and test scope are in [PLATFORMER_E2E.md](PLATFORMER_E2E.md).
Production model visual verification remains Stage 13.11. AI Designer is unchanged.

### 13.11 Platformer generated level assets
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

### 13.12 AI Designer platformer support
Only after manual E2E passes:

- expose platformer schema to Designer
- allow genre selection
- update prompt/schema routing
- ensure generated GameSpec validates

### 13.13 Reviewer support
Add platformer-specific review checks.

### 13.14 Builder / QA
Expand the Stage 13.10 smoke assertions across seeds, movement settings and
control combinations; the current traversal driver targets the manual fixture.

### 13.15 Full AI-generated Platformer E2E
Prompt
→ AI GameSpec
→ assets
→ build
→ QA
→ playable game.
