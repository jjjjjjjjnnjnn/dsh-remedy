# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-blue.svg)](#status)

[中文说明](README.zh-CN.md)

dsh-remedy is a resident repair layer for DeepSeek Harness (DSH). When a relay streams multiple tool calls into a single delta index, DSH aborts the turn with `MALFORMED_RESPONSE`. dsh-remedy intercepts `llm/stream`, buffers tool-call deltas, splits fused JSON payloads at verified boundaries, and emits valid tool call blocks. It operates strictly in-memory, writes nothing to disk unless configured, and re-throws the original error if an argument payload cannot be proven.

## What it fixes

When an upstream provider relay packs two tool calls into one index, `@earendil-works/pi-ai` receives `{...}{...}` and throws. `dsh-llm-pi-ai` converts this into `LlmError(..., 'MALFORMED_RESPONSE')`, and `dsh-agent-loop` aborts the turn because `MALFORMED_RESPONSE` is not in default `retryableCodes`. Upstream discussion deepseek-ai/deepseek-harness #4427 describes the same fusion family.

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {...}{...}
```

Measured sample from the host session log: 78 session files, 393 attempts, 38 fused calls, 44 `MALFORMED_RESPONSE` failures of which 39 are repairable, and 0 unreadable lines.

The census of 293 turns on the same host recorded 94 completed, 88 `max_tokens`, 100 error and 11 aborted. The six recorded error codes are `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, and `INVALID_REQUEST` 1.

The offline `scan` command reads a single session file or a whole session directory, understands both plain `.jsonl` and multi-frame `.jsonl.zstd`, reports one row per file with `--since` support, and prints the turn census with the error codes it counted.

## Install

Install the plugin into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Install as a project dependency:

```bash
pnpm add dsh-remedy dsh-remedy-core
```

Version 0.3.0 cannot be installed from the registry because npm published its raw workspace manifest with a literal `workspace:*` dependency. Published releases after it repair that manifest by shipping a pnpm-packed tarball. Version 0.3.1 was built with the same manifest fix but was superseded before it ever reached the registry.

Source workflow for contributors:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

dsh-remedy buffers incoming tool call deltas on the `llm/stream` Cordis seam:

```text
Input chunks:
  block-start { id: "call_01", name: "ops_bash" }
  tool-call-delta '{"command":"ls"}{"command":"pwd"}'
  finish { kind: 'error', error: LlmError('MALFORMED_RESPONSE') }

Repaired output:
  block-start { id: "call_01", name: "ops_bash" }
  block-end   { arguments: '{"command":"ls"}' }
  block-start { id: "call_01#remedy-1", name: "ops_bash" }
  block-end   { arguments: '{"command":"pwd"}' }
  finish      { kind: 'stop' }
```

The repair follows an all-or-nothing rule. Every open buffer must parse into valid top-level JSON objects. If all buffers are verified, each call receives its own `block-start` and `block-end`, and the error finish is replaced with `{kind:'stop'}`. If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.

## Safety guarantees

- Top-level JSON objects are split strictly at depth zero; `}{` inside a string is not a boundary.
- The first split call keeps its original id; synthetic calls receive `<id>#remedy-N`.
- If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, never split.
- The plugin mounts only `remedy-stream`, adding no routes, tools, or UI.
- The plugin writes nothing to disk unless `journalPath` is configured.
- `retryOnMalformed` defaults to 0 because retry is a stop-gap, not the fix.
- An empty tool name is rejected (`missing-name`), never dispatched.
- A tool name change inside one index aborts the rescue (`name-changed`) and the original failure is re-thrown.
- Adapter `replayState` is preserved across a repaired `finish`.
- A `block-end` repair is held atomic until the tool-call phase ends; any later block rejection withdraws the repair (`rolled-back`) and emits the original chunks.
- `maxCalls` bounds the total calls synthesized for the entire stream, not per block.
- Early consumer termination is recorded as `consumer-abort`, never as quiet.
- A synthesized call is emitted as a `block-start` plus a `block-end`, never a bare `block-end`.
- A withdrawn repair returns its allocated calls to the stream `maxCalls` budget.
- A `max-tokens` stream is counted as truncated and is never repaired as an unrepaired fusion.
- A passed-through provider error is counted in `errors`.
- A pure refusal raises `refused` and never `fused`.
- A budget refusal (`too-many-calls`) raises `fused`, `refused`, and `unrepaired`, ensuring a refused-but-unrepaired stream never reads `repaired`.
- An abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`.
- A stream truncation raises `withdrawn` and never `fused`.
- The four verdict words remain unchanged (`unmeasured`, `quiet`, `degraded`, `repaired`), evaluated in that order, while the counter line prints eight metrics: `streams=`, `fused=`, `repaired=`, `unrepaired=`, `truncated=`, `errors=`, `refused=`, `withdrawn=`.
- A bare member value is quoted only when exactly one segment reproduces the whole text as one plain object with a byte-identical payload.
- A resealed call keeps its own id and name, synthesizes nothing, and does not consume the stream-wide `maxCalls` budget.
- Zero candidate segments is refused as `bare-value-unproven`; two or more candidate segments is refused as `ambiguous-bare-value`.
- A stream whose only defect was a reseal reads `repaired` and never `quiet`.
- The ninth counter `resealed` is optional in the type, allowing older counter objects to render their original output byte for byte.
- `scan` reads multi-frame `.jsonl.zstd` logs through `decompressSessionLog`, the same reader the plugin ships.
- Directory scanning preserves one auditable row per file.
- `--since` reports dropped records as `before_since` rather than hiding them.
- An undecompressable file produces a failure line and exit code 3 instead of a zero report.
- Redaction matches home paths escaped with single or double backslashes and encoded session directories.
- The scanner counts every `turn/end` (completed, `max_tokens`, aborted, error) and names every `reason.error.code`, rather than reporting only `MALFORMED_RESPONSE`.
- The turn census is reported and never promoted into a finding, so the exit code still turns strictly on `fused_calls` and `fusion_failures`.
- Maintainer copy channel: the build-side copy channel moves requests longer than a Windows command line onto stdin, reads answers from the final `result` event, and names every spawn failure by its cause instead of printing a null status; it is the build-side channel and touches no seam and no outward wording.

## What it does not do

| Limit | Reality |
|---|---|
| Attribution | Stops at assembled text; cannot prove whether the relay or adapter glued the objects. |
| Truncation | A `max-tokens` truncation is missing bytes and is not repaired. |
| Localized strings | The fallback parses English `Received arguments:`; non-English disables fallback, though delta buffering still functions. |
| Headless session files | Headless profile does not persist `assistant/attempt` streams; `session.fused_calls` is 0, proof rests on journal counters and synthetic ids. |
| Synthetic IDs | IDs like `<id>#remedy-N` are traceability aids, not durable identities. |
| Desktop completion | Desktop verification artifact records `turn_end=aborted` because the operator stopped after the answer. |
| App cache | Verification applies strictly to recorded tarball sha256, not to whatever a running desktop app has cached. |
| Verdict granularity | A single verdict word cannot express observed and correctly refused; bad JSON alone reads `quiet`. |
| Journal line migration | Existing journal lines are not migrated; `status --json` reports the schema of the last line. |
| Custom index tracking | Adapters closing blocks independently with custom index tracking remain unmeasured (`BS-11`). |
| Request retries | `retryOnMalformed` defaults to 0 and is a stop-gap; host already retries server errors. |

