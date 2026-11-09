# P-0001 — Tool-call fusion in one stream index

**Status**: `verified` (real headless DSH host, 2026-11-09; offline replay + unit tests before that)
**Severity**: critical — the turn stops and the user sees a red error instead of the work
**Surface**: `llm/stream`
**First seen**: 2026-11-08T10:47Z · **Last seen in the sample**: 2026-11-09T15:58Z
**Live verification**: `data/results/live-2026-11-09T17-00-00.000Z.json`

## Symptom

```
Tool call "ops_bash": Unexpected non-whitespace character after JSON at position 258
Received arguments:
{"command": "…", "description": "…"}{"path": "…"}
```

Two well-formed JSON objects, no separator, one tool-call block.

## Measured facts

| Fact | Value | How it was measured |
|---|---|---|
| Sessions with the signature | 27 | `turn/end` events with `code: MALFORMED_RESPONSE` |
| Turns that ended | 79 | same |
| Turns that died on fusion | 37 (≈47%) | same |
| Objects per fused call | always exactly 2 | splitter over the echoed arguments |
| Tools affected | `ops_bash` 11, `read_page` 8, `ops_inspect_local_file` 4, `ops_read_files` 3, `list_agents` 3, `send_message` 3, `web_search` 2, `edit` 1, `ops_grep` 1, `spawn_teammate` 1 | same |

The count is a sample from one machine, not a population estimate.

## Root cause chain

1. The relay streams two tool calls into one index. The adapter concatenates their
   argument deltas into one string.
2. `@earendil-works/pi-ai@1.3.0` `dist/utils/json-parse.js#parseToolCallArguments`
   calls `JSON.parse` on that string and throws.
3. `@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1656` converts the throw into
   `LlmError(..., 'MALFORMED_RESPONSE')`.
4. `@deepseek-ai/dsh-agent-loop/lib/index.js:923` sees `finish.kind === 'error'`,
   asks `agent/request-error` for an action, gets none, and re-throws.
5. `MALFORMED_RESPONSE` is **not** in the default `retryableCodes`, so the turn
   ends.

## Counter-evidence

A successful attempt in the same failure family carried two distinct ids
(`call_00_uboz5255pcf39waca51ss537`, `call_01_ei992roe30zruzcqw1yd4i48`). The
relay sometimes sends correct indexes. The defect is intermittent, so a single
green run proves nothing.

Upstream: `deepseek-ai/deepseek-harness` discussion **#4427** describes the same
fusion family and is still present in `0.2.2-rc.1`.

## Repair

`llm/stream` is a Cordis waterfall. The plugin wraps the returned chunk stream:

1. Buffer `tool-call-delta` text per index.
2. On a terminal `finish{kind:'error'}` with `MALFORMED_RESPONSE` (or a thrown
   error with the same signature), split every open buffer at top-level object
   boundaries.
3. Emit one `block-end` per proven object; the first keeps the original id, the
   rest get `#remedy-N`.
4. Replace the error finish with `{kind:'stop'}`.
5. If **any** buffer cannot be proven, emit nothing and let the original failure
   through.

A `block-end` that already carries fused arguments is repaired the same way, so
adapters that close the block before throwing are covered too.

## Invariants (each has a negative control)

- A value that parses is never rewritten.
- A single object that fails to parse is rejected, not split.
- `finish{kind:'max-tokens'}` is never repaired.
- Every fragment must parse to a plain object.
- `}{` inside a JSON string is not a boundary.
- One unrepairable call aborts the whole rescue.
- The original failure is re-thrown when no repair is proven.

## What this does not fix

- The relay/adapter that assigned one index to two calls.
- A truncated tail (`max-tokens`): the missing bytes are not invented.
- Attribution: the plugin sees the assembled text, not the stage that glued it.

## Reproduction

```powershell
node packages/plugin/dist/cli.js verify
node packages/plugin/dist/cli.js scan <session.jsonl> --json
node packages/plugin/dist/cli.js repair data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json
```

## Live verification (2026-11-09)

Profile `remedy-live` (headless template + the desktop provider block), dsh `0.2.2-rc.1`,
plugin installed with `dsh plugin --profile remedy-live add <tarball>`.

| Fact | Value |
|---|---|
| Runs | 2 |
| Streams observed | 10 (5 + 5) |
| Fused calls | 1 (attempt 2) |
| Repaired | 1 |
| Rejected / unrepaired | 0 |
| Turn outcome | `completed` |
| Tool calls / results | 5 / 5 |
| Synthetic id in the session | `call_00_82805lrla1dhndlzpv1cakrx#remedy-1` |

The first mount failed with `stream is not async iterable`: `llm/stream` is a
**synchronous** Cordis waterfall, and an `async` listener returns a Promise where
the caller iterates an AsyncIterable. The listener is now synchronous; the
regression is pinned by `tests/unit/plugin-mount.test.ts`.

Cross-check: the plugin journal and the runner's per-attempt counters agree
(`streams=10 / fused=1 / repaired=1`). The headless profile does not persist
`assistant/attempt` streams, so `session.fused_calls` is 0 by construction; the
repair is evidenced by the journal and the synthetic id (`BS-07`).

## Evidence

- `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` — real fused text
- `data/fixtures/toolcall-fusion/valid-two-calls.json` — counter-evidence shape
- `data/results/live-2026-11-09T17-00-00.000Z.json` — real Host mount
- `tests/unit/json-split.test.ts`, `tests/unit/toolcall-repair.test.ts`,
  `tests/unit/repair-stream.test.ts`, `tests/unit/plugin-mount.test.ts`
