# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](https://nodejs.org)
[![Status: verified](https://img.shields.io/badge/status-verified-brightgreen)](data/results)

[中文说明](README.zh-CN.md)

`dsh-remedy` is a resident repair layer for DeepSeek Harness. It intercepts the `llm/stream` Cordis waterfall, splits fused tool calls into distinct invocations, and delivers a clean finish state. It does not patch `app.asar`, makes no disk writes unless a journal is configured, and re-throws the original error whenever a payload cannot be verified.

## What it fixes

When an upstream relay streams multiple tool calls into one response index, `@earendil-works/pi-ai` receives concatenated JSON objects and throws a parse error. `dsh-llm-pi-ai` flags the stream as `MALFORMED_RESPONSE`, which `dsh-agent-loop` treats as non-retryable, terminating the turn.

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"path":"..."}{"path":"..."}
```

In a measured sample of 48 session files containing 120 `turn/end` events, this caused 40 `MALFORMED_RESPONSE` failures. Of those 40 failures, 37 are two JSON objects glued at the top level and provably repairable; 2 are cut inside an object; 1 is another split failure. Upstream discussion deepseek-ai/deepseek-harness #4427 describes the same fusion family.

## Install

Install the plugin into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-remedy@0.3.1
```

Install as libraries:

```bash
pnpm add dsh-remedy@0.3.1 dsh-remedy-core@0.3.1
```

Note: Version 0.3.0 of the plugin cannot be installed from the registry because npm published its raw workspace manifest with a literal `workspace:*` dependency (`EUNSUPPORTEDPROTOCOL`). Version 0.3.1 ships the same code from a pnpm-packed tarball.

For contributors working from source:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

`dsh-remedy` buffers tool-call deltas on `llm/stream`. When a terminal `finish` arrives with `MALFORMED_RESPONSE` (or an equivalent thrown error), it splits open buffers at top-level JSON boundaries:

```
Measured chunk sequence:
  block-start(id="call_0") -> delta('{"path":"a"}{"path":"b"}') -> finish(kind="error", code="MALFORMED_RESPONSE")

Repaired output:
  block-start(id="call_0") -> delta('{"path":"a"}') -> block-end
  block-start(id="call_0#remedy-1") -> delta('{"path":"b"}') -> block-end
  finish(kind="stop")
```

The repair operates on an all-or-nothing rule. Every split segment must parse as valid JSON. If any buffer fails verification, no repaired chunks are emitted and the original failure is re-thrown.

## Safety guarantees

- Intercepts only on the `llm/stream` Cordis waterfall; mounts one row (`remedy-stream`) and adds no route, tool, or UI.
- Writes nothing to disk unless `journalPath` is explicitly configured.
- All-or-nothing repair: if any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not treated as a boundary.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.
- `retryOnMalformed` defaults to 0 because retry is a stop-gap, not the fix.
- An empty tool name is rejected (`missing-name`) and never dispatched.
- A tool name that changes inside one index (`name-changed`) aborts the rescue and re-throws the original failure.
- Preserves adapter `replayState` on a repaired `finish`.
- Atomic `block-end` commit: held until the tool-call phase ends; a later rejection in the same stream rolls back the repair and emits original chunks.
- `maxCalls` bounds calls synthesized for the whole stream, not per block.
- A stream stopped early by the consumer is recorded as `consumer-abort` (abandoned), not as quiet.
- A synthesized call opens its own `block-start` plus `block-end`, never emitting a bare `block-end`.
- A withdrawn repair returns its allocated calls to the stream `maxCalls` budget.
- A `max-tokens` stream is counted as truncated, never repaired or treated as an unrepaired fusion.
- A provider error that passes through is counted in `errors`.
- A pure refusal raises `refused` and never `fused`.
- A budget refusal (`too-many-calls`) raises `fused`, `refused`, and `unrepaired` so a refused-but-unrepaired stream never reads `repaired`.
- An abandoned stream (`consumer-abort`) keeps `fused` and `unrepaired` and also raises `withdrawn`.
- A truncation raises `withdrawn` and never `fused`.
- The four verdict words (`unmeasured`, `quiet`, `degraded`, `repaired`) are unchanged; only the counter line grew to eight names (`streams=`, `fused=`, `repaired=`, `unrepaired=`, `truncated=`, `errors=`, `refused=`, `withdrawn=`).
- `unrepaired` means exactly one thing: a fusion was proven and was not repaired.

## What it does not do

| Area | Limit |
|---|---|
| Attribution | Attribution stops at the assembled text; cannot prove whether the relay or the adapter glued the objects. |
| Truncation | A `max-tokens` truncation is never repaired. |
| Headless sessions | The headless profile does not persist `assistant/attempt` streams; `session.fused_calls` in the live artifact is 0 (journal counters and synthetic id hold proof). |
| Synthetic ids | Synthetic ids are traceability aids, not durable identities. |
| Localization | The message fallback parses English `Received arguments:` text; a localized host message disables that fallback, but the delta buffer path still works. |
| Desktop turn outcome | The desktop turn was stopped by the operator after the task answer; the artifact records `turn_end=aborted` instead of claiming completion. |
| Verification scope | Verification applies to the recorded tarball sha256, not to whatever a running desktop app has cached. |
| Verdict expressiveness | The verdict word cannot express `observed and correctly refused`; only the counter line can (a stream whose only defect was bad JSON reads `quiet`). |
| Journal migration | Existing journal lines are not migrated; in a mixed journal `status --json` reports the shape of the last line. |
| Index bookkeeping | An adapter that closes blocks itself and keeps its own index bookkeeping is still unmeasured (`BS-11`). |
| Request retry | The retry fallback on `agent/request-error` defaults to 0 and is a stop-gap; the host already retries server-error groups (84 of 93 failing groups were followed by a successful attempt in the same turn). |
| Sample cutoff | The sample behind the numbers reflects one machine and one account over a fixed cutoff; a different cutoff yields a different total. |

## Verify it yourself

Verify an installed copy or a local checkout against the fixture suite:

```bash
# Verify fixtures from an installed copy
npx dsh-remedy verify

# Local verification suite (build, typecheck, test, gate)
pnpm run verify

# Negative controls (asserts all 5 gates fail under mutation)
node scripts/gate.mjs --mutate
```

Real verification artifacts with sha256 sidecars are committed in `data/results/`:
- Headless run (P-0001): `data/results/live-2026-11-09T17-00-00.000Z.json`
- Desktop run (P-0001): `data/results/live-desktop-2026-11-09T19-10-00.000Z.json`
- Live fusion repair (P-0002): `data/results/live-2026-11-10T14-45-00.000Z.json`
- Budget refusal run (P-0003): `data/results/live-2026-11-10T16-30-00.000Z.json`

## Status

0.3.1 is the installable release of both packages (`dsh-remedy` and `dsh-remedy-core`). 0.3.0 of the plugin is a broken release that the registry cannot install.

Patches P-0001, P-0002, and P-0003 are verified on real hosts:
- P-0001: verified on the headless profile and the desktop app.
- P-0002: verified on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched.
- P-0003: verified on a 2026-11-10 headless run whose journal wrote a non-zero `refused` after declining to repair a budget refusal.

The 0.3.1 plugin tarball is 22418 bytes compressed (20 entries, 74014 bytes unpacked). Its unpacked payload contains 52247 bytes of `dist/*.js`, 13797 bytes of `dist/*.d.ts`, 2694 bytes of `fixtures/`, and 5276 bytes of package-root files. Sourcemaps are no longer shipped, removing 41926 bytes from the unpacked payload. `dist/*.js` uses 52247 bytes of its 53000-byte budget. The 0.3.1 core tarball is 11585 bytes compressed (17 entries, 38582 bytes unpacked).

## Development

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

`pnpm run verify` runs build, typecheck, tests (131 pass, 0 fail), and 5 gates (`ssot`, `registry`, `namespace`, `step-review`, `copy`). `node scripts/gate.mjs --mutate` verifies that all 5 gates catch injected mutations.

## Contributing

Issues and pull requests are welcome.

- A behavior change requires a failing test first.
- `pnpm run verify` must pass; `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; any new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependencies in `dsh-remedy-core`.
- A patch cannot claim `verified` without a corresponding `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository (enabled 2026-11-09).

## License

MIT. Independent open-source project; not affiliated with DeepSeek.
