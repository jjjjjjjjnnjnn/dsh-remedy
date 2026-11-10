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

An upstream relay streams two tool calls into one index. `@earendil-works/pi-ai` `parseToolCallArguments` receives `{...}{...}` and throws. `dsh-llm-pi-ai` converts it to `LlmError(..., 'MALFORMED_RESPONSE')`. Because `MALFORMED_RESPONSE` is not in default `retryableCodes`, `dsh-agent-loop` re-throws and the turn ends.

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"param":"val"}{"param2":"val2"}
```

Across a measured sample of 48 session files with 120 `turn/end` events, there were 40 `MALFORMED_RESPONSE` failures, of which 37 are provable fusions (two JSON objects glued at the top level). 2 failures were cut inside an object and 1 was another split failure.

Counter-evidence shows 1 successful attempt carried 2 distinct ids, confirming that the defect is intermittent. Upstream discussion deepseek-ai/deepseek-harness #4427 describes the same fusion family.

## Install

Install the plugin into a DeepSeek Harness profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Install as a library dependency:

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

dsh-remedy wraps the `llm/stream` Cordis waterfall. It buffers incoming tool-call deltas. On a terminal `finish{kind:'error'}` with `MALFORMED_RESPONSE` (or a thrown error with the same signature), the engine splits open buffers at top-level JSON object boundaries. A `block-end` that already carries fused arguments is repaired the same way.

```text
Incoming stream:
  delta:  {"command":"pwd"}{"command":"ls"}
  finish: { kind: 'error', error: MALFORMED_RESPONSE }

Repaired stream:
  call 0: id="call_1", arguments={"command":"pwd"} -> block-end
  call 1: id="call_1#remedy-1", arguments={"command":"ls"} -> block-end
  finish: { kind: 'stop' }
```

The first call keeps its original id. Synthetic ids are formatted as `<id>#remedy-N`. The error finish is replaced with `{kind:'stop'}`.

All-or-nothing rule: if any buffer cannot be proven, nothing is emitted and the original failure is re-thrown. A single object that fails to parse is rejected, not split.

## Safety guarantees

- If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.
- The plugin mounts 1 row (`remedy-stream`), adding no route, no tool, and no UI.
- The plugin writes nothing unless `journalPath` is configured.
- `retryOnMalformed` defaults to 0: retry is a stop-gap, not the fix.
- An empty tool name is rejected (`missing-name`), never dispatched to an empty name.
- A tool name that changes inside one index aborts the rescue and the original failure is re-thrown (`name-changed`).
- A repaired `finish` keeps the adapter `replayState`.
- A `block-end` repair is held until the tool-call phase ends; a later rejection in the same stream withdraws it (`rolled-back`) and the original chunks go out.
- `maxCalls` bounds the calls synthesized for the whole stream, not per block.
- A stream whose consumer stops early is recorded as consumer abort (`consumer-abort`), not as quiet.
- A synthesized call is emitted as a `block-start` plus a `block-end`, never a bare `block-end`.
- A withdrawn repair returns its budget to the stream `maxCalls` budget.
- A `max-tokens` truncation is never repaired and is counted as truncated, never as an unrepaired fusion.
- A provider error that passes through is counted in `errors`.
- A pure refusal raises `refused` only and never raises `fused`.
- A budget refusal (`too-many-calls`) raises `fused`, `refused`, and `unrepaired`, so a refused-but-unrepaired stream never reads `repaired`.
- An abandoned stream (`consumer-abort`) keeps `fused` and `unrepaired` and also raises `withdrawn`.
- A truncation raises `withdrawn` and never `fused`.
- The four verdict words are unchanged (`unmeasured`, `quiet`, `degraded`, `repaired`) and only the counter line grew to eight names (`streams=`, `fused=`, `repaired=`, `unrepaired=`, `truncated=`, `errors=`, `refused=`, `withdrawn=`).
- `unrepaired` means exactly 1 thing: a fusion was proven and was not repaired.

## What it does not do

