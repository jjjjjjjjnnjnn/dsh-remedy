# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D%2022.19-brightgreen)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-brightgreen)](https://github.com/jjjjjjjjnnjnn/dsh-remedy)

[English](README.md) | [中文说明](README.zh-CN.md)

A resident repair layer for DeepSeek Harness. When an upstream model relay streams two tool calls into one delta index, DeepSeek Harness aborts the turn with `MALFORMED_RESPONSE`. dsh-remedy intercepts the stream, proves each top-level JSON boundary, emits clean tool calls, and allows the turn to complete. If a payload cannot be proven, dsh-remedy refuses to guess and re-throws the original failure.

## What it fixes

Defect `P-0001`: tool-call fusion.

An upstream relay streams two tool calls into one index. The underlying parser receives `{...}{...}` and throws a syntax error. The adapter maps this to `LlmError(..., 'MALFORMED_RESPONSE')`. Because `MALFORMED_RESPONSE` is not in default retryable codes, the turn ends.

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"param":"val"}{"param2":"val2"}
```

In a measured sample of 27 sessions with 79 `turn/end` events, tool-call fusion caused 37 failures (about 47 percent). The failure distribution across tools was:

- `ops_bash`: 11
- `read_page`: 8
- `ops_inspect_local_file`: 4
- `ops_read_files`: 3
- `list_agents`: 3
- `send_message`: 3
- `web_search`: 2
- `edit`: 1
- `ops_grep`: 1
- `spawn_teammate`: 1

Counter-evidence shows 1 successful attempt carried 2 distinct ids, confirming that the defect is intermittent. Upstream discussion deepseek-ai/deepseek-harness #4427 describes the same fusion family.

## Install

Install the plugin into a DeepSeek Harness profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Or install as a library dependency:

```bash
pnpm add dsh-remedy dsh-remedy-core
```

For contributors building from source:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

dsh-remedy wraps the `llm/stream` Cordis waterfall. It buffers incoming tool-call deltas. On a terminal `finish{kind:'error'}` with `MALFORMED_RESPONSE` (or a thrown error with the same signature), the engine splits open buffers at top-level JSON object boundaries.

```text
Incoming stream:
  delta:  {"command":"pwd"}{"command":"ls"}
  finish: { kind: 'error', error: MALFORMED_RESPONSE }

Repaired stream:
  call 0: id="call_1", arguments={"command":"pwd"} -> block-end
  call 1: id="call_1#remedy-1", arguments={"command":"ls"} -> block-end
  finish: { kind: 'stop' }
```

The first call keeps its original id. Subsequent calls receive synthetic ids formatted as `<id>#remedy-N`. The error finish is replaced with `{kind:'stop'}`.

All-or-nothing rule: if any buffer cannot be proven, nothing is emitted and the original failure is re-thrown. A single object that fails to parse is rejected, not split.

## Safety guarantees

- All-or-nothing: if any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- A `max-tokens` truncation is never repaired.
- The plugin writes nothing unless `journalPath` is configured.
- The plugin mounts 1 row (`remedy-stream`), adding no route, no tool, and no UI.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.
- `retryOnMalformed` defaults to 0: retry is a stop-gap, not the fix.

## What it does not do

| Limit | Detail |
| --- | --- |
| Root cause attribution | Attribution stops at the assembled text: the plugin cannot prove whether the relay or the adapter glued the objects. |
| Truncated streams | A `max-tokens` truncation is not repaired. |
| Headless session persistence | The headless profile does not persist `assistant/attempt` streams, so `session.fused_calls` in the live artifact is 0; the journal counters and the synthetic id carry the proof. |
| Host message localization | The message fallback parses the English `Received arguments:` text; a localized host message disables that fallback, but the delta buffer path still works. |
| Synthetic identities | Synthetic ids are traceability aids, not durable identities. |
| Desktop turn status | The desktop turn was stopped by the operator after the task answer; the artifact records `turn_end=aborted` instead of claiming completion. |
| Desktop app cache | Verification applies to the recorded tarball `sha256`, not to whatever a running desktop app has cached. |

## Verify it yourself

Run verification commands:

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

Run CLI commands (exit codes: 0 ok, 1 finding, 2 usage, 3 unavailable):

```bash
dsh-remedy status
dsh-remedy verify
```

Real verification artifacts:

```text
data/results/live-2026-11-09T17-00-00.000Z.json
data/results/live-desktop-2026-11-09T19-10-00.000Z.json
```

## Status

Version 0.1.0 is published to npm (`dsh-remedy` and `dsh-remedy-core`). Verified on a headless profile (`remedy-live`) and the desktop app.

Headless verification (`remedy-live` profile, Windows):
- Runs: 2
- Streams observed: 10
- Fused calls: 1
- Repaired: 1
- Rejected or unrepaired: 0
- Truncated: 0
- Other stream errors: 0
- Turn outcome: `completed`
- Tool calls: 5, tool results: 5
- Synthetic id: `call_00_82805lrla1dhndlzpv1cakrx#remedy-1`

Desktop app verification (`desktop` profile, app restarted):
- Streams observed: 39
- Fused calls: 2
- Repaired: 2
- Rejected or unrepaired: 0
- Synthetic id: `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`
- Turn outcome: `turn_end=aborted` (stopped by operator after the answer)

Test suite and gates:
- Tests: 95 pass, 0 fail
- Gates: 5 pass, 5 of 5 negative controls caught

## Development

Requires Node `>= 22.19` and pnpm.

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

Repository layout:
- `packages/core`: pure engine: splitter, repair decision, registry, redaction, verdict.
- `packages/plugin`: DSH loader, `llm/stream` wrapper, CLI, session scanner, zstd log reader.
- `scripts/`: gates and recorders, Node built-ins only.
- `tests/`: unit, governance, e2e (5 fixtures).
- `data/fixtures`: real fused text, counter-evidence, negative controls.
- `data/results`: script-produced evidence with `sha256` sidecars.
- `audit/`: gate ledger, patch ledger, step reviews, blind spots, AI disclosure.
- `docs/`: handoff, patch record, ADR, copy channel.

## Contributing

Issues and pull requests are welcome.

- A behavior change needs a failing test first.
- `pnpm run verify` must pass.
- `node scripts/gate.mjs --mutate` must catch every gate (5 of 5).
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository.

## License

MIT.

Independent project; not affiliated with DeepSeek.
