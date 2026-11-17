# P-0036 — The host assembler erases the id a delta-only stream already proved

**Status**: `tested`  **Severity**: major  **Surface**: `llm/stream`  **Depends on**: P-0033, P-0030

## Symptom

A completed tool call reaches the session log with `id: ""`, and the session cannot be resumed.
`P-0033` fixed this shape when the adapter sends a `block-end`; this patch is the half where the
adapter never sends one.

The shape is documented and reproduced by three independent parties:

- `deepseek-ai/deepseek-harness` discussion **#8653** (2026-10-02) prints the exact chunk list
  (`tool-call-delta { index: 2, id: "", argumentsDelta: "{" }` … `block-end { id: "", name: "" }`)
  and traces the failure to `format v4 tool/result … requires toolCallId matching its tool source`;
- the `sandbaseai/deepseek-harness-handbook` page *streamed-tool-call-empty-identity* names the chain
  "first delta carries id + name, later deltas carry `id: ""`";
- `udsy19/dsh-toolcall-stream-repair` sells a repair code for exactly this (`empty-id-clobber`).

## Root cause — read out of this machine, not inferred

`dsh-llm/src/assembler.ts` from `app.asar` (DSH **0.2.2-rc.3**), three lines:

```ts
// :72 — no guard at all
partial.toolCallId = chunk.id
// :73 — the name IS guarded, which is what makes the asymmetry visible
if (chunk.name) partial.toolCallName = chunk.name
// :115 — the only fallback, and `??` cannot fire for ''
id: partial.toolCallId ?? brandString<ToolCallId>(`call-${index}`)
```

So a continuation delta that spells "unchanged" as `id: ""` overwrites the id that arrived first,
and the host's own fallback is unreachable. `assistant-stream.ts:138` then persists that empty
delta verbatim (`if (chunk.id.length === 0 || chunk.name === '') push raw`), so the corruption is in
the replayable record before the assembler ever runs.

At this seam we see the same deltas. Before this patch the wrapper forwarded them unchanged
(`.tmp/probe-identity.mjs` printed `id: ""` on the second delta).

## What changed

In `packages/plugin/src/repair-stream.ts`, the `tool-call-delta` branch keeps one identity per index:

1. a non-empty `id` is adopted, exactly as before;
2. an empty `id` is replaced with the id this index already proved, so the host's unconditional
   assignment cannot erase it;
3. an empty `id` on an index that never carried any id mints one with the existing P-0033
   `syntheticId()` helper (`call_remedy_<n>`, collision-checked), so every continuation of that call
   names the same call.

Both cases book a `refused` event with the code `empty-id-delta` and set `refusedHere` (P-0034),
because nothing the model sent was repaired: an identity was refused.

Three deliberate non-changes:

- **a *different* real id is left alone.** A second call announced at an occupied index
  (`udsy19`'s `id-collision-split`) is a separate defect with its own proof; silently rewriting it
  here would have made this patch claim a fix it cannot demonstrate. One test pins that.
- **`argumentsDelta` is untouched.** The identity is the defect; the argument text stays byte-identical.
- **no `block-end` is synthesized.** The host assembles from deltas when none arrives
  (`assembler.ts:108-121`), and inventing a `block-end` would claim a block boundary nobody proved.

Cost: **+96 B** of resident bytes, paid out of prose in the same two files
(`repair-stream.js` 22 451 → 23 187 before payment, then comment trims). Final total
**82 973 / 83 000** (residency 41 611 / 44 000, CLI 41 362 / 42 000). No cap moved.

## Judgement (red first)

`tests/unit/repair-stream.test.ts`, five tests:

| test | before |
|---|---|
| a continuation delta with an empty id does not erase the id the stream proved | **red** — the second delta still carried `id: ""` |
| a delta-only call with no id at all gets one id that every continuation reuses | **red** — both deltas carried `""` |
| an id the stream already proved is never replaced by a different real id | green before and after (the stated limit) |
| a stream whose deltas all carry real ids is byte-identical | green before and after (no regression on healthy streams) |
| (P-0033's five) | green before and after |

The two red ones are the same host rule from two directions: "erase what arrived" and "never had anything".

## What this does not do

- **It does not fix the host.** `assembler.ts:72` is upstream; every other plugin on this seam sees
  the same bytes. What this patch guarantees is that what *we* emit is assemblable.
- **A mixed stream is not split.** Two genuinely different real ids on one index are passed through,
  so the concatenated-arguments shape stays exactly as broken as it was (`id-collision-split`).
- **The `name` half was already guarded by the host** (`:73`), so this patch has nothing to add there;
  an empty name still reaches the P-0033 path at `block-end`.
- **`blocks()` from deltas only** still yields `arguments: ""` when no delta carried text — this patch
  does not invent arguments.
- **Not `verified`**: the red is at the seam, and no live host run this round produced a delta-only
  empty-id stream. The host half is source-read, not measured on a live turn.

## Reproduction

```powershell
node --test tests/unit/repair-stream.test.ts     # the delta-identity cases, red before the fix
node scripts/gate_size.mjs                       # the CLI half's budget, on this tree
```

The second delta's identity was measured with a one-off probe that replayed the R47
stream; it is not shipped. The rule it produced — a delta-only call keeps the id the
stream proved — is pinned by the test above and by the live run in
`data/results/live-2026-11-10T14-45-00.000Z.json`, whose synthetic id was dispatched and
answered.
