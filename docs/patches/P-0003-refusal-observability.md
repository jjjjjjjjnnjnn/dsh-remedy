# P-0003 — A refusal must be observable, and a withdrawal must not read as a repair

**Status**: `tested` (unit tests + negative controls; no live host run yet)
**Severity**: minor — the repair behaviour is unchanged; what changes is whether the journal can tell the truth about it
**Surface**: `llm/stream`
**Depends on**: P-0001 and P-0002 (same seam; this patch only changes how the seam accounts for itself)

## Symptom

`RemedyMonitor.recordRejected` incremented `fused` and `unrepaired` for **every**
rejection (`packages/plugin/src/repair-stream.ts:122-126`, now `:164-190`). Three
different events therefore collapsed into one number, and the verdict lied in two
directions:

1. A call whose arguments were plain bad JSON (`not-an-object-sequence`,
   `single-object`, `unparsable-fragment`, …) is **not** a fusion. Counting it as
   `fused` made a stream whose only defect was a syntax error read `degraded`
   ("repair incomplete") — the opposite of the truth, and `quiet` was unreachable
   for that class of stream at all.
2. A repair that was proven and then **withdrawn** (`rolled-back`) left `fused=1`
   and `unrepaired=1` with `repaired=0`. `judgeRemedy` reports `degraded`, which is
   right by accident, but the counters cannot distinguish "we proved it and gave it
   back" from "we could not prove it" — so the journal could not say what happened.
3. `name-changed` (a P-0002 refusal, not a fusion) was booked exactly like a proven
   fusion that failed to split.

The audit recorded this as `BS-12` and P-0002 deliberately left it open: changing
`fused` means changing the verdict vocabulary, which is a separate seam from the
rescue-integrity work. This patch is that separate seam.

## Counter-evidence (kept, not fixed here)

- The measured adapter for this host emits no `block-end` for a tool call (session
  9045e2ec, seq 524), so the counters for the `block-end` path are proven by unit
  tests only. The `planRescue` path (the one that was measured live) is covered.
- No live journal exists yet in which `refused` or `withdrawn` is **non-zero**. The live
  run of 2026-11-10 (`data/results/live-2026-11-10T14-45-00.000Z.json`) does prove the
  eight-field row is written by a real host — the `repaired` event carries
  `refused:0, withdrawn:0` — but that stream was a clean repair, so the new buckets were
  only ever written as zero. They stay `tested`, not `verified`.
- The four verdict states are frozen. `fused` is now honest (it means a fusion was
  actually seen), but `repaired`/`degraded` still cannot express "observed, refused,
  and correctly not repaired" — only the counters can.

## What changed

| # | Change | File:line |
|---|---|---|
| 1 | `RemedyCounters` gains `refused` and `withdrawn`; the six existing fields keep their meaning | `packages/core/src/verdict.ts:18-48` |
| 2 | `recordRejected` books three buckets: refusal only, fusion+refusal (own budget), withdrawal | `packages/plugin/src/repair-stream.ts:164-190` |
| 3 | `recordAbandoned` is the only new writer of `unrepaired`: a proven split abandoned because a sibling candidate was refused | `packages/plugin/src/repair-stream.ts:187-205` |
| 4 | `planRescue` books the proven-but-abandoned split separately from the refused candidate | `packages/plugin/src/repair-stream.ts:397-421` |
| 5 | A withdrawn `block-end` repair books `withdrawn` (rolled-back) plus the abandoned proof | `packages/plugin/src/repair-stream.ts:463-490` |
| 6 | `formatRemedyVerdict` appends `refused=` and `withdrawn=` to the one counter row (eight names) | `packages/core/src/verdict.ts:73-88` |
| 7 | `registry.ts` records P-0003 and retires the P-0002 limit that pointed at BS-12 | `packages/core/src/registry.ts:80-108` |

### The booking table

| code | `fused` | `unrepaired` | `refused` | `withdrawn` |
|---|---|---|---|---|
| `not-an-object-sequence`, `single-object`, `unparsable-fragment`, `fragment-not-object`, `missing-id`, `missing-name`, `name-changed`, any unknown code | — | — | +1 | — |
| `too-many-calls` (our own `maxCalls` budget) | +1 | +1 | +1 | — |
| `rolled-back` | — | — | — | +1 |
| `consumer-abort` (P-0002 behaviour kept) | +1 | +1 | — | +1 |
| `truncated` | — | — | — | — (goes to `recordTruncated`) |
| `abandoned-rescue` (proven split dropped by all-or-nothing) | +1 | +1 | — | — |

`too-many-calls` and `consumer-abort` keep `fused` + `unrepaired` even though they
also move a new counter. That is not redundancy, it is the frozen vocabulary:
`judgeRemedy` returns `repaired` whenever `fused > 0` and `unrepaired === 0`, so a
proven fusion we declined to split would otherwise be published as "defect seen and
repaired" while nothing was repaired — precisely the lie P-0001 exists to prevent.
The new counters are reported, not judged; `judgeRemedy` reads none of them.

## Invariants (each has a negative control)

- A refusal that was never proven to be a fusion moves `refused` and leaves `fused`
  and `unrepaired` at zero, so the stream reads `quiet`.
- A name conflict moves `refused`, not `fused`.
- `too-many-calls` moves `fused` + `refused` + `unrepaired`, and reads `degraded`.
- A withdrawn repair moves `withdrawn`; `unrepaired` still means exactly "a proven
  fusion that was not repaired", never "something was withdrawn".
- A `max-tokens` stream moves `truncated` only and records no rejection.
- `judgeRemedy` returns the same state, headline and `reasons` as P-0002 for the same
  `fused`/`repaired`/`unrepaired` numbers, whatever `refused` and `withdrawn` say.
- `formatRemedyVerdict` stays one line and names all eight counters.

## What this does not fix

- The verdict vocabulary (four states, fixed order). A stream whose only defect is a
  syntax error now reads `quiet` — the honest state, because the seam did see it and
  did correctly refuse; but `quiet` still cannot say "and we refused one call".
  Only `formatRemedyVerdict`'s counter row carries that.
- The forward-only journal: `refused`/`withdrawn` appear in new lines, and old
  journal lines keep the old six-field counters. `status --json` reads the last line,
  so a mixed journal reports whichever shape was written last, and no migration
  rewrites old bytes.
- Attribution of *why* the upstream glued two objects, and the relay that assigned one
  index two calls (P-0001 limits, unchanged).
- Any live proof: this is a counters change with no behavioural change to the repair
  decision, so the reachable evidence is unit-level.

## Reproduction

```powershell
node --test --test-reporter=spec tests/unit/verdict.test.ts tests/unit/repair-stream.test.ts
node packages/plugin/dist/cli.js status --json
```

## Evidence

- `docs/patches/P-0003-refusal-observability.md` — this file
- `tests/unit/verdict.test.ts` — the eight-counter row and the frozen-state control
- `tests/unit/repair-stream.test.ts` — plain refusal, `too-many-calls`, withdrawal,
  truncation-withdrawal, and the updated all-or-nothing expectation
- `audit/blind_spots.json` — `BS-12`, closed by this patch with the remaining caveat
  (a mixed-shape journal is not migrated)
- `data/results/live-2026-11-10T14-45-00.000Z.json` — the first real-host journal that
  writes all eight counters (`refused:0, withdrawn:0` on a clean repair)
