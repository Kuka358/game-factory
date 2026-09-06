# Platformer Designer E2E (Stage 13.12)

Stage 13.10 is complete. Stage 13.11 is deferred because the real ComfyUI server
is unavailable. This stage adds no asset-generation workaround or runtime implementation.

Run from the repository root:

```sh
pnpm e2e:platformer:designer
```

On Windows with a blocked PowerShell launcher, use `pnpm.cmd`.
The command builds the monorepo, starts a local deterministic fake LLM, and submits
a human-readable crystal cave request to the production prompt pipeline. Designer
receives the existing Platformer schema and template capabilities; AJV, generation
settings, capability validation and the existing Reviewer run before the build.
The fake LLM stubs both Designer and Reviewer responses. No external LLM or image
server is required. This verifies integration, not a real model's interpretation quality.

The response fixture is authored independently in
`packages/ai/tests/fixtures/PlatformerTestProvider.ts`; it never loads the Stage 13.10
manual spec. It uses seed 2026, a 3000-unit level and different platform settings.
Eight assets must resolve from builtin sources. Existing seeded generation, builder,
Phaser runtime and GameSpec-based QA dispatch are reused. Five browser tests cover
boot, movement, jump, camera, collectible score, enemy/hazard death, fall/restart,
reachable goal, atlas rendering and image-size-independent collision geometry.
Artifacts are isolated under ignored `generated/platformer-designer-e2e-*` directories.

For a configured production LLM, the CLI entry point is:

```sh
pnpm generate --genre platformer "Create a small crystal cave platformer with crystals, hazards and an exit."
```

Asset policy for this general CLI command follows normal environment configuration.
The E2E command explicitly selects builtin assets without editing environment files.
Programmatic callers may pass `{ genre: "platformer", seed: 2026 }` to
`runPromptGenerationPipeline`. Seed omission retains existing random seed selection.
Genre omission retains runner selection. No inference or API/web genre selector is added.

Platformer remains landscape-only with fixed scoring (+10), goal, camera, death and
restart behaviors. Combat, health, moving enemies/platforms and arbitrary rewards
are not represented. Schema validity is not a universal playability guarantee; wider
seed/physics/control coverage belongs to Stage 13.14. Platformer-specific semantic
Reviewer improvements are the recommended next task, Stage 13.13.

## Verification

Verified on 2026-09-06 (PowerShell commands shown):

| Command | Result |
| --- | --- |
| `pnpm.cmd build` | PASS, all package builds |
| `pnpm.cmd typecheck` | PASS |
| `pnpm.cmd -r --filter '!@game-factory/qa' test` | PASS, 102 tests across 11 packages |
| `pnpm.cmd e2e:platformer:designer` | PASS, 5 browser tests, 8 builtin assets |
| `node scripts/platformer-e2e.mjs` | PASS, 5 browser tests |
| `node scripts/platformer-e2e.mjs --fallback-only` | PASS, 5 browser tests |
| `node packages/asset-generator/scripts/platformer-mock-e2e.mjs` | PASS, 5 browser tests, 15 synthetic image requests |
| `node scripts/runner-e2e.mjs` | PASS, 1 existing runner browser test |

In total, 21 browser assertions/tests passed without skips across these five runs.
The Designer run's `qa-report.json` is under
`generated/platformer-designer-e2e-nd8P4Q/crystal-exit/qa/`; its completion screenshot
was inspected and shows `LEVEL COMPLETE` with score 30.

The browser commands require the normal local server/Chromium subprocess permissions.
Existing Phaser chunk-size and Node experimental SQLite warnings remain non-fatal.
The new tests include two representative requests, invalid fields/ranges, wrong-genre
repair/exhaustion, portrait rejection, shared catalog capabilities, reviewer/capability
repair, default runner compatibility and CLI selection/errors. The test provider's
description-length bug discovered during repair testing was fixed within the stub.

## Changed files

- `packages/game-spec/src/schema.ts`, `validator.ts`: shared existing-schema selection.
- `packages/templates/src/Template.ts`: manifest genre uses the GameSpec union.
- `packages/ai/src/game-designer/GameDesigner.ts`,
  `packages/ai/prompts/game-designer/v1/system.md`: explicit genre, schema, retry and instructions.
- `packages/orchestrator/src/ai/generate-spec-from-prompt.ts`,
  `packages/orchestrator/src/run-prompt-generation-pipeline.ts`: shared catalog,
  genre/seed forwarding and metadata.
- `apps/cli/src/main.ts`, `apps/cli/src/parse-generation-input.ts`,
  `apps/cli/package.json`: explicit CLI option and test dependency.
- `packages/ai/tests/PlatformerDesigner.test.ts`,
  `packages/ai/tests/fixtures/PlatformerTestProvider.ts`,
  `packages/orchestrator/tests/platformer-designer.test.ts`,
  `apps/cli/tests/parse-generation-input.test.ts`: deterministic regression coverage.
- `scripts/platformer-designer-e2e.mts`, `scripts/runner-e2e.mjs`,
  `package.json`, `pnpm-lock.yaml`: reproducible integration entry points and dependencies.
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/ROADMAP.md`,
  `docs/PLATFORMER_E2E.md`, this document: current scope, deferred stage and verification.

No schema fields, level-generation algorithms, collision geometry, asset providers,
Phaser scenes or QA assertions were changed in Stage 13.12.
