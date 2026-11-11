# Contributing

## Before you start

`dsh-remedy` is an independent project and is not affiliated with DeepSeek.

Review upstream discussion deepseek-ai/deepseek-harness #4427 and existing GitHub issues before proposing changes. For security disclosures, use GitHub private vulnerability reporting on the repository rather than public issues.

## Development setup

Clone the repository and set up the local workspace:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run build
pnpm run typecheck
node packages/plugin/dist/cli.js verify
```

## Verification

Run the verification pipeline and the negative-control gate checks:

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

`pnpm run verify` runs the build, typecheck, 169 tests, and 5 gates (`ssot`, `registry`, `namespace`, `step-review`, `copy`).

In mutate mode (`node scripts/gate.mjs --mutate`), every gate must fail, because a gate that stays green under its injected violation is vacuous.

## Adding a patch

Adding a patch follows 5 steps:

1. Write the record: symptom, mechanism, counter-evidence, and boundaries in `docs/patches/`.
2. Add the registry entry as `drafted` in `packages/core/src/registry.ts`.
3. Write the failing test first before implementing the repair.
4. Live-verify on a real host before advancing status to `verified`.
5. Record the registry snapshot and update the ledger.

Status definitions and worked examples:
- P-0002 and P-0003 are the two worked examples of a patch that went all the way to `verified` with a live artifact: P-0002 has a run that repaired a real two-call fusion, and P-0003 has a run whose journal wrote a non-zero `refused`.
- Name P-0005 as the worked example of a `tested` patch on the resident seam: eleven negative controls and one measured fixture, no host run yet.
- Name P-0004 as the worked example of a `tested` patch that is honest about a different reason: it moves an offline reader and a redaction rule, so no journal can ever attest it, and its evidence is end-to-end tests plus a measured scan of one machine.
- Contrast all four: a `drafted` entry is only a written symptom, and a `tested` entry is evidence without a host run.

## Pull requests

- One project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.
- Open pull requests against the GitHub repository.

## Code style

- TypeScript ESM across all packages; relative imports end in `.js`.
- `erasableSyntaxOnly` is on; tests run with `node --test`.
- Gates use Node built-ins only.
- `dsh-remedy-core` has 0 runtime dependencies.

## Evidence rules

- `data/results` is written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256`.
- `verified` requires a `data/results/live-*` file.

## Scope

- One seam per patch.
- No `app.asar` patching.
- No retry-as-fix; retry is a stop-gap and `retryOnMalformed` defaults to 0. If a buffer cannot be proven, the original failure is re-thrown.
