# P-0002 — A rescue must be provable, attributable and atomic

**Status**: `tested` (unit tests + negative controls; no live host run yet)
**Severity**: major — a "repaired" turn can be dispatched to the wrong tool or replay with different state
**Surface**: `llm/stream`
**Depends on**: P-0001 (this patch hardens the same seam; it does not widen it)

## Symptom

P-0001 proves that the *text* splits into valid objects. It does not prove that the
**result** is something the runtime can execute. Four failure shapes survive P-0001:

1. A call whose tool name never arrived (`name: ''`) is split and dispatched to an
   empty tool name — the adapter resolves no tool, or resolves "unknown".
2. A buffer that saw two different tool names in one index (the real fixture is
   `{"command": …}` for `ops_bash` glued to `{"path": …}` for `read`) keeps **the last
   name**, so the second object is dispatched to the first tool with the second tool's
   arguments.
3. A repaired `finish` is emitted as `{kind:'stop'}` **without `replayState`**, so the
   repaired turn replays with different context than the original one.
4. On the `block-end` path the repair is committed **per block, immediately**: block 0
   is split and yielded, then block 1 is rejected, and the turn runs with a half-repaired
   call list — exactly the "silently dropped call" the file header promises cannot happen.

Two smaller defects are in the same seam: a non-string `argumentsDelta` concatenates the
literal `"undefined"` into the buffer (turning a repairable call into an unrepairable one),
and `maxCalls` is a per-block ceiling, so one stream can still synthesize `blocks × 8` calls.

## Counter-evidence (kept, not fixed here)

- The measured adapter for this host never emits `block-end` for a tool call (session
  9045e2ec, seq 524: `block-start` → `tool-call-delta`* → `usage` → `finish{error}`).
  The atomic-commit change therefore cannot be proven live on this host; it is a guard
  for adapters that do close blocks (`BS-11`).
- In the 50-session sample no index ever carried two different tool names
  (`.tmp/probe-names.mjs`: `multiNameCount=0`). The name guard is a refusal for a shape
  that has not been observed yet, not a fix for an observed regression.
- `recordRejected` still increments `fused` for a non-fusion syntax error, so a plain
  bad JSON call shows up as `degraded`. Left as `BS-12` (changing it changes the
  verdict vocabulary, which is a separate seam).

## What changed

| # | Change | File:line (before) |
|---|---|---|
| 1 | Empty tool name is a rejection (`missing-name`), never a dispatch | `packages/core/src/toolcall-repair.ts:92-99` |
| 2 | The failure-message fallback refuses to synthesize `unknown` | `packages/plugin/src/repair-stream.ts:198` |
| 3 | A tool name that changes mid-stream aborts the rescue (`name-changed`) | `packages/plugin/src/repair-stream.ts:327` |
| 4 | `replayState` is carried onto a repaired `finish{kind:'stop'}` | `packages/plugin/src/repair-stream.ts:384`, `:411` |
| 5 | `block-end` repairs are buffered and committed once the tool-call phase ends; a later rejection flushes the originals and kills the rescue | `packages/plugin/src/repair-stream.ts:340-368` |
| 6 | A non-string `argumentsDelta` is not concatenated | `packages/plugin/src/repair-stream.ts:328` |
| 7 | `max-tokens` is counted even when `block-end` emptied the buffer | `packages/plugin/src/repair-stream.ts:376-379` |
| 8 | `maxCalls` is a per-stream ceiling, not per-block | `packages/plugin/src/repair-stream.ts:251-309` |
| 9 | Synthesized ids are written back into `seenIds` so two candidates cannot mint the same id | `packages/plugin/src/repair-stream.ts:278-281`, `:350-354` |
| 10 | A consumer that stops early is counted as `consumer-abort`, not as a quiet stream | `packages/plugin/src/repair-stream.ts:412-413` |
| 11 | A synthesized call opens its own `block-start` instead of a bare `block-end` | `packages/plugin/src/repair-stream.ts:349-360`, `:492-510` |
| 12 | A withdrawn repair returns its calls to the stream-wide `maxCalls` budget | `packages/plugin/src/repair-stream.ts:394-396`, `:429` |
| 13 | A `max-tokens` finish withdraws silently instead of recording `rolled-back` | `packages/plugin/src/repair-stream.ts:392-406`, `:538-540` |
| 14 | A passed-through non-fusion error is counted, so "other stream errors: 0" is no longer a constant | `packages/plugin/src/repair-stream.ts:553` |

## Invariants (each has a negative control)

- An empty tool name is rejected, never repaired into a dispatchable call.
- A name conflict inside one index aborts the whole rescue; the original failure passes through.
- A repaired call's `replayState` is preserved byte-for-byte.
- A repair is not committed until the tool-call phase of that stream is over.
- A rejected block after a repairable block leaves the turn with the original chunks.
- A `argumentsDelta` that is not a string never contributes text.
- `maxCalls` bounds the calls synthesized **per stream**.
- Synthetic ids are written back into `seenIds` so two candidates cannot mint the same id.
- A synthesized call is preceded by its own `block-start` on a fresh index.
- A withdrawn repair does not keep spending the stream ceiling.
- A `max-tokens` stream is counted as truncated, never as an unrepaired fusion.
- A stream that failed for a non-fusion reason increments `errors`.

## What this does not fix

- The relay that put two calls into one index (P-0001 limit, unchanged).
- `max-tokens` truncation: never repaired (unchanged); a tail that is cut before the
  split point is rejected by the splitter, a complete-looking tail is still indistinguishable,
  so the copy says "a stream marked `max-tokens` is never repaired".
- Attribution of the stage that glued the objects (unchanged).
- Whether a new `block-start` on a fresh index is accepted downstream: the measured adapter
  does not rely on opened blocks at all, so the shape has not been live-tested. The output is
  now a well-formed block sequence instead of a bare `block-end`, but an adapter with its own
  index bookkeeping could still object (`BS-11`).

## Reproduction

```powershell
node --test --test-reporter=spec tests/unit/repair-stream.test.ts tests/unit/toolcall-repair.test.ts
node packages/plugin/dist/cli.js verify
```

## Evidence

- `docs/patches/P-0002-rescue-integrity.md` — this file
- `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` — the real fused text whose
  two objects belong to two different tools
- `tests/unit/toolcall-repair.test.ts` — `missing-name` negative control
- `tests/unit/repair-stream.test.ts` — name conflict, replayState, atomic commit,
  `argumentsDelta`, per-stream ceiling, withdrawal budget, truncated withdrawal,
  synthesized block-start, consumer abort, passed-through error
