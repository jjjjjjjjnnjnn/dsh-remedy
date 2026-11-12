# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions) [![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](package.json) [![Status](https://img.shields.io/badge/status-verified-brightgreen)](#status)

[简体中文](README.zh-CN.md)

dsh-remedy is a resident repair layer for DeepSeek Harness (DSH). When an upstream relay stream concatenates multiple tool calls into one index or omits quotes around program code, DSH terminates the turn with a `MALFORMED_RESPONSE` error. dsh-remedy mounts at the `llm/stream` seam, repairs proven payloads in flight, and re-throws unproven failures unchanged.

## What it fixes

The defect occurs when upstream relays stream multiple tool calls into a single delta buffer or emit unquoted string values (upstream discussion: deepseek-ai/deepseek-harness discussion #4427).

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"command":"..."}{"command":"..."}
```

A measured sample across 78 session files found 393 attempts, 38 fused calls, 44 `MALFORMED_RESPONSE` failures of which 39 are repairable, and 0 unreadable lines. Of 293 turns, 94 completed, 88 `max_tokens`, 100 error and 11 aborted. The error turns name six error codes: `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, and `INVALID_REQUEST` 1.

The `dsh-remedy scan` command reads a single session file or a whole session directory, understands both plain `.jsonl` and multi-frame `.jsonl.zstd`, reports one row per file with `--since` support, and prints the turn census with the error codes it counted.

## Install

Install into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Embed as a library:

```bash
pnpm add dsh-remedy dsh-remedy-core
```

Release 0.3.0 of the plugin cannot be installed from the registry because npm published its raw workspace manifest with a literal `workspace:*` dependency. The published releases after it repair that manifest by shipping a pnpm-packed tarball. Release 0.3.1 was built with the same manifest fix but was superseded before it ever reached the registry.

Source workflow for contributors:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

dsh-remedy intercepts chunk events on the `llm/stream` seam and buffers tool-call deltas.

```text
Input stream:
  block-start (index: 0, tool: "ops_bash", id: "call_00_xyz")
  delta       (arguments: '{"command":"echo 1"}{"command":"echo 2"}')
  finish      (kind: "error", error: "MALFORMED_RESPONSE")

Repaired stream:
  block-start (index: 0, tool: "ops_bash", id: "call_00_xyz")
  delta       (arguments: '{"command":"echo 1"}')
  block-end   (index: 0)
  block-start (index: 1, tool: "ops_bash", id: "call_00_xyz#remedy-1")
  delta       (arguments: '{"command":"echo 2"}')
  block-end   (index: 1)
  finish      (kind: "stop")
```

The first call keeps its original id; subsequent synthesized calls receive `<id>#remedy-N`. Under the all-or-nothing rule, every buffer in the stream must be proven as a valid JSON object. If any buffer cannot be proven, nothing is emitted, synthesized calls are withdrawn, and the original failure is re-thrown.

## Safety guarantees

- Zero disk writes by default: the plugin writes nothing unless `journalPath` is configured.
- If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- An empty tool name is rejected, never dispatched to an empty name.
- A tool name that changes inside one index aborts the rescue and the original failure is re-thrown.
- A repaired `finish` preserves the adapter `replayState`.
- Atomic `block-end` commit: a `block-end` repair is held until the tool-call phase ends; if a later block in the same stream is rejected, the repair is withdrawn and the original chunks go out.
- The `maxCalls` limit bounds synthesized calls across the whole stream, not per block.
- A stream whose consumer stops early is recorded as `consumer-abort` and abandoned, not quiet.
- A synthesized call opens its own `block-start` before `block-end`, never emitting a bare `block-end`.
- A withdrawn repair returns its budget to the stream `maxCalls` limit.
- A `max-tokens` stream is counted as truncated, never as an unrepaired fusion.
- A provider error that passes through is counted in `errors`.
- A pure refusal raises `refused` and never `fused`.
- A budget refusal also raises `unrepaired` so a refused-but-unrepaired stream never reads `repaired`.
- An abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`.
- The four verdict words (`unmeasured`, `quiet`, `degraded`, `repaired`) are unchanged and only the counter line grew to eight names.
- A bare member value is quoted only when exactly one segment reproduces the whole text as one plain object with a byte-identical payload.
- The call keeps its own id and name, the reseal synthesizes nothing, and does not consume the stream-wide `maxCalls` budget.
- Zero or two-or-more candidates are refused instead of guessed.
- A stream whose only defect was a reseal reads `repaired` and never `quiet`.
- The ninth counter `resealed` is optional in the type so a counter object recorded by an older build still renders its original line.
- `scan` reads a multi-frame zstd log through the same reader the plugin ships.
- A directory scan keeps one row per file.
- `--since` reports what it dropped as `before_since` instead of hiding it.
- An undecompressable file is a failure line and a non-zero exit instead of a zero report.
- A redaction matches a home path escaped with one or two backslashes as well as a session directory that encodes it.
- The scan counts every `turn/end` (completed, `max_tokens`, aborted, error) and names every `reason.error.code`, instead of reporting only the `MALFORMED_RESPONSE` turns.
- The census is reported and never promoted into a finding, so the exit code still turns on `fused_calls` and `fusion_failures`.
- Maintainer copy channel: the build-side channel moves a request longer than a Windows command line onto stdin, reads its answer from the final `result` event, and names every spawn failure by its cause instead of printing a null status; it touches no seam and no outward wording.

## What it does not do

| Limit | Description |
|---|---|
| Attribution | Stops at assembled text; cannot prove whether relay or adapter glued objects |
| Headless attempts | Headless profile does not persist `assistant/attempt` streams; `session.fused_calls` in live artifact is 0 |
| Synthetic ids | Traceability aids, not durable identities across sessions |
| Localization | Message fallback parses English `Received arguments:`; localized host messages disable fallback |
| Truncation | A `max-tokens` truncation is not repaired; cut tails are missing bytes rather than missing quotes |
| Turn completion | Desktop turn was stopped by operator after answer (`turn_end=aborted`), not claimed as completed |
| Verification scope | Verification applies to recorded tarball sha256, not unverified running desktop caches |
| Verdict vocabulary | Verdict words cannot express "observed and correctly refused"; bad JSON reads `quiet` |
| Journal logs | Existing journal lines are not migrated; `status --json` reports shape of the last line |
| Custom adapters | Adapters that close blocks themselves and keep their own index bookkeeping are unmeasured |
| Retries | `retryOnMalformed` defaults to 0 and is a stop-gap, not a replacement for root-cause repair |
| Sample window | Measured sample reflects one machine and account over a fixed cutoff |

## Verify it yourself

```bash
# Run test suite, types, and governance gates
pnpm run verify

