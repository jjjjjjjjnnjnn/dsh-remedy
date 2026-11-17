# P-0052 — a completed turn can end on the tool call the UI does not read

**Status:** `tested` · **Seam:** `cli` (offline reader) · **Upstream:** deepseek-ai/deepseek-harness discussion #12741

## Symptom

A long tool loop finishes, and the transcript shows only tool rows and "Worked for 2m" —
no sentence the user can read. The report's own wording: "长任务持续调用工具，但整轮没有
任何可见回复". The turn is not an error and not truncated; `turn/end` says `completed`.

## Mechanism (measured in the host source, DSH 0.2.2-rc.3)

A step ends only when its assistant message has no tool calls — but a tool result can
end the turn itself:

```ts
// dsh/node_modules/@deepseek-ai/dsh-agent-loop/src/agent.ts:592-603
const toolCalls = message.content.filter(block => block.type === 'tool-call')
if (toolCalls.length === 0) return { kind: 'completed' }
...
return result.concluded ? { kind: 'completed' } : null
```

`result.concluded` comes from `ToolExecutionResult.concludesTurn`, set by a tool calling
`ToolRunContext.concludeTurn()` (`dsh-tools/src/contracts.ts:261`, `batch.ts:147`). So a
`completed` turn may end on a step that still carries a text block **and** a tool call.

The client then refuses that step as the answer:

```ts
// dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/turn-process.ts:160-161
if (!isFinalAssistant(data) || !hasAssistantReplyContent(data.blocks)) return null
return data.blocks.some(block => block.kind === 'tool-call') ? null : data
```

`assistant-content.ts:9-15` classifies `tool-call` as protocol material, not a reply. A
final step with any tool-call block therefore renders no final answer, even when the same
step also has visible text. The UI has no placeholder for the case; it shows the process
rows and nothing else.

This project's `answer.ts` counts a tool call as visible work (P-0044). That rule is still
right for "did the turn answer anyone?" — a tool call is in the transcript. P-0052 adds a
second, narrower count for the gap between the two vocabularies instead of redefining the
first one.

## The local reproduction

Two headless runs on one isolated `DSH_HOME`, same local OpenAI-compatible endpoint, same
prompt, same `probe_conclude` tool:

| run | endpoint first step | `concludeTurn()` | last assistant step | `turn/end` |
|---|---|---|---|---|
| `conclude` | one text delta + one tool call, `finish_reason: "tool_calls"` | on | `["text","tool-call"]` | `completed` |
| `control` | the same | off | `["text"]` (step 2) | `completed` |

Artifact `data/results/live-toolcall-2026-11-17T13-30-00.000Z.json`, produced by
`scripts/record_toolcall_turn.mjs`; it refuses to write unless both exits are 0, both turns
end `completed`, the last block sets differ exactly as above, and the scanner counts one
`completed_on_tool_call` and zero `completed_without_answer`.

The host harness (a local endpoint plus a probe plugin whose tool calls `concludeTurn()`)
is not shipped. The recorder and the artifact are; the recorder's header names the two
inputs it needs.

## What changed

`packages/core/src/answer.ts`

- `messageOnToolCall(blocks)` — true when the message carries a `tool-call` block.
- `LastAnswer` gains `toolCall`; `noteAssistantMessage` records it beside `answered`.
- `turnOnToolCall(last, turn)` — true when the **last** step carried a tool call.
- `turnAnswered` is unchanged: a tool call still counts as work (P-0044).

`packages/plugin/src/session-scan.ts`

- `completed_on_tool_call` — `completed` turns whose last assistant message carries a
  tool call. Per-file rows and the aggregate both carry it.
- It is disjoint from `completed_without_answer` (P-0047): that one needs no text **and no**
  tool call.

`packages/plugin/src/scan-command.ts` prints the new number beside the other counters.

`packages/plugin/src/explain-command.ts` prints one `TOOLCALL` finding and exits 1 when
the count is positive; without `--sessions` the count is `null`, not `0`.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/on-tool-call.test.ts
node --test tests/e2e/explain-toolcall.test.ts
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --json
node packages/plugin/dist/cli.js explain --sessions "<home>/.dsh/sessions"
```

The probe run itself is not shipped; the recorder and the artifact are:

```powershell
node scripts/record_toolcall_turn.mjs --conclude <run-dir> --control <run-dir> --stamp <ISO>
```

## Limits

- It is a counter, not a repair: the host decides to conclude, and the UI decides what is
  visible. Nothing here changes either.
- Only `completed` turns are counted. A `max_tokens` turn that ends on a tool call keeps
  P-0044's meaning; its own missing-answer question is not re-asked here.
- The count is a transcript rule, not a count of user-visible incidents: before the probe
  this machine had zero of the shape (131 completed turns, all ending on text).
- The local endpoint is synthetic, one route / one model / one tool / one prompt; a
  multi-tool batch and a multi-step conclusion were not exercised.
- The desktop UI was not driven; the "no visible reply" half is read from
  `turn-process.ts:160-161`, not observed on screen.
- A finding, not a coverage row: no resident seam is involved (the same boundary P-0051
  recorded).
