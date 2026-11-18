# P-0053 — a neighbouring plugin's chunk is not this plugin's failure

**Status:** `tested` · **Seam:** `llm/stream` (waterfall) · **Artifacts:** `data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json` (before), `data/results/hostile-neighbours-2026-11-18T11-30-00.000Z.json` (after)

## Symptom

`llm/stream` is a Cordis waterfall and the user decides which plugins sit on it. When a
neighbour hands this wrapper a chunk it did not expect, the turn ends with an exception
whose name is `TypeError` and whose stack is inside `dsh-remedy`, not inside the provider.
Measured on the R68 tree (0.4.18 dist, seven scenarios):

| neighbour gives | before | after this patch |
|---|---|---|
| `null` chunk | `TypeError: Cannot read properties of null (reading 'type')` | the chunk is passed through; the turn continues |
| `block-end` whose `arguments` is an object | `TypeError: text.trim is not a function` | passed through |
| `block-end` with no `block` | `TypeError: Cannot read properties of undefined (reading 'type')` | passed through |
| `finish` with no `reason` | `TypeError: Cannot read properties of undefined (reading 'kind')` | passed through |

The fourth row is the same defect on the one finish field the wrapper reads before any
repair decision; it was not in the seven-row probe and is added here as a case.

## Mechanism (measured in this repository)

The main loop cast every yielded value and read it without a shape check:

```ts
for await (const raw of source) {
  const chunk = raw as StreamChunk
  switch (chunk.type) { ... }                    // null -> TypeError
  ... if (chunk.block.type === 'tool-call') {   // no block -> TypeError
  ... } else if (chunk.block.arguments.trim() === '') { // object -> TypeError
  ... if (chunk.reason.kind === 'max-tokens') { // no reason -> TypeError
```

The outer `catch` recognises only a proven fusion (`isFusionFailure`) and rethrows
everything else. A shape error has no provider failure to recognise, so it arrives at the
host with this plugin's identity. `PROJECT_RULES.md` §1 forbids turning a provider's
failure into a success; it does not require turning a neighbour's shape into this plugin's
exception. Both paths shared one `catch`.

## The contract (ADR 0002)

A stream leaving this wrapper may only do three things:

1. pass a chunk through unchanged;
2. replace a **proven** fusion with the calls it should have been;
3. rethrow the provider's original failure.

It must not produce a fourth outcome. `catch` deliberately does not catch the source's
throw: an unreadable chunk is not a failure, and swallowing one would turn a live stream
into silence.

## What changed

- A pure `foreign(chunk)` predicate checks only the fields the wrapper actually reads:
  `type` is a string; a `block-end` has an object `block`, and a `tool-call` block has
  string `id` / `name` / `arguments`; a `finish` has an object `reason` with string `kind`.
  Fields the wrapper ignores (`index`, `blockType`, `usage`, unknown chunk types) are not
  validated: an ignored field cannot raise this plugin's exception.
- On the first foreign chunk: `flushPending()` emits the tail that was already held
  (nothing proven is dropped), `passOnly` is set, and the open-call map is cleared so a
  later consumer stop cannot be booked as `consumer-abort`.
- From then on the stream is only passed through. No repair is attempted after it,
  including on a later `block-end` that would have parsed.
- A later, readable `finish{kind:'error'}` still moves `errors` (P-0034): the provider
  failed, and that must not read as a quiet stream. The foreign chunk itself is not
  counted.

## Counter-evidence (each is a control in `tests/unit/neighbour-hostile.test.ts`)

- an unknown chunk type was already passed through and stays unchanged;
- a source that throws `TRANSPORT` is still rethrown, unchanged, and still counted as one
  error;
- a second `finish` is never reached;
- a chunk the wrapper can read still repairs exactly as before (the measured fixture and
  the whole existing suite).

## Limits

- A stream that failed open reads `quiet`: no counter moves for the foreign chunk. The
  counters are a closed vocabulary and a sixth state would invalidate every recorded
  artifact. The event is observable only through the host's own failure, if any.
- The predicate covers the fields this wrapper reads, not a full schema. A `block-start`
  with a non-number index, a `tool-call-delta` with a non-string `argumentsDelta`, and
  other shapes that cannot throw here are handled by their existing rules (the last one
  is already booked as an adapter error).
- A neighbour that returns its own stream instead of calling `next()` is not on this
  code path; so is a neighbour that mutates chunks before yielding them. This patch only
  promises “we do not add an exception”, not “we still repair”.
- The harness mounts the listener directly; no full host turn was run with a hostile
  neighbour. Status stays `tested`.
- macOS is still a CI criterion, not hardware.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/neighbour-hostile.test.ts
node scripts/probe_hostile_neighbours.mjs --stamp <ISO>
```

The probe writes a stamped artifact and a `.sha256`; it refuses to overwrite an existing
stamp. The before/after pair is
`hostile-neighbours-2026-11-18T10-00-00.000Z.json` and
`hostile-neighbours-2026-11-18T11-30-00.000Z.json`.
