# Contributing

## Before you start

Issues and pull requests are welcome.

For bug reports and questions, open a GitHub issue.

For security reports, use GitHub private vulnerability reporting on the public repository (security advisories):
https://github.com/jjjjjjjjnnjnn/dsh-remedy

Do not use unlisted chat servers or email addresses.

## Development setup

Clone the repository and prepare the workspace:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run build
pnpm run typecheck
node packages/plugin/dist/cli.js verify
```

## Verification

Run the verification suite and negative controls:

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

`pnpm run verify` runs the build, typecheck, tests, and the 5 gates.

In mutate mode, every gate must fail, because a gate that stays green under its injected violation is vacuous. All 5 gates must catch their injected defect.

## Adding a patch

Follow the five steps in order:

1. Write the record in `docs/patches/`.
2. Add the registry entry in `packages/core/src/registry.ts` as `drafted`.
3. Write the failing test first.
4. Live-verify before moving status to `verified`.
5. Record the registry snapshot and update the ledger.

P-0002 and P-0003 are the two worked examples of a patch that went all the way to `verified` with a live artifact: P-0002 has a run that repaired a real two-call fusion, and P-0003 has a run whose journal wrote a non-zero `refused`. Contrast them: a `drafted` entry is only a written symptom, and a `tested` entry is negative controls without a host run.

## Pull requests

- One project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.
- A behavior change requires a failing test first.

## Code style

- TypeScript ESM.
- Relative imports end in `.js`.
- `erasableSyntaxOnly` is on.
- Gates use Node built-ins only.
- `dsh-remedy-core` has no runtime dependency.

## Evidence rules

- `data/results` is written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256`.
- `verified` requires a `data/results/live-*` file.

## Scope

- One seam per patch.
- No `app.asar` patching.
- No retry-as-fix: retry is a stop-gap, not the fix (`retryOnMalformed` defaults to 0).
