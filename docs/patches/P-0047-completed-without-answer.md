# P-0047 — A turn that finished without answering anyone was never counted

**Status**: `tested`  **Severity**: major  **Surface**: `cli`  **Depends on**: P-0044

## Symptom

P-0044 made `scan` say whether a **truncated** turn answered anyone, and left the
other ending out on purpose: a `completed` turn with only reasoning had produced
0 cases on this machine, and counting it would have meant trusting a report.

Upstream #13169 says the shape is real: the last assistant message holds one
`reasoning` block, no `text` and no `tool-call`, and `turn/end` says `completed`.
Until this round nothing in the scanner could even say whether that happened.

## Mechanism

Measured, not assumed. `.tmp/r57-fake-openai.mjs` answers one main-step request
with two `reasoning_content` deltas and `finish_reason: "stop"`. The adapter's
empty-response guard counts **blocks**, not usable content
(`dsh-llm-pi-ai/lib/index.js` `mapStopReason`: `if (message.content.length === 0)`),
so one reasoning block passes the guard, `finish` is `stop`, and the loop ends the
turn as `completed` with an assistant message whose only block is `reasoning`.

Two runs in one isolated `DSH_HOME`, same endpoint, same prompt:

| run | stream | `turn/end` | assistant blocks | exit |
|---|---|---|---|---|
| `reasoning-only` | 2 `reasoning_content` deltas, `stop` | `completed` | `["reasoning"]` | 0 |
| `text` (control) | one `content` delta, `stop` | `completed` | `["text"]` | 0 |

So the reader gap is real: identical endings, different user-visible outcome, and
`scan` had one number for the first and none for the second.

## What changed

- `session-scan.ts` now reports **`completed_without_answer`** beside
  `truncated_without_answer`, computed by the same rule (`packages/core/src/answer.ts`:
  a tool call answers, a non-blank text answers, an unknown block does not, and only
  a turn's **last step** decides). Every `rows` entry carries its own count.
- The human `scan` line prints both counters, next to the census.
- Nothing in the verdict, the exit code or the repair path moved: a `completed`
  turn is still a completed turn, and this counter never turns into a finding.

## What this does not fix

- **The adapter's guard is still block-based.** `mapStopReason` accepts a
  reasoning-only message because `content.length !== 0`; fixing that is upstream,
  not this seam. This patch names the consequence.
- **It counts `completed` only.** `error` and `aborted` turns with no answer are not
  counted: an error already names its code, and an abort was the operator's call.
  Mixing them into one number would let a visibly failed turn read like a silent one.
- **A reasoning block that the user CAN see** (some clients render it) still counts
  as no answer. The rule is about what the transcript gives a reader, and it says so
  in the patch limits.

## Reproduction

```powershell
node --test tests/unit/completed-answer.test.ts    # the completed-turn rule and its controls
node --test tests/unit/turn-answer.test.ts         # the shared rule, unchanged
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --json   # completed_without_answer
```

The endpoint that reproduced the shape was a local OpenAI-compatible server plus two
isolated homes (one reasoning-only run, one text control); neither the server nor the
homes are shipped. The recorder `scripts/record_completed_answer.mjs` produced
`data/results/live-completed-2026-11-16T18-30-00.000Z.json` and refuses to write unless
both runs end `completed`, the block shapes differ, and the scanner counts exactly one.
A reader can re-run the rule above, not the adapter path.

## Numbers this page quotes

- Two runs, one endpoint, one prompt; 2 reasoning deltas in the measured shape.
- The `text` control run ends the same way with `["text"]` blocks.
