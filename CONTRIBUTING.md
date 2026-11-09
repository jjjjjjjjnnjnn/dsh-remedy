# Contributing

## Before you start

dsh-remedy is an independent project and is not affiliated with DeepSeek. The software is released under the MIT license.

- Report defects or propose changes by opening a GitHub issue at https://github.com/jjjjjjjjnnjnn/dsh-remedy.
- Report security vulnerabilities through GitHub private vulnerability reporting under security advisories. Do not open public issues for security vulnerabilities. No public contact email or chat server is provided.
- Environment requirements: Node >= 22.19, pnpm, and DeepSeek Harness >= 0.2.0-rc.1 < 0.3.0-0.

## Development setup

Clone the repository and prepare the workspace:

```sh
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run build
pnpm run typecheck
node packages/plugin/dist/cli.js verify
```

## Verification

Run the full verification suite:

```sh
pnpm run verify
```

Run the negative-control mutation check:

```sh
node scripts/gate.mjs --mutate
```

In mutate mode every gate must fail, because a gate that stays green under its injected violation is vacuous. All 5 gates must fail under mutation.

## Adding a patch

Follow these 5 steps when introducing a patch:

1. Write the patch record in `docs/patches/` with the symptom, mechanism (identifying file and line), counter-evidence, and limits.
2. Add the registry entry in `packages/core/src/registry.ts` with status `drafted`.
3. Write the failing test first, establishing negative controls and fixtures before implementation.
4. Live-verify on a real DeepSeek Harness profile before setting status to `verified`, placing the resulting artifact in `data/results/live-*`.
5. Record the registry snapshot with `node scripts/record_patch_registry.mjs` and update `audit/patch_ledger.json`.

## Pull requests

- One project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.
- Verify that `pnpm run verify` and `node scripts/gate.mjs --mutate` pass before submitting.

## Code style

- TypeScript ESM across all packages.
- Relative imports end in `.js`.
- `erasableSyntaxOnly` is on.
- Gates in `scripts/` use Node built-ins only.
- `@dsh-remedy/core` has no runtime dependency.

## Evidence rules

- `data/results` is written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version`, and a `.sha256` checksum file.
- Setting status to `verified` requires a `data/results/live-*` file.

## Scope

- One seam per patch (for example, `llm/stream`).
- No `app.asar` patching.
- No retry-as-fix: retry is a stop-gap, not the fix. The default for `retryOnMalformed` is 0.