| Limit | Detail |
| --- | --- |
| Root cause attribution | Attribution stops at the assembled text: the plugin cannot prove whether the relay or the adapter glued the objects. |
| Headless session persistence | The headless profile does not persist `assistant/attempt` streams, so `session.fused_calls` in the live artifact is 0; the journal counters and the synthetic id carry the proof. |
| Synthetic identities | Synthetic ids are traceability aids, not durable identities. |
| Host message localization | The message fallback parses the English `Received arguments:` text; a localized host message disables that fallback, but the delta buffer path still works. |
| Truncated streams | A `max-tokens` truncation is not repaired. |
| Desktop turn status | The desktop turn was stopped by the operator after the task answer; the artifact records `turn_end=aborted` instead of claiming completion. |
| Desktop app cache | Verification applies to the recorded tarball sha256, not to whatever a running desktop app has cached. |
| Refusal verdict | The verdict word cannot express `observed and correctly refused`; only the counter line can. A stream whose only defect was bad JSON now reads `quiet`. |
| Journal migration | Existing journal lines are not migrated; in a mixed journal `status --json` reports the shape of the last line. |
| Downstream block acceptance | A synthesized tool call now opens its own `block-start`, and the live run of 2026-11-10 proves the finish path is accepted downstream; an adapter that closes blocks itself and keeps its own index bookkeeping is still unmeasured (blind spot `BS-11`). |
| Error retry | The retry fallback on `agent/request-error` defaults to 0 and is a stop-gap, not the fix; the 0.3.0 sample shows the host already retries the server-error family (84 of 93 failing groups were followed by a successful attempt in the same turn). |
| Sample scope | The sample behind the 0.3.0 numbers is one machine and one account over a fixed cutoff; a different cutoff yields a different total. |

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
data/results/live-2026-11-10T14-45-00.000Z.json
```

## Status

`0.3.x` is published to npm (`dsh-remedy` and `dsh-remedy-core`). Patches `P-0001` and `P-0002` are `verified` on a real host (`P-0001` on the headless profile and the desktop app; `P-0002` on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched). Patch `P-0003` is `tested` with negative controls — a live host does write all eight counters, but only as zeros on a clean repair.

Live verification records:
- Headless run (`remedy-live` profile, Windows): 2 runs, 10 streams observed, 1 fused call, 1 repaired, 0 rejected or unrepaired, 0 truncated, 0 other stream errors, turn outcome `completed`, 5 tool calls, 5 tool results, synthetic id `call_00_82805lrla1dhndlzpv1cakrx#remedy-1`.
- Desktop app run (`desktop` profile, app restarted): 39 streams observed, 2 fused calls, 2 repaired, 0 unrepaired, synthetic id `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`, turn outcome `turn_end=aborted` (stopped by operator after the answer).
- Headless run of 2026-11-10 (`remedy-live` profile, DSH 0.2.2-rc.1, tarball sha256 `5f73032548c761174aea697167c14b0ef25e1d881ddf2c6e2c0182fe73e99aeb`): 18 journal events (17 `stream` plus 1 `repaired`), event carrying `fused=1, repaired=1, unrepaired=0, truncated=0, errors=0, refused=0, withdrawn=0`. Synthetic call `call_00_6zgcmtvebmpnr8613wbr7wk9#remedy-1` was dispatched and answered, turn outcome `completed`.

Test suite and gates:
- Tests: 126 pass, 0 fail.
- Gates: 5 (`ssot`, `registry`, `namespace`, `step-review`, `copy`), 5 of 5 negative controls caught.
- Fixtures: 5 (including 1 real fused call and 1 counter-evidence call).

Package size and byte budget:
The shipped `0.3.0` tarball is 22418 bytes compressed with 20 entries and 74014 bytes unpacked (before the slimming pass on `0.1.1`: 26345 bytes compressed, 98424 bytes unpacked across 30 files, including 10 sourcemap files; the shipped `0.2.0` tarball is 19569 bytes compressed, 20 entries, 64933 bytes unpacked). The unpacked breakdown of `0.3.0` is 52247 bytes of `dist/*.js`, 13797 bytes of `dist/*.d.ts`, 2694 bytes of `fixtures/`, and 5276 bytes of package-root files. Dropping sourcemaps removes 41926 bytes of unpacked payload. The package ships `dist/*.js`, `dist/*.d.ts`, `fixtures/`, `cordis.patch.yml`, `README.md`, `LICENSE`, and no sourcemaps. `dist/*.js` is 52247 bytes after `P-0003`, within the working ceiling of 53000 bytes.

## Development

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

Repository layout:
- `packages/core` — pure engine: splitter, repair decision, registry, redaction, verdict.
- `packages/plugin` — DSH loader, `llm/stream` wrapper, CLI, session scanner, zstd log reader.
- `scripts/` — gates and recorders, Node built-ins only.
- `tests/` — unit, governance, e2e.
- `data/fixtures` — real fused text, counter-evidence, negative controls.
- `data/results` — script-produced evidence with sha256 sidecars.
- `audit/` — gate ledger, patch ledger, step reviews, blind spots, AI disclosure.
- `docs/` — handoff, patch record, ADR, copy channel.

## Contributing

Issues and pull requests are welcome.

- A behavior change needs a failing test first.
- `pnpm run verify` must pass.
- `node scripts/gate.mjs --mutate` must catch every gate (5 of 5).
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository (enabled 2026-11-09).

## License

MIT

Independent project; not affiliated with DeepSeek.
