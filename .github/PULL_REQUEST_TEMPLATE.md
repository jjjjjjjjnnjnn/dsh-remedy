## What changed

Describe what changed in this pull request.

## Why

Explain the rationale, defect mechanism, or issue being addressed.

## Failing test

Describe or link to the failing test added to reproduce the issue before fixing it.

## Evidence

Provide the path to the evidence artifact (e.g. under `data/results/`) or reproduction logs.

## Limits

Document boundary conditions, refused inputs, or unmeasured cases.

## Checklist

- [ ] `pnpm run verify`
- [ ] `node scripts/gate.mjs --mutate`
- [ ] A test for behavior changes
- [ ] An evidence path when the patch claims `verified`
