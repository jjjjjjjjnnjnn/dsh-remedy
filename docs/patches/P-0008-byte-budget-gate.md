# P-0008 — the byte budget becomes a gate instead of a paragraph

## Status

`tested`. It adds a build-side gate. Nothing the plugin mounts changes, so no
live journal can attest it. See "What this does not do".

## Severity

minor.

## Surface

`scripts`. The gate runner only.

## Depends on

none.

## Symptom

The byte budget is written down in the fact pack and in `README.md` — 28000
bytes for the emitted `repair-stream.js`, 10000 for `cli.js`, 68000 for the
plugin total — and it was crossed three times in three consecutive patches
before anyone noticed:

| batch | `dist/*.js` total | cap | how it was found |
|---|---|---|---|
| P-0005 (0.3.2) | 55815 | 53000 | by hand, after packing |
| P-0004 (0.3.3) | 64539 | 58000 | by hand, before repacking |
| P-0006, first attempt | **70389** | 68000 | by hand, after `pnpm pack` |

Each time the fix was a structural split done afterwards, and each time the
patch had already been written, built, tested and packed. The rule the project
states — "a patch that crosses a per-file number splits that file again" — had
no mechanism behind it: `grep -rn "68000" scripts/` found nothing, because the
number lived only in prose.

## Mechanism

`scripts/gate_size.mjs` stat-s each `packages/plugin/dist/*.js`, sums them, and
checks four things:

1. the plugin total is at or under 68000 bytes;
2. `repair-stream.js` is at or under 28000;
3. `session-scan.js` is at or under 14000 — the cap P-0006 needed and did not
   have, because that file grew from 11441 to 13237 in one patch with no line
   to cross;
4. any file above 10000 bytes that has no cap of its own fails the gate, so a
   new module cannot quietly become the biggest file uncapped.

The measured values at the time of writing are 67908 total, `repair-stream.js`
27925, `session-scan.js` 13237 and `cli.js` 8503, so every file starts inside
its line and the gate begins green rather than green-by-exception.

## Counter-evidence

| The claim | The counter |
|---|---|
| "the caps are too tight, so the gate will be red all the time" | measured: 92 bytes of headroom on the total, 75 on `repair-stream.js`, 763 on `session-scan.js`, 1497 on `cli.js` |
| "a byte cap will push patches into artificial splits" | the two existing splits (`stream-types.ts`+`failure-text.ts`, `cli-args.ts`+`scan-command.ts`) both *grew* the total; the caps are per-file, which is what makes a split the answer |
| "it duplicates the fact pack, so the two can disagree" | the fact pack quotes the numbers this gate measures; a drift makes `copy` red as well, and the numbers are the same ones |
| "a gate on bytes is not about behaviour" | the ninth module that took the total to 70389 was measured *after* 189 tests and five gates had passed green |

## What changes

| File | Change |
|---|---|
| `scripts/gate_size.mjs` | new gate: total, three per-file caps, and the uncapped-large-file rule |
| `audit/gate_ledger.json` | registers it with `requires_build: true` and a negative control |
| `audit/step_reviews.json` | `S15` reviews it on the five axes |
| `docs/patches/P-0008-byte-budget-gate.md` | this document |

## Invariants

1. The gate never writes: it only stats and compares.
2. `--mutate` compares the real total against a cap one byte below it, so a gate
   that stopped comparing is red instead of vacuously green.
3. `requires_build: true`, matching the other dist-reading gates, so `--fast`
   skips it exactly where there is no dist to measure.
4. The caps are constants in the script and restated in the fact pack; neither
   can move without the other.
5. A file that is large but capped is fine; a file that is large and uncapped is
   the failure this gate is for.
6. No dependency: `statSync` and the shared gate helpers only.

## Reproduction

```powershell
node scripts/gate_size.mjs            # six lines, exit 0
node scripts/gate_size.mjs --mutate   # 67908 of 67907, exit 1
node scripts/gate.mjs                 # ALL GREEN · 6 gates
node scripts/gate.mjs --mutate        # 6/6 gates caught their injected violation
```

## Evidence

- `scripts/gate_size.mjs`
- `audit/gate_ledger.json` — the `size` entry
- `audit/step_reviews.json` — `S15`
- `data/results/patch-registry-<stamp>.json` — the snapshot that carries P-0008

## What this does not do

- It does not shrink anything. The measured numbers stay what they were.
- It does not cap `core`. Core does not load at startup; the plugin is what the
  ceiling protects.
- It does not measure `dist/*.d.ts`. Types are paid at build time, not at load
  time, and the pack size is already tracked separately.
- It does not replace the structural splits. It makes the next crossing fail
  immediately instead of after a `pnpm pack`.
