# P-0034 — A failed stream that we never refused was booked as a quiet one

**Status**: `tested`  **Severity**: major  **Surface**: `llm/stream`  **Depends on**: P-0001, P-0003, P-0013

## Symptom

A turn dies with `MALFORMED_RESPONSE` and the remedy journal records **nothing**. No `errors`,
no `refused`, no `rejected` event: the line for that stream is byte-identical to the line for a
healthy one.

The report this came from (`deepseek-ai/deepseek-harness#11337`, 2026-10-28, `deepseek-flash`) has
the exact chunk sequence:

```json
{"type":"block-start","index":0,"blockType":"reasoning"}
{"type":"reasoning-chunks","index":0,...}
{"type":"block-end","index":0,"block":{"type":"reasoning","text":"..."}}
{"type":"finish","reason":{"kind":"error","failure":{"message":"DeepSeek Messages stream: unsupported stop reason refusal","code":"MALFORMED_RESPONSE"}}}
```

No tool call at all. The adapter threw `malformed("unsupported stop reason refusal")` because
Messages sent `stop_reason: "refusal"`, which `stopReason()` does not know (`dsh-llm-deepseek`
`lib/index.js`, function `stopReason`: only `end_turn` / `stop_sequence` / `tool_use` / `max_tokens`
are accepted). The turn ends at exit 1.

## Root cause

`isFusionFailure` decides by **code alone** (`packages/plugin/src/failure-text.ts:9`), and the
finish path used that single test to decide whether the failure was already on the ledger:

```ts
if (!isFusionFailure(chunk.reason.failure)) monitor.recordError()
```

That was written for fusion failures, where a refusal at `block-end` has already been counted
(P-0003). It answers "is this a MALFORMED_RESPONSE?" — never "was this booked somewhere else?".
So every MALFORMED_RESPONSE that has nothing to do with arguments inherited the fusion path's
assumption and was booked as silence, including the one that says so in its own message
(`unsupported stop reason refusal`).

This is the same lie the project removed from the verdict vocabulary: a stream that failed read
like a stream that did not. `errors` is printed on every `formatRemedyVerdict` line, and it was
wrong for exactly the failures that need a name.

## What changed

One flag, set wherever a refusal is booked, read at both failure exits:

- `refusedHere` is set in the three places that already call `recordRejected` for an argument
  refusal (`name-changed`, the finish-path rescue, and the `block-end` path);
- the finish path and the throw path now book an error unless **that** flag explains the failure:

  ```ts
  if (!(refusedHere && isFusionFailure(frame))) monitor.recordError()
  ```

Three deliberate non-changes:

- **the verdict vocabulary is untouched.** `errors` never moved the four states before, and it
  does not start now; `quiet` still means "the fusion defect was not seen". The counters line is
  where "this stream failed" is reported, and it now reports it.
- **no refusal is double-booked.** A stream whose `block-end` was refused stays at `refused = 1`,
  `errors = 0`; that is the P-0030 rule (one failure, one count) read on this side of the seam.
- **nothing is fabricated.** This patch only writes down a fact the stream already carried. It
  does not retry, does not rewrite the failure, and does not turn an unknown stop reason into
  `stop`.

Cost: `refusedHere` plus two conditions. `repair-stream.js` grew, so five comment blocks in the
same file were tightened with their facts intact; final total **82 877 / 83 000**, residency
**41 515 / 44 000**, CLI 41 362 / 42 000. No cap moved, no new module.

## Judgement (red first)

`tests/unit/repair-stream.test.ts`, four tests:

| test | before |
|---|---|
| a MALFORMED_RESPONSE with no tool-call evidence is an error, not a quiet stream | **red** — `errors` was 0, not 1 |
| a thrown MALFORMED_RESPONSE that a refusal explained is counted once | **red** — the throw path booked `errors: 1` on top of `refused: 1` |
| a thrown MALFORMED_RESPONSE with no refusal is still an error | green before and after (it pins that the throw path kept its error) |
| a refusal that already explains the failure is not counted again as an error | green before and after (the no-double-count guard) |

The first red is the one the report describes: the stream failed and the ledger said nothing.

## What this does not do

- **It does not fix the adapter.** `stopReason()` is upstream and out-of-seam; a `refusal` stop
  reason still fails the turn. What is fixed is that the plugin now says so.
- **`refusal` is still an error, not a content decision.** The model declined; the turn ends. The
  plugin names it, it does not retry it — the retry budget (`retryOnMalformed`) is off by
  default and this patch does not touch it.
- **The reproduction is synthetic at the seam.** No relay in this repository produced a
  `refusal`; the test builds the chunk sequence the report printed. The host-side half that is
  proven is the adapter source (`stopReason()` above, read out of the shipped `app.asar`), not a
  live incident.
- **`errors` still does not move the verdict.** A profile that only reads `remedy status` will not
  see this; the journal line and the counters are the record.
- **`refusedHere` is stream-wide.** A stream that refused one call and then failed for an unrelated
  reason is booked as a refusal only. Narrow by design: two counts for one failure is the defect
  P-0030 removed, and a second failure in the same stream cannot be told apart from the first at
  this seam.

## Reproduction

```powershell
node --test tests/unit/repair-stream.test.ts        # 36 tests; the two red ones above
node scripts/gate_size.mjs                          # total 82 877 of 83 000
node -e "import('dsh-remedy').then(async ({repairStream,RemedyMonitor})=>{const s=(async function*(){yield {type:'block-start',index:0,blockType:'reasoning'};yield {type:'block-end',index:0,block:{type:'reasoning',text:'planning'}};yield {type:'finish',reason:{kind:'error',failure:{code:'MALFORMED_RESPONSE',message:'DeepSeek Messages stream: unsupported stop reason refusal'}}}})();const m=new RemedyMonitor();for await(const c of repairStream(s,m))console.log(JSON.stringify(c));console.log(JSON.stringify(m.counters()))})"
# last line: {"streams":1,...,"errors":1,...}
```
