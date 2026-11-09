Write the public `CONTRIBUTING.md` for the open-source repository `dsh-remedy`.

Audience: a developer who wants to add a patch or fix the plugin.

Required sections:

```
# Contributing
## Before you start
## Development setup
## Verification
## Adding a patch
## Pull requests
## Code style
## Evidence rules
## Scope
```

Rules:

- "Development setup": clone, `pnpm install`, `pnpm run build`, `pnpm run typecheck`,
  `node packages/plugin/dist/cli.js verify`.
- "Verification": `pnpm run verify` and `node scripts/gate.mjs --mutate`; explain
  that in mutate mode every gate must fail, because a gate that stays green under
  its injected violation is vacuous.
- "Adding a patch": the five steps from FACTS (write the record, add the registry
  entry as `drafted`, write the failing test first, live-verify before `verified`,
  record the registry snapshot and update the ledger).
- "Pull requests": one project per commit; describe what changed, why, the
  failing test, and the evidence path; do not mix a behavior change with a
  docs-only change.
- "Code style": TypeScript ESM, relative imports end in `.js`,
  `erasableSyntaxOnly` is on, gates use Node built-ins only, core has no runtime
  dependency.
- "Evidence rules": `data/results` is written by scripts, not by hand; every
  artifact has `produced_by`, `generated_at`, `schema_version` and a `.sha256`;
  `verified` requires a `data/results/live-*` file.
- "Scope": one seam per patch; no `app.asar` patching; no retry-as-fix.
- No invented contact email or chat server; point to GitHub issues and security
  advisories.
- Keep it practical and under 140 lines.
