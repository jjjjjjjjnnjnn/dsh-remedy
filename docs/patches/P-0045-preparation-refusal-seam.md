# P-0045 — A refusal thrown before the stream starts never reaches the seam that names it

**Status**: `verified`  **Severity**: major  **Surface**: `agent/error`  **Depends on**: P-0013

## Symptom

P-0013 exists to name the failure class this host hits most after fusion.
Thirty-seven turns in this machine's sessions died with
`UNSUPPORTED_REASONING_EFFORT`, and P-0013 was shipped as `tested` because no
journal had ever witnessed a named refusal.

This patch starts from a measurement that made that gap exact: a deliberately
broken profile (`reasoningEffort: xhigh`, the same level the adapter refuses)
was run against the **released 0.4.15 bytes** in an isolated `DSH_HOME`, with
`journalPath` configured. The turn ended `error` as expected — and the journal
was **empty**. Not a wrong line, not a wrong code: zero events. The listener
P-0013 added was mounted on a seam that this failure never reaches.

## Mechanism

Read out of the shipped `app.asar` (`dsh-agent-loop/lib/index.js`, 0.2.2-rc.3):

```js
// line 936–952: only a finish that failed AFTER the stream started
const finish = live.finish;
if (finish.kind === "error" || finish.kind === "aborted") {
  ...
  const action = await this.dispatch.waterfall("agent/request-error", {...}, ...)
  if (action?.kind !== "retry") throw LlmError.fromFailure(finish.failure);
  continue;
}
```

```js
// line 654–662: the outer catch reports every error, whenever it was thrown
throwError(error) {
  const turn = ...;
  const step = ...;
  this.dispatch.emit("agent/error", { turn, step, error });
  throw error;
}
```

A step calls `prepareRequest` before it opens a stream (`step()` line 855 →
`prepareCall` line 1018). `prepareCall` is where the adapter refuses a level it
does not map. The throw never reaches line 936, so `agent/request-error` is
never dispatched; it is caught by the loop's outer catch, which emits
**`agent/error`** and ends the turn. P-0013's naming was therefore structurally
blind to exactly the class it was written for.

The measured proof is in `data/results/live-request-error-2026-11-16T15-10-00.000Z.json`:
a probe listener mounted on **both** candidate seams recorded one `agent/error`
and zero `agent/request-error` for that turn, and the released bytes' own journal
wrote nothing at all.

## What changed

1. **A second seam.** `apply()` now registers a listener on `agent/error`
   (`makeErrorNamer`). The event is an emit, not a waterfall: it has no decision
   to return, so the listener can only name.
2. **One key set.** `makeNamer()` owns the `(turn, step, code)` set that both
   `agent/request-error` and `agent/error` consult, so a failure both seams can
   see is named once instead of twice. `makeFailureListener` takes the namer as
   an option and keeps the retry budget where it was.
3. **The registry names the seam.** `agent/error` joins the closed surface list,
   and P-0013's record now says `agent/error` because that is where its naming
   actually lands. P-0011 stays on `agent/request-error` — its retry is only legal
   there.
4. **P-0011 and P-0013 move from `tested` to `verified`.** The same artifact
   witnesses the retry end to end (three main-step requests, one `retry` event,
   turn `completed`, exit 0; the plugin-free control makes two and exits 1) and
   the naming on the seam the host uses (released bytes: zero journal events;
   this tree: exactly one `diagnosis`).

## What this does not fix

- **It does not retry a preparation refusal.** `agent/error` cannot return a
  decision, and retrying a deterministic refusal spends a request to learn the
  same answer twice (P-0013's own rule). The turn still ends `error`.
- **It does not change the effort or the profile.** P-0042 (`explain`) is still
  the only tool that names the conflict before the next turn; P-0013's preflight
  is still a pure decision with no mount (`agent/pre-step` cannot change a
  selection — R53 measured that).
- **One route was measured.** `opendesign / deepseek-v4.1-flash-eco` is this
  machine's route. Another adapter could throw the same refusal after opening a
  stream, in which case `agent/request-error` sees it and the shared key set still
  names it once.
- **A synthetic harness for P-0011.** The retry proof uses a local
  OpenAI-compatible endpoint that reproduces the #12819 shape; it is not a relay
  incident. P-0011's `verified` status rests on the retry decision, its bound and
  its completion, not on the origin of the bytes.

## Reproduction

```powershell
node --test tests/unit/agent-error-naming.test.ts   # 5 cases: names, dedupes, bounds, never decides
node --test tests/unit/request-error.test.ts        # 9 cases: the retry contract, unchanged
node --test tests/unit/repair-stream.test.ts        # the refusal path beside the stream seam
```

The five-run harness (two isolated homes, a released-bytes build, a scripted endpoint and
five observations) was one-off and is not shipped. What survives is the artifact
`data/results/live-request-error-2026-11-16T15-10-00.000Z.json`, produced by
`scripts/record_request_error_seam.mjs`, which refuses to write until all five runs show
the expected shapes; the recorder's header names the five inputs it needs. A reader
without that harness can re-run the rules above, not the seam.

## Numbers this page quotes

- 37 turns died with this code (the census count in P-0013).
- `dsh-agent-loop/lib/index.js` line 942 dispatches `agent/request-error`;
  line 657 emits `agent/error`.
- The retry run made 3 main-step requests; the plugin-free control made 2; the
  retry budget that allowed it is `retryOnMalformed` with a bound of 256 cache
  entries (P-0011).
- The released bytes wrote 0 journal events for the refusal; this tree writes 1
  `diagnosis` for the same turn.
- Five cases in `tests/unit/agent-error-naming.test.ts`; the retry contract in
  `tests/unit/request-error.test.ts` is unchanged.

