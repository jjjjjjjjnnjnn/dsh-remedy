# P-0044 — A truncated turn was counted, and nobody asked whether it answered

**Status**: `verified` (R71: 88 of 88 `max-tokens` turns in this machine's real corpus answered nobody — `data/results/live-census-2026-11-18T22-00-00.000Z.json`)  **Severity**: major  **Surface**: `cli`  **Depends on**: P-0006, P-0042

## Symptom

`scan` has counted every way a turn ended since P-0006. It never asked the second
half of the same question: **did the user see anything?**

On this machine that gap is not hypothetical:

| what the census reported | what the transcript showed |
|---|---|
| `max_tokens=88` | **88** of those turns' last assistant message carried neither a `text` block nor a `tool-call` |

Measured with the shipped reader over 114 session files (`~/.dsh/sessions`): of
the 88 `max-tokens` turns, 71 ended with a `reasoning` block only and 17 with no
assistant message at all. A user sees an empty bubble in both cases. A turn with
text and no tool call, or a tool call and no text, is a different thing and stays
outside this count — the question is whether *anything* was shown.

Upstream reports the same shape twice, on different endings:

- #12347: a headless run whose step spent the whole `maxTokens` budget on reasoning
  (`finish_reason: "length"`, no text, no tool call) ended the turn with
  `{"kind":"max-tokens"}` and the run printed `"type":"final","text":""`. Three
  runs of a ten-task suite ended with the task undone and no failure signal.
- #13169: the same empty completion with `{"kind":"completed"}`, 5 of 774 assistant
  messages in one long session, four of them consecutive.

Both reports are host-side (`agent/loop` and the adapters decide when to stop, and
neither is this plugin's seam). What is in reach is the reader: a fault map that
cannot tell "truncated and answered half" from "truncated and answered nothing" is
describing the truncation and hiding the defect.

## Root cause

The census reads `turn/end` only. `assistant/message` events carry the block
types, and the session writer keeps them whether or not the step was truncated;
`session-scan.ts` never looked at an `assistant/message` event at all. So the
information was on disk and unused, and the number a successor reads as "88
truncations" says nothing about how many of them were silent.

## What changed

1. `packages/core/src/answer.ts` (new): two pure rules.
   - `messageAnswers(content)` — a `tool-call` answers; a `text` block answers
     only when it is not whitespace; a block type the rule does not know does not
     answer (an unknown block is not a reply);
   - `noteAssistantMessage()` / `turnAnswered()` — only the **last step** of a turn
     decides, so an earlier step that ran a tool call cannot make a silent final
     step look answered.
2. `packages/plugin/src/session-scan.ts`: records the last assistant step per turn
   and books one `truncated_without_answer` when a `max_tokens` turn did not answer.
   The field is on the report and on every `rows` entry, so a total stays
   auditable backwards.
3. `packages/plugin/src/scan-command.ts`: the human line ends with
   `truncated_without_answer=<n>`; `--json` and `--out` carry the field.
4. Nothing else moves: no verdict, no exit code, no repair path. A truncation is
   still never repaired (P-0001's limit), and this counter is reported rather
   than promoted into a finding, exactly like the census (P-0006).

## Judgement (measured, not assumed)

- `node --test tests/unit/turn-answer.test.ts` — 6 cases: text answers, tool call
  answers, reasoning alone does not, whitespace does not, the last step decides, a
  turn with no assistant message answered nothing. The first two were written
  before the implementation; the fifth pins the ordering bug the rule exists for.
- On this machine: `scan ~/.dsh/sessions` reports `turns=329 completed=127
  max_tokens=88 aborted=11 error=103` and `truncated_without_answer=88`. The 88 is
  reproducible from the artifact `data/results/scan-r55-2026-11-16T10-20-00.000Z.json`.
- Counter-evidence (the shape that must **not** be counted): a truncated turn whose
  last message carried text is not counted, even when the text is one line; the
  unit test pins that case. A `completed` turn with only reasoning is a real
  defect (#13169) but is **not** this counter's question: the field's name says
  `truncated`, and a broader counter would need its own evidence and its own name.

## What this does not do

- It does not repair a truncation, retry it, or change `turn/end`. The host decides
  when to stop; this seam counts what the host left behind.
- It does not count `completed`, `aborted` or `error` turns that answered nothing.
  On this machine `completed` such turns exist upstream (#13169) and were **not**
  seen here: 127 completed turns, 0 without an answer. A future patch that counts
  them must bring its own fixture; this one keeps the name narrow.
- It does not read a partial answer: a turn that wrote `"I will now"` and then hit
  the budget counts as answered, because the user saw words. Whether those words
  are useful is not a fact this reader can prove.
- The plugin byte account was paid in the same round (see the round notes): the
  resident half lost nothing, and the CLI half absorbed the new field by
  condensing prose in `failure-listener.ts` and `session-scan.ts`.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/turn-answer.test.ts
node packages/plugin/dist/cli.js scan "$env:USERPROFILE\.dsh\sessions" --json
node packages/plugin/dist/cli.js scan <session.v4.jsonl.zstd> --json   # carries truncated_without_answer
node scripts/gate_size.mjs
```

The census this patch was written against is
`data/results/scan-r55-2026-11-16T10-20-00.000Z.json` (114 files; 88 `max-tokens` turns,
all 88 without an answer). A reader's own directory produces its own stamped census; no
`.tmp` file is needed.
