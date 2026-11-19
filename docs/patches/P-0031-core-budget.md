# P-0031 — The engine every mount loads had no budget, and a comment said it did

**Status**: `verified`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0012

## Symptom

`tests/governance/budget-split.test.ts` says, correctly, that the governance test follows
only **relative** imports and that `dsh-remedy-core` is "a separate package with its own
budget". The first half is true. The second half described a plan:

```
$ grep -n "CORE" scripts/lib/budgets.mjs scripts/gate_size.mjs
(no output)
```

By R41 the plugin half had **87 bytes** of headroom (82 913 of 83 000) while the engine
that every mount also loads had grown to **98 247 emitted bytes** — **64 360** of them
`registry.js`, which gains one record per patch (P-0029 and P-0030 alone added about
4.6 KB). The plugin was being paid for byte by byte, and the larger half was not measured
at all.

## Root cause

The budget was written for one package before the 0.4.0 split (`dsh-remedy-core` became a
separate package there). The split added a package without adding a measurement, and the
sentence that acknowledged the blind spot — "its own budget" — was never turned into a
file anyone could point at. That is the same family as P-0014 / P-0020 / P-0026: a claim
whose only reader was the person who wrote it.

## What changed

1. `scripts/lib/budgets.mjs`: `CORE_CAP = 104000`, `CORE_FILE_CAPS = [['registry.js',
   68000]]`, and a third entry under `approved_by` recording the measured pair
   (core 98 247, registry 64 360), the reason (the plugin was at 87 bytes while the engine
   was uncapped), and the signature (the repository owner, in session, 2026-11-14).
2. `scripts/gate_size.mjs`: measures `packages/core/dist/*.js`, adds `core-total` and
   `core-file:registry.js`, and extends `handoff-bytes` so the live handoff's core row must
   equal the measurement (the same contract the plugin row already had).
3. `tests/governance/budget-split.test.ts`: pins the two new constants, the recorded
   measurement and the fact that the registry cap is smaller than the total.
4. `docs/HANDOFF.md`: the byte row now reads the two accounts together —
   plugin **82 913 / 83 000**, core **98 247 / 104 000** (registry 64 360 / 68 000).

## Judgement (red first)

The first calibration was deliberately measured, not guessed: the cap was set at 64 000
for `registry.js` and the gate went red on the real build —

```
FAIL  size/core-file:registry.js — 64360 of 64000 bytes
```

— because P-0029 and P-0030 had added records after the number was written down. That red
is the check doing its job; the cap was raised to 68 000 **with the measured value in the
same file**, not loosened until green. `--mutate` proves the total check:

```
FAIL  size/core-total — 98247 of 98246 bytes across 10 engine modules
```

## What this does not do

- It covers emitted core JavaScript only. `.d.ts`, fixtures and package-root files are
  outside it, exactly like the plugin budget.
- It caps the total and `registry.js`, not each of the other nine modules; one of those can
  still grow inside the total.
- It does **not** fold core into `residency`. The plugin numbers stay plugin-only, so the
  startup account is now two rows read together rather than one number pretending to be the
  whole mount. Folding them would require a new residency number and another signature.
- The registry is data: the cap forces a decision (split the registry, or sign a raise) at
  the next record that does not fit, rather than describing a defect fixed once.

## Reproduction

```
node scripts/gate_size.mjs
node scripts/gate_size.mjs --mutate
node --test tests/governance/budget-split.test.ts
grep -n "CORE_CAP\|CORE_FILE_CAPS\|98 247" scripts/lib/budgets.mjs
```
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