## Verify it yourself

```bash
dsh-remedy verify
dsh-remedy scan ~/.dsh/sessions --json
pnpm run verify
node scripts/gate.mjs --mutate
```

Artifacts with sha256 sidecars are committed in `data/results/`, including live run `data/results/live-2026-11-12T12-20-00.000Z.json` and session scan `data/results/scan-full-2026-11-11T18-15-00.000Z.json`.

## Status

P-0001, P-0002, and P-0003 are `verified` on a real host: P-0001 on the headless profile and the desktop app; P-0002 on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched; P-0003 on a 2026-11-10 headless run whose journal wrote a non-zero `refused` after the code declined to repair a budget refusal.

P-0005, P-0004, P-0006, P-0007, P-0008, P-0009, and P-0010 are `tested`, not `verified`: each has unit tests and negative controls, and a measured fixture or a measured scan where one exists, but no live host run has produced the bare-value shape that P-0005 repairs; P-0004, P-0006, and P-0009 change an offline reader rather than the resident seam; P-0007 changes the build-side copy channel; P-0008 adds a build-side gate; and P-0010 changes the CLI usage text and the packaged README.

Release status: `0.3.7` is published and `latest` for both `dsh-remedy` and `dsh-remedy-core`. The previous release is `0.3.6`.

Tarball sizes for 0.3.4 are unrecorded in FACTS. Published 0.3.7 plugin: 29462 bytes compressed, 29 files, 98001 bytes unpacked (67883 bytes `dist/*.js`, 20835 bytes `dist/*.d.ts`, 3583 bytes `fixtures/`, 5700 bytes package-root files). Core 0.3.7: 20000 bytes compressed, 19 files, 65961 bytes unpacked (45670 bytes `dist/*.js`, 16994 bytes `dist/*.d.ts`). Previous 0.3.6 plugin: 29445 bytes compressed, 29 files, 97807 bytes unpacked; core 0.3.6: 19247 bytes compressed, 19 files, 63408 bytes unpacked. Earlier 0.3.3 plugin: 28378 bytes compressed, 29 files, 94769 bytes unpacked; core 0.3.3: 16776 bytes compressed, 19 files, 55684 bytes unpacked. Sourcemaps are no longer shipped, removing 41926 bytes unpacked.

Byte budget history: `dist/*.js` reached 55815 bytes after P-0005. P-0006 initially overshot to 70389 bytes before helper inlining settled it at 67908 bytes. P-0008 turned ceilings into a gate (`gate_size.mjs`) on the plugin total (68000 bytes), `repair-stream.js` (28000 bytes), `session-scan.js` (14000 bytes), and `cli.js` (10000 bytes). P-0009 landed at 67997 of 68000 bytes (three bytes under ceiling), and P-0010 single-line usage brought the plugin total to 67883 bytes.

## Development

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

## Contributing

- Issues and pull requests are welcome.
- A behavior change requires a failing test first.
- `pnpm run verify` must pass; `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependencies in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository (https://github.com/jjjjjjjjnnjnn/dsh-remedy).

## License

MIT License. Independent project; not affiliated with DeepSeek.
