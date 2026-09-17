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

### 13.13 Reviewer support — implemented
Deterministic Platformer semantic checks inside the existing Reviewer, existing
Designer repair flow, warning-only optional scoring/priority concerns and updated
LLM review instructions. See [PLATFORMER_REVIEWER.md](PLATFORMER_REVIEWER.md).
Concrete arbitrary-seed playability is not guaranteed.

### 13.14 Platformer robustness benchmark — complete
Six fixed configurations and five seeds, smoke/full modes, existing semantic
Reviewer and builtin build path, shared QA navigation, phased JSON/Markdown
reports and individual-case reproduction. This stage measures failures rather
than tuning them away. Smoke completed 4/6 cases; full completed 17/30, with 13
navigation failures retained for investigation. Guaranteed regressions pass.
See [PLATFORMER_BENCHMARK.md](PLATFORMER_BENCHMARK.md).

### 13.15 Platformer reliability diagnosis — complete
Diagnose the Stage 13.14 failures, add scoped traversal diagnostics, apply
evidence-backed shared QA fixes and compare the unchanged matrix. See
[PLATFORMER_RELIABILITY.md](PLATFORMER_RELIABILITY.md).

Unchanged matrix: full 17/30 → 21/30; smoke 4/6 → 5/6. No previously passing
full case regressed. Nine failures remain; investigate launch-clearance lookahead,
ceiling-limited transitions and alternate low-jump routes before generator changes.

### 13.16 Platformer traversal lookahead — complete
Bounded one-transition lookahead, multiple safe landing samples, next-takeoff
estimates, delayed horizontal input and ceiling-aware diagnostics extend the same
QA driver. Unchanged matrix: full 24/30 (80%), smoke 5/6; no previously passing
case regressed. Narrow-fast improves 1/5 → 4/5. Six navigation failures remain
uncertain globally; generator, Reviewer, physics and assets were not changed.
Build/typecheck, 135 unit tests and 22 browser regression checks pass. See
[PLATFORMER_LOOKAHEAD.md](PLATFORMER_LOOKAHEAD.md) for case analysis and reports.

### 13.17 Physical/geometric proof — complete

Bounded opt-in real-Arcade capture, controlled empirical trials and conservative
diagnostic region graphs. Four original low-jump layouts have sufficient lethal
cut certificates; a subsequent minimal exposed-hazard-height correction retains
hazards and variation and passes real crossing tests. High-jump 5→6 and narrow
post-hazard landings have successful alternative takeoffs/control witnesses.
No universal reachability claim or generic solver is introduced. See
[PLATFORMER_PHYSICS_PROOF.md](PLATFORMER_PHYSICS_PROOF.md). Final resumed benchmark:
24/30 full, 5/6 smoke; every Stage 13.16 success is preserved. Build/typecheck,
155 unit tests, 22 configured browser checks and physical diagnostics pass.
Decision gate A: recommend one final narrow QA stage for takeoff alignment and
demonstrated bypass selection. High-jump 6→7 remains uncertain. Stage 13.18 has
not started.

Full AI-generated Platformer expansion remains later work, after reliability
results are assessed. Do not start the next stage automatically.
Prompt
→ AI GameSpec
→ assets
→ build
→ QA
→ playable game.