# Verify negative controls on all gates
node scripts/gate.mjs --mutate

# Verify packaged fixtures from an installed copy
dsh-remedy verify

# Inspect recorded live verification evidence
cat data/results/live-2026-11-10T14-45-00.000Z.json
```

## Status

P-0001, P-0002 and P-0003 are all `verified` on a real host:
- P-0001 on the headless profile and the desktop app.
- P-0002 on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched.
- P-0003 on a 2026-11-10 headless run whose journal wrote a non-zero `refused` after the code declined to repair a budget refusal.

P-0005, P-0004, P-0006, P-0007, P-0008, P-0009 and P-0010 are `tested`, not `verified`: each has unit tests and negative controls, and a measured fixture or a measured scan where one exists, but no live host run has produced the bare-value shape that P-0005 repairs; P-0004, P-0006 and P-0009 change an offline reader rather than the resident seam; P-0007 changes the build-side copy channel; P-0008 adds a build-side gate; and P-0010 changes the CLI usage text and the packaged README.

`0.3.6` is published and is `latest` for both `dsh-remedy` and `dsh-remedy-core`. `0.3.5` is the previous release and `0.3.4` the one before it.

Package sizes and payloads:
- Published 0.3.6 plugin tarball: 29445 bytes compressed, 29 files, 97807 bytes unpacked (67997 bytes of `dist/*.js`, 20951 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `fe85d15a5e97e9956a8a899d993ec1122f0c8774`.
- Published 0.3.6 core tarball: 19247 bytes compressed, 19 files, 63408 bytes unpacked (43117 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `76777609f4e3928af5ed591c01edb7ee1c2323f0`.
- Published 0.3.5 tarballs remain 29448 bytes compressed, 29 files, 97944 bytes unpacked (shasum `c1b1b43185ea49347c394c987dd878c717d8f4f5`) and 18723 bytes compressed, 19 files, 61553 bytes unpacked (shasum `cc9895f826b56e9e7a5a1af2ed0886cb43514531`); tarball sizes for 0.3.4 are unrecorded in FACTS.
- Published 0.3.3 plugin tarball: 28378 bytes compressed, 29 files, 94769 bytes unpacked (65521 bytes of `dist/*.js`, 20389 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `46ad57ea718be732133979c4b0449f7221ee69c7`.
- Published 0.3.3 core tarball: 16776 bytes compressed, 19 files, 55684 bytes unpacked (35393 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `6fbbeb060505cb80c7f454dbab5ea74acd463fdd`.
- Sourcemaps are no longer shipped, removing 41926 bytes of unpacked payload.
- Byte budget: `dist/*.js` reached 55815 bytes after P-0005, split in 0.3.2 cutting `repair-stream.js` to 27925 bytes while total reached 56344, rose to 64539 and 65521 in P-0004, and settled at 67908 bytes under P-0006 after an overshoot of 70389 bytes. Working ceilings are 28000 bytes for emitted `repair-stream.js`, 14000 for `session-scan.js`, 10000 for `cli.js`, and 68000 bytes for the plugin total. P-0008 turned that ceiling into a gate on the total, `repair-stream.js`, `session-scan.js` and `cli.js`. P-0009 landed at 67997 of 68000, so the emitted plugin now sits three bytes under the ceiling.

## Development

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

## Contributing

- Issues and pull requests are welcome.
- A behavior change needs a failing test first.
- `pnpm run verify` must pass; `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository (enabled 2026-11-09).

## License

MIT. Independent project; not affiliated with DeepSeek.
