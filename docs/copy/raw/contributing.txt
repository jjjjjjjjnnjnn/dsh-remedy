# Contributing

## Before you start

Issues and pull requests are managed through GitHub at https://github.com/jjjjjjjjnnjnn/dsh-remedy .
Report vulnerabilities using GitHub private vulnerability reporting on the public repository rather than public issues.
This repository maintains strict boundaries: one seam per patch, script-generated evidence, and verified negative controls.

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

Run verification across the project:

```bash
pnpm run verify
```

Then run negative controls:

```bash
node scripts/gate.mjs --mutate
```

In mutate mode every gate must fail, because a gate that stays green under its injected violation is vacuous.

## Adding a patch

Adding a patch follows five steps:
1. Write the symptom, mechanism, counter-evidence, and boundaries in `docs/patches/`.
2. Add the registry entry in `packages/core/src/registry.ts` as `drafted`.
3. Write the failing test and negative controls first, then the implementation.
4. Run live verification against a host before advancing to `verified`.
5. Record the registry snapshot with `node scripts/record_patch_registry.mjs` and update `audit/patch_ledger.json`.

Status distinctions:
- A `drafted` entry is only a written symptom.
- A `tested` entry is evidence without a host run.
- A `verified` entry is attested by a live host artifact in `data/results/live-*`.

Worked examples:
- P-0002 and P-0003 are the two worked examples of a patch that went all the way to `verified` with a live artifact: P-0002 has a run that repaired a real two-call fusion, and P-0003 has a run whose journal wrote a non-zero `refused`.
- P-0005 is the worked example of a `tested` patch on the resident seam: eleven negative controls and one measured fixture, no host run yet.
- P-0004, P-0006, P-0007, P-0008, P-0009 and P-0010 are the worked examples of a `tested` patch that is honest about a different reason: P-0004, P-0006 and P-0009 move the offline session reader, so no journal can ever attest them; P-0007 moves the build-side copy channel that writes the outward files, so a broken channel cannot attest itself; P-0008 is a build-side gate; and P-0010 changes strings a user reads rather than the resident seam. Their evidence is end-to-end or unit tests plus a measured scan of one machine.
- Contrast all seven: a `drafted` entry is only a written symptom, and a `tested` entry is evidence without a host run.

## Pull requests

- Submit one project per commit.
- Describe what changed, why, the failing test, and the evidence path.
- Do not mix a behavior change with a docs-only change.
- Pull requests must pass `pnpm run verify` and catch all injected violations under `node scripts/gate.mjs --mutate`.

## Code style

- Use TypeScript ESM across packages.
- Relative imports end in `.js`.
- The compiler flag `erasableSyntaxOnly` is on.
- Gates under `scripts/` use Node built-ins only.
- The core package `dsh-remedy-core` has no runtime dependency.

## Evidence rules

- Files in `data/results/` are written by scripts, not by hand.
- Every artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256` sidecar.
- Advancing a patch to `verified` requires a `data/results/live-*` file.
- A patch that only moves an offline reader can never reach `verified`, so say `tested` and give the measured scan instead of inventing a host run.

## Scope

- One seam per patch.
- No `app.asar` patching.
- No retry-as-fix.
- A truncation is counted and never repaired, because a cut tail is missing bytes rather than a missing quote.
