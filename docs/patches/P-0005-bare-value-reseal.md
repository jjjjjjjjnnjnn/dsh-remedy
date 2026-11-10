# P-0005 — A bare value after a member key must be resealed, or refused

- **Status**: `tested` (unit tests, fixtures, and negative controls; no live host
  run yet)
- **Severity**: major
- **Surface**: `llm/stream`
- **Depends on**: P-0001 (fusion split), P-0003 (refusal bookkeeping)

## Symptom

The adapter kills the turn with `MALFORMED_RESPONSE` although only one tool was
ever intended. Two measured shapes, both from `run_code`:

```
Tool call "run_code": Unexpected token 'c', ..."{\"code\": is not valid JSON
Received arguments:
{"code": 
const fs = await import("node:fs");
const fork = "C:\\Users\\..."; ...
console.log(fs.readFileSync(p, "utf8"));
 , "description": "Read the registry entry YAML in the fork"}
```

```
Tool call "run_code": Unexpected end of JSON input
Received arguments:
{"code": "false", "code": 
```

The model wrote a program after `"code": ` and never opened a quote. The text is
a single object that does not parse, so P-0001 refuses it (`single-object`) and
the call is never dispatched: one forgotten `"` costs the whole turn.

## Counter-evidence (what this patch deliberately does **not** repair)

The same measured sample contains four neighbouring shapes that must stay
refusals. Each one has a negative control:

| shape | measured text (abridged) | why it is refused |
|---|---|---|
| truncated duplicate key | `{"code": "false", "code": ` | the tail is missing bytes, not a missing quote |
| doubled colon | `{"pattern": "…", "context":: ` | a syntax defect with no unique reading |
| missing closing brace | `{"command": "…grep -n \"…\\|…\" …"` | an illegal escape is not a reseal; the object is also unbalanced |
| two bare blobs | two member values that each reseal into a valid object | two readings is the same as none |

A repair pass that "fixes" these would dispatch a call whose payload nobody can
predict, which is worse than the original failure.

## What changed

| # | change | file |
|---|---|---|
| 1 | new `resealToolCallArguments`: one proof, one decision | `packages/core/src/reseal.ts` |
| 2 | `single-object` branch tries a reseal before refusing | `packages/core/src/toolcall-repair.ts:124-141` |
| 3 | `RepairRepaired.code` widened to `'split' \| 'resealed'`, plus an optional `key` | `packages/core/src/toolcall-repair.ts:51-57` |
| 4 | `resealed` counter, optional in the type on purpose | `packages/core/src/verdict.ts:36-62` |
| 5 | `quiet` no longer swallows a reseal: a defect seen and fixed is not "defect not seen" | `packages/core/src/verdict.ts:82-96` |
| 6 | the counter row prints a ninth name only when the build knows it | `packages/core/src/verdict.ts:103-118` |
| 7 | `recordResealed` moves `resealed` only — never `fused`, never `repaired` | `packages/plugin/src/repair-stream.ts` |
| 8 | a reseal is held per block, and withdrawn like any other repair | `packages/plugin/src/repair-stream.ts` |
| 9 | the finish-path rescue books a reseal as a reseal, not as a split | `packages/plugin/src/repair-stream.ts` |
| 10 | `verify` reads the engine's own fragment count, so a reseal's `1` is honest | `packages/plugin/src/cli.ts` |
| 11 | the e2e fixture count is data, not a hard-coded `5` | `tests/e2e/cli.test.ts` |

`dist/*.js` grows by `reseal.js` (about 4 KB of the 53 000 byte ceiling).

## Invariants

1. **One proof, one decision.** Exactly one candidate segment must reproduce the
   whole text as a single parseable plain object, and the resealed value must
   round-trip to the bytes the model wrote. Zero candidates → `bare-value-unproven`;
   more than one → `ambiguous-bare-value`.
2. **Nothing else is touched.** Resealing never changes another member, never
   reorders keys, never trims whitespace inside the payload.
3. **The identity is kept.** The call keeps its own id and name, so no synthetic
   id exists and the stream-wide call budget is not consumed.
4. **Truncation stays unfixable.** `truncated` is refused before the reseal pass
   can even run.
5. **The bound is real.** A 64 KB text, an 8 member-head window and a 256 comma
   window keep the search from going quadratic; both ceilings have negative
   controls.
6. **The vocabulary is frozen.** The four verdict states and their order do not
   change. `resealed` is reported, and the quiet guard is widened so that a
   recorded reseal cannot read as quiet — the same class of lie P-0003 removed.
7. **Old artifacts still render.** The `resealed` field is optional in
   `RemedyCounters`; a 0.3.x counter object renders the eight-name row byte for
   byte, which is asserted by a test.
8. **A withdrawn reseal goes back.** The original block is emitted, `withdrawn`
   moves, and nothing claims the call was dispatched.

## What this does not fix

- A cut tail (`max-tokens`) is still never repaired: bytes are missing, not quotes.
- A duplicate key, a doubled colon, a missing closing brace and an illegal escape
  stay refusals, by design and with named negative controls.
- Only the stream seam is touched. The adapter, the relay and the provider retry
  policy are untouched.
- No live host run yet: this host's measured adapter only surfaces the fusion
  family. The reseal is proven by unit tests plus a fixture replay through the
  shipped CLI path.

## Reproduction

```powershell
node packages/plugin/dist/cli.js verify          # 6 fixture(s): the bare value reseals
node --test tests/unit/reseal.test.ts            # 11 proofs and refusals
node --test tests/unit/toolcall-repair.test.ts   # the single-object branch
node --test tests/unit/verdict.test.ts           # 12 including the 0.3.x row
```

## Evidence

- `data/fixtures/toolcall-fusion/bare-code-value.json` — the measured run_code
  text, byte for byte, expecting `repaired` with `fragments: 1`
- `data/results/session-sample-*.json` — the sample the shapes were measured on
- `tests/unit/reseal.test.ts`, `tests/unit/toolcall-repair.test.ts`,
  `tests/unit/verdict.test.ts`, `tests/unit/repair-stream.test.ts`
