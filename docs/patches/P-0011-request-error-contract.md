# P-0011 — A second seam with no test is a seam nobody has ever run

**Status**: `tested`  **Severity**: major  **Surface**: `agent/request-error`  **Depends on**: none

## Symptom

`agent/request-error` has been mounted since 0.2.0 behind `retryOnMalformed`. It
had **zero tests**: twenty test files in `tests/`, and `grep -rn "agent/request-error"`
over all of them returned nothing. It was also wrong in three ways that no test
would have caught, because nobody had ever compared it to the contract the
runtime publishes:

```ts
ctx.on('agent/request-error', async (payload, next) => {
  const action = await next()                      // ← calls the default chain first
  if (action !== undefined && action !== null) return action
  if (payload.failure?.code !== 'MALFORMED_RESPONSE') return action
  const key = `${String(payload.turn)}:${String(payload.step)}`
  const used = budget.get(key) ?? 0                // ← a Map that is never pruned
  ...
  return { kind: 'retry' }                         // ← overrides what next() said
})
```

1. **It called `next()` and then overrode the answer.** The shipped runtime's own
   documentation says the opposite: *"a handling listener returns
   `{ kind: 'retry' }` **without calling `next()`**, while an unhandled failure is
   terminal"*, and *"a waterfall listener (`agent/pre-step`, `agent/request`,
   `llm/stream`, `tools/pre-execute`, …) that does not own the decision must
   return `next()`"*. Calling `next()` first and then discarding its answer
   throws away whatever the default chain decided — and context compaction
   authorizes its own retry on exactly that path, only after a surface
   replacement generation advances.
2. **The budget was a `Map` keyed by `turn:step` that was never pruned.** A
   desktop process runs thousands of steps; a resident plugin would keep one
   entry per step for the life of the app. That is a slow leak in the one place
   this project promises to be "resident but silent".
3. **The control codes were not excluded on purpose.** The code checked
   `code !== 'MALFORMED_RESPONSE'` and returned, so it happened to be safe —
   but "happens to be safe" is not the same as "excluded because upstream
   documents them as signals". `IMAGE_OFFLOAD_REQUIRED` is an in-design control,
   `INVALID_CREDENTIAL` and `MISSING_CREDENTIAL` are documented changes.

## Why it lasted

The seam is **off by default**. `retryOnMalformed: 0` means the plugin never
registers it, so every test that mounted the plugin and exercised `llm/stream`
could not have noticed. The defect was invisible because the feature was
dormant, and dormant code is exactly where an untested contract hides.

This is the same family as P-0004, P-0006 and P-0010: a mechanism that nothing
watches rots. The difference is that here the mechanism was never even
*run*, so it could not rot — it was simply unverified from the day it shipped.

## What changed

`packages/plugin/src/failure-listener.ts` (new) owns the seam. The decision order
is now:

1. no code, or an empty code, or an aborted signal → `next()`;
2. a **named** class (`UNSUPPORTED_REASONING_EFFORT`, `INVALID_REQUEST`,
   `MISSING_CREDENTIAL`, `EMPTY_RESPONSE`) → record a diagnosis once per
   `(step, code)`, then `next()`, never retry (P-0013);
3. a control code (`IMAGE_OFFLOAD_REQUIRED`, `INVALID_CREDENTIAL`,
   `MISSING_CREDENTIAL`) → `next()`, no diagnosis;
4. `MALFORMED_RESPONSE` with budget left → `{ kind: 'retry' }` **without**
   calling `next()`;
5. anything else, or budget spent → `next()`.

The budget is a bounded LRU: re-inserting a used key moves it to the newest end,
and eviction pops the oldest until the map is under 256 entries. The listener
exposes `cacheSize()` so a test proves the bound instead of trusting the comment.

`tests/unit/request-error.test.ts` (new, 9 tests) pins all five decisions, the
`next()` contract in both directions, the bound (5000 distinct steps → ≤ 256
entries), cancellation, and empty payloads.

## What this does not fix

- Only `MALFORMED_RESPONSE` is retried. `SERVER`, `TRANSPORT` and `TIMEOUT` are
  already retried upstream (measured: 195 of 213 failing groups self-healed in
  the same turn), so a second layer here would compete for the seam.
- The budget defaults to 0, so nothing is retried unless a deployment asks.
- A very long single turn can exceed 256 distinct steps and revisit one, spending
  a fresh retry. That is the LRU's cost, and it is written down rather than
  discovered later.
- No live artifact: this seam only fires on a failure the plugin retries, and
  with the default budget of 0 it never fires at all. It stays `tested`.

## Reproduction

```
git show 05682ec:packages/plugin/src/index.ts | grep -A12 'agent/request-error'
node --test tests/unit/request-error.test.ts       # red before the patch, green after
node packages/plugin/dist/cli.js status --json | jq '.patches[] | select(.id=="P-0011")'
```
