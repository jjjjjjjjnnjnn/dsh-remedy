# P-0037 — One dropped closing delimiter, restored only when it is the only way to parse

**Status**: `tested`  **Severity**: `major`  **Surface**: `llm/stream`  **Depends on**: P-0001, P-0005

## Symptom

The whole turn dies on one malformed tool-call argument. The model writes a deeply
nested argument, drops a single closing delimiter in the middle of the structure,
and JSON reports `Expected ',' or ']' after array element in JSON at position N`
where **N is the length of the text minus one**. The adapter throws
`LlmError(..., "MALFORMED_RESPONSE")` before dispatch, and — because
`MALFORMED_RESPONSE` is not in the host's default `retryableCodes` — the attempt is
discarded with no retry.

Upstream reports of this class (all the same user-visible failure):

| report | date | version | route |
|---|---|---|---|
| #12819 `ui_render` 参数尾部漏 `]` | 2026-11-10 | 0.2.2-rc.1 | `llm-pi-ai` (`openai-completions`) |
| #11843 large tool-call arguments | 2026-11-02 | 0.2.2-rc.1 desktop | `dsh-llm-deepseek` |
| #7705 / #8920 / #8976 / #9402 / #9503 / #10406 / #11577 | 2026-09…11 | rc.1…rc.5 | both |

The reporter of #12819 measured it three times in one session, each time at a
different length (2 964 / 2 192 / 2 002 characters), and noted the position is
always `length - 1`.

## Why only one half of this class is reachable from this seam

Two adapters, two different failure messages:

- **`llm-pi-ai`** builds `argumentsError` as
  `` `Tool call "${name}": ${parsed.error}\n\nReceived arguments:\n${json}` ``
  and throws it as `MALFORMED_RESPONSE`. **The offending text is in the message**,
  which is exactly what `failure-text.ts` already parses (`RECEIVED_MARKER`) for the
  P-0001 rescue.
- **`dsh-llm-deepseek`** does `catch { return malformed("tool input is invalid JSON") }`
  — the text is **not** echoed, so at this seam there is nothing to repair. That half
  (#11843) is `out-of-seam` and stays out of scope; the report's own ask #1
  ("make `MALFORMED_RESPONSE` retryable") is already covered by P-0011's bounded
  retry.

So this patch answers the `pi-ai` route only. That limit is written down instead of
being implied.

## Root cause

`packages/core/src/toolcall-repair.ts` had exactly two outcomes for a single object
that does not parse: a proven bare-value reseal (P-0005) or a refusal. A text that is
**one character** away from parsing therefore fell into `single-object` and was
re-thrown — even though the repair needs no invention at all: the model's own bytes
plus one `]`.

An important detail found while implementing: `splitTopLevelJsonObjects()` reports
`unbalanced: input ends at depth 1` for this shape, so even before the `single-object`
branch the splitter refuses it. The closer proof must run **before** the splitter,
otherwise the shape never reaches it.

## What changed

New module `packages/core/src/closer.ts`:

1. **End-of-text is never a candidate insertion site.** A cut tail (`max-tokens`, a
   dropped connection, an adapter that stops early) is one delimiter away from
   parsing in exactly the same way; nothing after the gap is what tells the two
   apart. So `{"command":"ls"` stays refused, and a truncation flag refuses
   unconditionally.
2. Only closing brackets **outside a string** are considered (inserting a `]` inside
   a string literal would silently rewrite the model's payload), and a text that
   ends inside a string is refused as a cut.
3. Both `]` and `}` are tried, and **exactly one (site, delimiter) pair** must yield
   one plain object. Two candidates is an ambiguity, not a fix.
4. The result must be the original **plus one character**, re-proved at the point of
   use: the test reconstructs the input from the output.

`toolcall-repair.ts` routes it before the splitter and returns
`code: 'closed'`, `fragments: 1`, `delimiter`. No call is synthesized: the same id,
the same name, the model's bytes plus one bracket.

Accounting: a tenth counter, `closed`, on the same contract as `resealed` — one call
rewritten in place, nothing synthesized, so it moves neither `fused` nor `repaired`,
and it widens the `quiet` guard the same way (a defect that was seen and fixed must
not read "defect not seen").

## How ambiguous this shape actually is (measured, not assumed)

`.tmp/experiment-closer2.mjs` (2026-11-15, seeded, 6 000 generated tool-argument
shapes, one random closer dropped from each):

| outcome | count | share |
|---|---|---|
| exactly one interior site parses | 762 | **45.2 %** |
| two or more interior sites parse | 604 | **35.8 %** |
| no interior site parses | 321 | 19.0 % |

So the uniqueness rule is not decoration: **more than a third of dropped-closer
shapes are ambiguous**, and those must be refused. The genuine tie used as the
negative control
(`{"command":{"path":{"id":88},"path":"x y"}` → `}@27` and `}@41` both parse) came
out of that run, not out of the test author's imagination.

A second run (`.tmp/experiment-closer3.mjs`, 3 000 shapes) spliced a bare multi-line
value and a dropped closer into the same text to see whether the P-0005 reseal proof
and this proof can both fire on one text. They never did (`both: 0`), which is why the
two proofs are sequential rather than arbitrated by a third branch.

## Judgement (red first)

`tests/unit/closer.test.ts`, four tests, written before the implementation:

| test | before |
|---|---|
| the pipeline routes one object with a dropped closer to `closed` | **red** — `rejected / not-an-object-sequence` |
| the pipeline still refuses the ambiguous shape | green before and after (the tie is real, and stays refused) |
| the pipeline still refuses a cut tail even when the closer proof could fire | green before and after |
| the pipeline still refuses a missing final closer | green before and after |

The red one is the whole patch: before it, the same bytes were re-thrown and the turn
died.

## What this does not do

- **It does not fix the adapter.** The `deepseek` route never puts the text in the
  message, so no seam-local patch can see it.
- **It never invents content.** One character, at one site, proven unique. If two
  sites parse, the text is refused — 35.8 % of the shapes above.
- **A missing final delimiter is not repaired.** It cannot be told apart from a cut
  tail.
- **It does not repair a missing comma, an extra delimiter, or an unterminated
  string.** Each is a different defect with its own proof; all three are refused.
- **Not `verified`**: the red is at the seam, and no live turn this round produced
  `#12819`'s exact shape. The host half (`llm-pi-ai` message construction) is
  reported upstream, not re-measured here.

## Payment

The narrative above is the *only* home for it: `closer.ts` keeps a pointer, not a
copy (P-0032's rule applied to a module instead of a registry record). Measured
before/after in the batch entry; no cap moved.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/closer.test.ts        # 4 tests; the first one is the red
node scripts/gate_size.mjs                   # residency / cli / total / core
```
