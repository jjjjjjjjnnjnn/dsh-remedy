# P-0033 — A tool call with no identity was refused and then dispatched anyway

**Status**: `verified`  **Severity**: major  **Surface**: `llm/stream`  **Depends on**: P-0027, P-0030

## Symptom

Reported upstream on 2026-11-13 (`deepseek-ai/deepseek-harness#13211`, reproduced by the
reporter on **0.2.2-rc.3**): a provider emits a tool entry that carries only an index, and
the stream ends before a name or id arrives. The adapter then produces one final block:

```
{"type":"tool-call","id":"","name":"","arguments":"{}"}
```

followed by a normal `tool-calls` finish. The agent loop appends `tool/call` with an empty
`callId` and `name`, and the V4 session log then refuses to resume at the matching result:

```
format v4 tool/result at seq N requires toolCallId matching its tool source
```

Retrying the session repeats the same failure.

Measured at this seam, before the patch: the block reached `repairToolCallArguments`, was
refused as `missing-id`, the refusal was counted (`refused += 1`), and then the **original
block was passed through unchanged**. The journal therefore contained a line naming the
defect while the corrupt call went on to be persisted. That is the failure mode this project
exists to refuse: a counted defect that was not prevented.

## Root cause

The `block-end` rejection path was written for **fusion** refusals, where "refuse" correctly
means "pass the original through and let the turn fail visibly". Identity refusals are not
fusion refusals: the text is fine, the call is not, and passing it through does not fail
visibly — the host persists it and the session dies later, on resume.

Read out of the shipped runtime before choosing the fix:

- `dsh-agent-loop` appends `assistant/message` after the stream ends and then, per call,
  `session.append("tool/call", { callId: block.id, name: block.name, ... })` — the empty id
  is written verbatim;
- the result row cites that seq, and V4 admission requires the result's id to match its
  call source;
- the `llm` assembler prefers a `block-end` block over assembled deltas, so rewriting the
  block is the supported way to change what the host persists.

## What changed

In `packages/plugin/src/repair-stream.ts`, when a `block-end` tool call is refused **only**
for `missing-id` or `missing-name`:

1. the id is kept when it is non-empty, and synthesized as `call_remedy_<n>` (collision-checked
   against `seenIds`) when it is empty;
2. the name is kept when it is non-empty, and replaced with `remedy_unattributed` when it is
   empty — the same refusal name P-0027 introduced, which the runtime answers with
   `UNKNOWN_TOOL` while the turn continues (measured on rc.3);
3. the block is held as a rewrite and emitted at the same stream position, so the host
   persists a call it can dispatch and a result it can match.

Two deliberate non-changes:

- **`blockRejected` is not set.** An identity refusal is not evidence that a later fusion in
  the same stream is unprovable, so a later proven split is still repaired (pinned by a test).
- **The count stays `refused`.** Nothing was repaired — a real call did not run — so
  `repaired` would be a lie and `fused` would be another. The verdict vocabulary is frozen
  (P-0003) and `refused` alone reads `quiet`; the `rejected` event with its code is the
  record. That is written down as a limit rather than papered over.

The synthetic-id loop moved into one `syntheticId()` helper shared with the finish-path
rescue, which paid part of the patch's own byte cost.

## Judgement (red first)

Five tests in `tests/unit/repair-stream.test.ts`, four of them red before the change:

| test | before |
|---|---|
| no id + no name leaves with a traceable id and the refusal name | red — id stayed `''` |
| a named call with no id keeps its name, gains an id | red — id stayed `''` |
| an id with no name goes out under the refusal name | red — name stayed `''` |
| a synthesized id never collides with an id already in the stream | red — no id was synthesized |
| a neutralized call does not withdraw a later proven fusion | green before and after (a regression guard) |

Bytes were paid, not borrowed: `repair-stream.js` grew and the total crossed the 83 000 cap
by 916 bytes, so `monitor.ts`'s three largest comment blocks were compressed (same facts,
shorter sentences; R39 precedent). Final: **82 872 / 83 000** (residency 41 510 / 44 000,
CLI 41 362 / 42 000). No cap moved.

## Live measurement (R43)

Harness: an isolated `DSH_HOME` (`.tmp/empty-call-home`) and a local
OpenAI-compatible endpoint (`.tmp/fake-openai.mjs`) that replays the two SSE frames from
#13211. Two profiles differ **only** by whether `dsh-remedy` is mounted. One prompt, one
session, then the same session resumed by id.

| | without the plugin (`emptycall-before`) | with the plugin (`emptycall`) |
|---|---|---|
| exit | **1** | **0**, then 0 on resume |
| assistant message | `tool-call` with `id: ""`, `name: ""` | `tool-call` with `call_remedy_1` / `remedy_unattributed` |
| `tool/call` | `callId: ""`, `name: ""` | `callId: call_remedy_1`, `name: remedy_unattributed` |
| `tool/result` | never written: admission fails | `toolCallId: call_remedy_1`, `UNKNOWN_TOOL`, error result |
| turn end | `dsh: format v4 tool/result at seq 18 requires toolCallId matching its tool source` | `completed` (turn 1), `completed` (resumed turn 2) |

Artifact `data/results/live-empty-call-2026-11-14T16-02-00.000Z.json` (produced by
`scripts/record_empty_call_probe.mjs`, sha256 in the sibling sidecar) records both sessions,
the journal (`refused: 2` — the title request and the main step) and the limits. The
reproduction is synthetic at the endpoint, exactly like the upstream report's own.

## What this does not do

- It does not fix the adapter that emits an incomplete call. Two later reports (#11151 and
  #10732) measure the same chain from the `llm-pi-ai` side and ask for a guard in the adapter;
  R71 reproduced the crash here (the plugin-free control dies exactly as they describe) and
  confirmed this patch prevents it, so the reports are `patched` on this seam and the adapter
  half stays out-of-seam (`docs/research/leads.md` L-0049 / L-0050).
- A block whose arguments are **fused** and whose identity is **empty** is still refused as
  `missing-id` before any split is attempted, so it goes out as one call with the fused text
  under the refusal name. Splitting it would require synthesizing identities for fragments
  the fusion proof never saw; that is a separate decision with its own red test.
- The verdict cannot say "identity refused and neutralized": `refused` alone reads `quiet`
  because no fusion was seen. The journal event is the only record, and P-0003 froze that
  vocabulary on purpose.
- `arguments` that parse to a non-object value (a string, an array) are **not** touched here.
  That is the second half of the upstream silence (`#12064`) and is left for its own patch.

## Reproduction

```
node --test tests/unit/repair-stream.test.ts        # five P-0033 tests, four red before the fix
node scripts/gate_size.mjs                          # total 82 872 of 83 000
node -e "import('dsh-remedy').then(async ({repairStream,RemedyMonitor})=>{const s=(async function*(){yield {type:'block-end',index:0,block:{type:'tool-call',id:'',name:'',arguments:'{}'}};yield {type:'finish',reason:{kind:'stop'}}})();for await(const c of repairStream(s,new RemedyMonitor()))console.log(JSON.stringify(c))})"
# last line before finish: {"type":"block-end","index":0,"block":{"type":"tool-call","id":"call_remedy_1","name":"remedy_unattributed","arguments":"{}"}}
```
