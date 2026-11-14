# P-0006 — A scan that counts only the class it repairs is a map with one road

- **Status**: `tested` (no live artifact: this patch changes the offline reader, not the resident seam)
- **Severity**: minor
- **Surface**: `cli` (`packages/plugin/src/session-scan.ts`)
- **Depends on**: P-0004 (the scanner that reads the right log)

## Symptom

`dsh-remedy scan` answers "how many fused calls and how many `MALFORMED_RESPONSE`
turns". Every other way a turn can end is invisible. On this host that means the
tool reports one number out of four:

```
$ node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --json
attempts=358 fused_calls=38 fusion_failures=44 repairable=39 unreadable_lines=0
```

The 78 session files record **287 `turn/end` events**. The scanner sees 44 of
them. The census, read straight off the events with no inference:

| `reason.kind` | turns |
|---|---|
| `completed` | 92 |
| `max-tokens` | 88 |
| `error` | 99 |
| `aborted` | 8 |

and inside `error`, by `reason.error.code`:

| code | turns |
|---|---|
| `MALFORMED_RESPONSE` | 44 |
| `UNSUPPORTED_REASONING_EFFORT` | 36 |
| `SERVER` | 16 |
| `UNKNOWN` | 1 |
| `MISSING_CREDENTIAL` | 1 |
| `INVALID_REQUEST` | 1 |

So the largest single failure class on this host — **88 truncated turns, 31% of
all turns** — is not reported at all, and neither is the second largest
(`UNSUPPORTED_REASONING_EFFORT`, 36). A reader of the scan output would conclude
that a turn can only die on `MALFORMED_RESPONSE`, which is false in this very
sample.

This is the same class of defect P-0004 fixed one level down: a reader that
prints a zero for something it never looked at. P-0004 was "the file was never
decoded"; this one is "the event was decoded and then dropped on the floor".

## Mechanism

`packages/plugin/src/session-scan.ts` — the `turn/end` branch (0.3.3, around
`:204-228`) reads `data.reason`, then returns early twice:

```ts
if (asString(reason.kind) !== 'error') continue
if (asString(error.code) !== 'MALFORMED_RESPONSE') continue
```

Both `continue`s are deliberate for the *repair* question — only
`MALFORMED_RESPONSE` is repairable — but the report is also the fault map, and
the map inherits the filter. `max-tokens`, `aborted` and every other error code
leave the loop before anything is counted.

The events themselves are unambiguous. A probe over all 287 events
(`.tmp/probe-reason-shape.mjs`) found three shapes and no ambiguity:

```
shapes= [["flat=false inner=false innerError=false",180],
         ["flat=true inner=false innerError=false",99],
         ["flat=false inner=true innerError=false",8]]
nestedWithoutFlat=0
```

`reason.kind` is present at the top level in all 287; when it is `error`, the
code sits at `reason.error.code` in all 99. Counting them needs no guessing.

## Counter-evidence (what the scanner gets right, and must keep getting right)

| Question | Today |
|---|---|
| Is `fused_calls` really a fusion count, not a failure count? | yes: it is computed from `assistant/attempt` buffers, never from `turn/end` |
| Does a filtered (`--since`) scan still say what it skipped? | yes: `before_since`, and an unstamped event inside a window is `unreadable`, never assumed in |
| Can the new counts be confused with the repaired class? | no, provided `fusion_failures` keeps its exact current meaning and the census is a separate object |
| Is a truncated turn attributable to a tool call? | **no** — see below, and that is why it stays unrepairable |

The attribution probe (`.tmp/probe-truncation-attribution.mjs`) asked whether a
`max-tokens` turn could name the call that was cut: of 88 truncated turns, 12 had
an `assistant/attempt` earlier in the file, and **0** had an
`assistant/attempt` for the same `turn` carrying a tool-call buffer. The event
carries `data.turn` and nothing else; there is no call id to name. Counting is
therefore the whole honest answer for this class: the scan must say **88 turns
died here**, not pretend to know which call it was.

