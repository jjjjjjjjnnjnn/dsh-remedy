# P-0012 — One byte cap for two load paths is a cap that taxes the wrong half

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0008

## Symptom

P-0008 turned the byte budget into a machine check, and that check summed **every**
emitted module into one number:

```
PASS  size/total  67908 of 68000 bytes across 9 files
```

Two things live inside that number and they are not the same thing:

| half | files | measured | who loads it |
|---|---|---|---|
| residency | `index`, `failure-listener`, `repair-stream`, `monitor`, `failure-text`, `stream-types`, `session-log` | 41 075 | every mounted plugin, at startup |
| cli | `cli`, `cli-args`, `scan-command`, `session-scan`, `explain-command` | 40 665 | only when someone runs the command |

A daemon pays the first half on every session and the second half **never**.
Because the gate compared their sum, every byte a resident patch needed had to
be financed by deleting CLI code, and every byte a new CLI command needed
competed with the hot path.

That is not hypothetical. It is measurable in the two landed cuts:

- P-0009 landed at **67 997 of 68 000** — three bytes of headroom — after its
  author trimmed explanatory prose out of the emitted plugin to fit.
- P-0011 needed **4 263 bytes** of new module. Under the old cap that was
  impossible: the only way to pay for it was to delete the reasoning that
  justifies the counters, which R15 had already recorded as the wrong trade.

## What changed

`scripts/lib/budgets.mjs` (new) owns the numbers; `scripts/gate_size.mjs` reads
them and checks five things instead of four:

```
PASS  size/every-module-is-classified   every emitted module belongs to one load path
PASS  size/residency                    41075 of 44000 bytes across 7 resident modules
PASS  size/cli                          40665 of 42000 bytes across 5 CLI modules
PASS  size/total                        81740 of 83000 bytes across 12 files
PASS  size/file:repair-stream.js        21382 of 28000 bytes
```

The silent failure mode this closes is **reclassification**: moving a file from
the expensive half to the cheap half would satisfy the gate while changing
nothing real. So the check does not trust the list — it requires every emitted
module to appear in exactly one list, and
`tests/governance/budget-split.test.ts` walks the actual module graph from
`packages/plugin/src/index.ts` and requires the residency list to match it **in
both directions**: a resident module the list omits fails, and a listed file the
loader never reaches fails as unpaid debt. A second test asserts the CLI entry
does not import the resident seam.

## The threshold change, and its signature

PROJECT_RULES section 1 says a threshold change needs a spec and a human
signature. Both moves happened in one session, and both are recorded in
`scripts/lib/budgets.mjs` with the measurement that justified them:

1. **split introduced** — residency ≤ 40 000, cli ≤ 33 000, total ≤ 73 000,
   approved by the repository owner in R20 after the measured pair was shown.
2. **CLI half widened** — residency ≤ 44 000 (unchanged), cli ≤ 42 000,
   total ≤ 83 000, same session, because `explain` is a CLI-only command
   (8 970 emitted bytes) that a mounted plugin never imports, and the CLI half
   had been sized before any command was added to it.

The alternative in both cases — trim the emitted prose — was rejected for the
reason R15 already gave: prose in `dist/*.js` is the only record of why the code
looks the way it does, and paying for a feature by deleting the explanation of
the last feature is how this project would slowly become inexplicable.

## What this does not do

- It drops no per-file cap. `repair-stream.js` ≤ 28 000, `session-scan.js` ≤
  14 000 and `cli.js` ≤ 12 000 all still apply, and a file above 10 000 bytes
  with no cap is still refused.
- It cannot tell good growth from bad; it only says which half pays.
- It caps emitted JavaScript only — not `.d.ts`, fixtures or package-root files.
- The governance test is honest about its blind spot: it follows **relative**
  imports inside this package. A module reached through `dsh-remedy-core` or a
  dynamic `import()` would not be caught by it.

## Reproduction

```
node scripts/gate_size.mjs                # five checks, three subtotals
node scripts/gate_size.mjs --mutate       # residency, cli and total all caught
node --test tests/governance/budget-split.test.ts
grep -n 'approved_by' scripts/lib/budgets.mjs
```
