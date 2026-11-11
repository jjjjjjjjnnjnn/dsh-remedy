# Contributing

## Before you start

Issues and pull requests are welcome. This is an independent project and is not affiliated with DeepSeek.

- For questions, feature requests, and defect reports, use GitHub issues: https://github.com/jjjjjjjjnnjnn/dsh-remedy
- For security advisories, use GitHub private vulnerability reporting on the repository. Do not use public issues for vulnerabilities.
- There is no contact email or chat server.
- The language of code, CLI output, and commit messages is English.

## Development setup

Clone the repository and run the setup commands:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy
cd dsh-remedy
pnpm install
pnpm run build
pnpm run typecheck
node packages/plugin/dist/cli.js verify
```

## Verification

Run the verification suite:

```bash
pnpm run verify
```

Run the negative controls:

```bash
node scripts/gate.mjs --mutate
```

In mutate mode every gate must fail, because a gate that stays green under its injected violation is vacuous.

## Adding a patch

Follow the five steps:

1. Write the record in `docs/patches/`.
2. Add the registry entry in `packages/core/src/registry.ts` as `drafted`.
3. Write the failing test first.
4. Live-verify before `verified`.
5. Record the registry snapshot and update the ledger.

P-0002 and P-0003 are the two worked examples of a patch that went all the way to `verified` with a live artifact: P-0002 has a run that repaired a real two-call fusion, and P-0003 has a run whose journal wrote a non-zero `refused`.

P-0005 is the worked example of a `tested` patch on the resident seam: eleven negative controls and one measured fixture, no host run yet.

P-0004, P-0006, P-0007, P-0008 and P-0009 are the worked examples of a `tested` patch that is honest about a different reason: P-0004 and P-0006 move the offline session reader, so no journal can ever attest them, and P-0007 moves the build-side copy channel that writes the outward files, so a broken channel cannot attest itself. Their evidence is end-to-end or unit tests plus a measured scan of one machine.

Contrast all seven: a `drafted` entry is only a written symptom, and a `tested` entry is evidence without a host run.

## Pull requests

- One project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.

## Code style

- TypeScript ESM.
- Relative imports end in `.js`.
- `erasableSyntaxOnly` is on.
- Gates use Node built-ins only.
- Core has no runtime dependency.

## Evidence rules

- `data/results` is written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256`.
- `verified` requires a `data/results/live-*` file.
- A patch that only moves an offline reader can never reach `verified`, so say `tested` and give the measured scan instead of inventing a host run.

## Scope

- One seam per patch.
- No `app.asar` patching.
- No retry-as-fix.
- A truncation is counted and never repaired, because a cut tail is missing bytes rather than a missing quote.