## What changes

| # | Change | Where |
|---|---|---|
| 1 | `ScanReport` gains `turns: ScanTurnCensus` and `error_codes: Record<string, number>`; both additive, so an old artifact still parses and a new one is strictly more informative | `packages/plugin/src/session-scan.ts` |
| 2 | `ScanTurnCensus` = `{ completed, max_tokens, aborted, error }`, counted from the top-level `reason.kind` of every `turn/end`, accepted events only | same |
| 3 | `error_codes` counts `reason.error.code` for `kind === 'error'`, redacted like every other string that leaves the scanner | same |
| 4 | `addReport` sums both across a directory scan | same |
| 5 | The human-readable `scan` output prints one `turns=` line and one `error codes` block, and the `--json` / `--out` payload carries the same fields | `packages/plugin/src/scan-command.ts` |
| 6 | `fusion_failures` keeps its exact meaning: `MALFORMED_RESPONSE` turns only | unchanged on purpose |

The exit code stays `1` for "found fusion or a malformed turn" and `0` otherwise.
A scan that finds 88 truncations and no fusion is **not** a finding for this
plugin: it cannot repair them, and returning `1` would make `scan` useless in a
script. That is stated here so a later change does not quietly promote the
census into a finding.

## Invariants

1. The census counts only `turn/end` events the scanner already accepted; an
   unreadable line never contributes to it.
2. The census is exact, not estimated: no sampling, no extrapolation, no
   "assuming the rest look the same".
3. `fusion_failures` and `repairable_failures` are unchanged in meaning and
   value for every existing artifact.
4. `--since` applies to the census as well, and the dropped events are still
   reported as `before_since`.
5. A directory scan sums the census per file, and each row keeps its own.
6. Every code string is redacted before it leaves the scanner.
7. Exit codes are untouched: the census is reported, never judged as a finding.
8. No new dependency, no new module in the plugin `dist` unless the byte budget
   requires the split, and `session-scan.js` stays under its cap.

## Reproduction

```
# The gap, on this host, before the patch:
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --json
#   -> fusion_failures 44, and nothing about the other 243 turns

# The census, read straight off the events:
node .tmp/probe-turn-reason.mjs
#   -> turn/end=287 kinds=[error 99, completed 92, max-tokens 88, aborted 8]
#      codes=[MALFORMED_RESPONSE 44, UNSUPPORTED_REASONING_EFFORT 36, SERVER 16, ...]

# Why the truncated class cannot be repaired (it is counted, not fixed):
node .tmp/probe-truncation-attribution.mjs
#   -> truncatedTurns=88 sameTurnWithBuffers=0
```

## Evidence

- `docs/patches/P-0006-turn-census.md` (this file)
- `tests/unit/session-scan.test.ts` (the census cases)
- `tests/e2e/cli.test.ts` (the `scan` output cases)
- `data/results/patch-registry-<stamp>.json` (re-recorded snapshot)

## Guards

- `tests/unit/session-scan.test.ts`
- `tests/e2e/cli.test.ts`
- `scripts/gate_registry.mjs`

## What this does not fix

- It does not repair a truncated turn, and it must not: the tail is missing
  bytes, not a missing quote.
- It does not attribute a `max-tokens` turn to a tool call: the event carries a
  `turn` id and no call id (measured: 0 of 88 attributable).
- It does not deduplicate a turn that both the journal and the session file
  recorded. That defect belongs to the journal reader, not here.
- It does not change the verdict vocabulary or the four states. The census is a
  scanner field; the resident seam is untouched.
- `UNSUPPORTED_REASONING_EFFORT` is counted, not diagnosed: it is a
  provider/model routing answer (`deepseek-v4.1-flash-eco` rejected
  `reasoning effort "xhigh"`), outside any seam this plugin owns.
