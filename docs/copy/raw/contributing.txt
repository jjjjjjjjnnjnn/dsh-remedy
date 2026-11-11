# Contributing

Contributions to `dsh-remedy` are welcome. This document covers development workflow, verification requirements, patch lifecycle rules, and pull request guidelines.

## Before you start

`dsh-remedy` is an independent project and is not affiliated with DeepSeek.

There is no chat server or private contact email. For bug reports and questions, use GitHub issues on the repository:
https://github.com/jjjjjjjjnnjnn/dsh-remedy

For security reports, use GitHub private vulnerability reporting on the public repository.

## Development setup

Clone the repository and set up dependencies:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy
cd dsh-remedy
pnpm install
pnpm run build
pnpm run typecheck
node packages/plugin/dist/cli.js verify
```

## Verification

Run verification and negative control checks:

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

`pnpm run verify` runs the build, typecheck, tests, and 5 gates (`ssot`, `registry`, `namespace`, `step-review`, `copy`).

`node scripts/gate.mjs --mutate` verifies gate sensitivity. In mutate mode every gate must fail, because a gate that stays green under its injected violation is vacuous.

## Adding a patch

Adding a patch follows five sequential steps:

1. Write the defect record in `docs/patches/`: document symptoms, failure mechanism, counter-evidence, and boundaries.
2. Add the registry entry to `packages/core/src/registry.ts` with status `drafted`.
3. Write the failing test first: define fixtures and negative controls before implementing repairs.
4. Live-verify on a real host before marking status `verified`: execute against DeepSeek Harness and save evidence to `data/results/live-*`.
5. Record the registry snapshot by running `node scripts/record_patch_registry.mjs` and update `audit/patch_ledger.json`.

P-0002 and P-0003 are the two worked examples of a patch that went all the way to `verified` with a live artifact: P-0002 has a run that repaired a real two-call fusion, and P-0003 has a run whose journal wrote a non-zero `refused`.

P-0005 is the worked example of a `tested` patch on the resident seam: eleven negative controls and one measured fixture, no host run yet.

P-0004 is the worked example of a `tested` patch that is honest about a different reason: it moves an offline reader and a redaction rule, so no journal can ever attest it, and its evidence is end-to-end tests plus a measured scan of one machine.

Contrast all four: a `drafted` entry is only a written symptom, and a `tested` entry is evidence without a host run. A `verified` entry requires a live host run with an artifact in `data/results/live-*`.

## Pull requests

- One project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.
- Ensure all tests pass and `node scripts/gate.mjs --mutate` catches every gate before submitting.

## Code style

- TypeScript ESM throughout.
- Relative imports end in `.js`.
- `erasableSyntaxOnly` is on.
- Gates use Node built-ins only.
- `dsh-remedy-core` has no runtime dependency.

## Evidence rules

- `data/results` is written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256`.
- `verified` requires a `data/results/live-*` file.

## Scope

- One seam per patch: interventions attach strictly to declared interface boundaries such as `llm/stream`.
- No `app.asar` patching: host packages are not modified on disk.
- No retry-as-fix: retry is a stop-gap, not the fix (`retryOnMalformed` defaults to 0). Unprovable argument shapes are re-thrown rather than swallowed.
