# Roadmap

## Stage 13

### 13.10 Platformer manual E2E
Create a real PlatformerGameSpec and run the complete pipeline:

GameSpec
→ validation
→ template resolution
→ asset requirements
→ generated assets
→ builder
→ Phaser runtime
→ QA

Fix all integration problems found.

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
Add automated platformer QA assertions.

### 13.15 Full AI-generated Platformer E2E
Prompt
→ AI GameSpec
→ assets
→ build
→ QA
→ playable game.