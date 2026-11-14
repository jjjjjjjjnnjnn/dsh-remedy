# P-0032 — The ledger carried the narrative the patch docs already carried

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0031

## Symptom

After P-0031 capped the engine, `registry.js` stood at **66 303 / 68 000** — 1 697 bytes of
headroom against a record that measured **2 107–2 377 bytes** on the eight longest patches.
The next patch therefore could not be recorded at all. The two moves the handoff offered
were "split the registry by seam" or "sign a raise", and the first one does not produce a
byte: splitting moves records into other modules and still spends the same registry budget,
so a new record would cross 68 000 either way unless the sum was raised quietly.

## Root cause

The registry and `docs/patches/` were both written in long form. Every record carries a
`symptom`, a `rootCause` and four or five `limits` sentences that say the same thing its
patch document says at greater length — and the patch document is already mandatory
(`gate_registry` refuses a patch without one, P-0023). Measured per record:

| field | bytes (8 longest records) | read by code? |
|---|---|---|
| `symptom` | 377–506 | no |
| `rootCause` | 268–594 | no |
| `limits` | 314–1 069 | no |
| `id` / `title` / `surface` / `status` / `severity` | 43–85 (title) | `status` command |
| `evidence` / `guards` | paths | `gate_registry`, `gate_ssot` |
| `failureClasses` / `switchKey` | 2–4 entries | `explain` |

So the duplicated prose was not only unpaid storage: every mount of the plugin loads
`registry.js` to answer `status` and `explain`, which means the duplication was also paid on
the startup path.

## What changed

1. `packages/core/src/registry.ts`: the eight longest records (P-0002, P-0011, P-0013,
   P-0014, P-0010, P-0019, P-0028, P-0030) keep a one-sentence `symptom`, a one-sentence
   `rootCause`, and short `limits` bullets. The detail stays in the matching
   `docs/patches/P-*.md`, which already carried it (checked before deleting: every record's
   mechanism, the measured numbers and the named blind spot were present in its doc).
2. Measured result: the compaction alone took `registry.js` **66 303 → 61 509 bytes**
   (core dist 100 190 → 95 396). This patch's own record put the file at **63 217**, and
   P-0033's record then took it to **64 861** (core 98 748). The cap did not move;
   `CORE_CAP` and the registry cap are the same numbers P-0031 was signed with.
3. The rule this leaves behind, written here because it has no gate: **a new record states
   the defect in one sentence per field and points at its doc; the long form lives in the
   doc.** The next patch's record is written under that rule.

## Judgement (measured, not assumed)

- The cap was not loosened. The registry number is the same 68 000 and the measured value
  beside it in `scripts/lib/budgets.mjs` is updated, so the evidence a successor reads is the
  current byte count rather than the number that justified the cap.
- The "split the registry by seam" option was rejected on measurement, not taste: a split
  redistributes the same 68 000 across more files, and the new record would still not fit.
  It stays available later as a readability change, and it is no longer needed to pay for a
  record.
- Deleting prose is only safe while the doc still says it. `gate_registry` checks that a doc
  exists, not that it still carries those facts; that gap is recorded as `BS-19`, not hidden.

## What this does not do

- It compacts 8 of 31 records. The other 23 keep their long form until they are touched;
  they are the reserve this round did not need.
- It adds **no** per-record length threshold. A cap on a record is a threshold, and
  PROJECT_RULES section 1 requires a spec plus a human signature for one; that signature was
  asked for and not given in this round, so the rule above is documentation rather than a
  gate. The next record that grows the registry again will show whether that was enough.
- It does not make `docs/patches/` generated from the registry or the other way round. The
  two still say the same thing twice in different lengths; what changed is which one is the
  long form.

## Reproduction

```
node -e "import('./packages/core/dist/registry.js').then(m=>console.log(m.PATCHES.length))"
node -e "const fs=require('fs');console.log(fs.statSync('packages/core/dist/registry.js').size)"
node scripts/gate_size.mjs
node --test tests/governance/ledgers.test.ts
```
