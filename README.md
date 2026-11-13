# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-blue.svg)](#status)

[中文说明](README.zh-CN.md)

dsh-remedy is a patch set for DeepSeek Harness (DSH) — twenty-six defects, each registered with the seam it touches, the symptom it removes, the mechanism that was measured, and the limits it does not cross. Two of those seams are resident (`llm/stream` and `agent/request-error`); the rest are the CLI, the build side, and one seam that has been measured but deliberately not mounted.

## What it fixes

When an upstream provider relay packs two tool calls into one index, `@earendil-works/pi-ai` receives `{...}{...}` and throws. `dsh-llm-pi-ai` converts this into `LlmError(..., 'MALFORMED_RESPONSE')`, and `dsh-agent-loop` aborts the turn because `MALFORMED_RESPONSE` is not in `retryableCodes`. Upstream discussion deepseek-ai/deepseek-harness #4427 describes the same failure family.

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {...}{...}
```

Measured over this machine's session directory: 78 session files, 393 attempts, 38 fused calls, 44 `MALFORMED_RESPONSE` failures of which 39 are repairable, and 0 unreadable lines.

The turn census of the same directory counted 293 turns: 94 completed, 88 `max_tokens`, 100 error and 11 aborted. The error codes it named are `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1 and `INVALID_REQUEST` 1.

Two of those classes needed different treatment, and both are now visible:

- `MALFORMED_RESPONSE` is a fusion, so it is repaired when the split can be proven.
- `UNSUPPORTED_REASONING_EFFORT` is a deterministic refusal: a profile asked for a level the adapter does not offer (`provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"`). Retrying it spends a request to learn the same answer twice, so the plugin names it once and refuses to touch it.

## The patch set, by seam

The registry is the single source: `packages/core/src/registry.ts` for the claims, `dsh-remedy status` to print it, and `dsh-remedy explain` to answer which of them cover a failure class your machine actually hits.

| seam | patches | what each one settles |
|---|---|---|
| `llm/stream` (resident) | P-0001, P-0002, P-0003, P-0005 | split a proven fusion; a rescue must be provable, attributable and atomic; a refusal must be observable; reseal a bare member value or refuse it |
| `agent/request-error` (resident) | P-0011, P-0013 | the contract for who owns the decision, with a bounded retry budget; name the deterministic refusals instead of retrying them |
| CLI | P-0004, P-0006, P-0009, P-0010, P-0016, P-0025 | scan fidelity and redaction shapes; the turn census; a session header is dated by `createdAt`; the usage text must match the binary; coverage is declared by the patch, not restated by the command; an unread profile is not a finding |
| build side | P-0007, P-0008, P-0012, P-0014, P-0017, P-0018, P-0019, P-0020, P-0021, P-0022, P-0023, P-0024, P-0026 | a copy channel that can name its failures; a byte budget a script checks; one cap per load path; the project's own description must be true; the two npm pages; a Windows exit code is not a registry answer; the outward pages described a project that had stopped existing; a listing that pins git bytes while advertising a registry version; an export that named a module that never existed; a drift test that repaired the drift; a doc rule no gate read; the two package pages finally inside the copy channel; the release procedure had two homes |
| measured, not mounted | P-0015 | what a rejected `agent/pre-step` decision does, so a later patch can use that seam on measured ground |

Three patches are `verified`: a real host ran them and left a `data/results/live-*` artifact. The other twenty-three are `tested`: unit tests, a negative control and a measured fixture, scan or corpus, but nothing a resident journal can witness. The status section below names which is which.

## Install

Install the plugin into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Install as a project dependency:

```bash
pnpm add dsh-remedy dsh-remedy-core
```

Version 0.3.0 of the plugin cannot be installed from the registry, because npm published its raw workspace manifest with a literal `workspace:*` dependency. Every release after it ships a pnpm-packed tarball instead. Version 0.3.1 carried the same manifest fix but was superseded before it reached the registry.

Source workflow for contributors:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

dsh-remedy buffers incoming tool-call deltas on the `llm/stream` Cordis seam:

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

The repair is all-or-nothing. Every open buffer must parse into top-level JSON objects. If all of them are proven, each call gets its own `block-start` and `block-end` and the error finish becomes `{kind:'stop'}`. If any buffer cannot be proven, nothing is emitted and the original failure goes out untouched.

A second listener runs on `agent/request-error`, which the loop calls after a failed attempt:

```text
no code, empty code, or an aborted signal  → next()
UNSUPPORTED_REASONING_EFFORT,              → name it once per step and code, then next()
INVALID_REQUEST, MISSING_CREDENTIAL,
EMPTY_RESPONSE
IMAGE_OFFLOAD_REQUIRED, INVALID_CREDENTIAL → next()
MALFORMED_RESPONSE with budget left        → { kind: 'retry' }
anything else, or budget spent              → next()
```

That order follows the contract the runtime documents: a handling listener returns `{ kind: 'retry' }` **without** calling `next()`, and a listener that does not own the decision must return `next()`. Calling `next()` first and then overriding its answer would discard what the default chain decided, and context compaction authorizes its own retry on exactly that path.

Retry is off by default (`retryOnMalformed: 0`). The budget is a bounded cache of 256 entries per process, which is far more than one turn needs and small enough that a long-lived desktop session cannot grow it.

## Ask it what is happening

`dsh-remedy explain` reads the registry, an optional profile layer and an optional session directory, and prints one row per failure class: how often this machine hit it, which patch covers it, and whether that patch is switched on in the profile you named.

```bash
dsh-remedy explain --sessions ~/.dsh/sessions --profile-file ~/.dsh/profiles/<name>/cordis.patch.yml
```

```text
failure class                turns  covered by          enabled here
---------------------------  -----  -------------------  -------------------
completed                      124  (none)               (none)
max-tokens                      88  by design            no (by design)
MALFORMED_RESPONSE              47  P-0001…P-0005,P-0011 P-0001…P-0005
UNSUPPORTED_REASONING_EFFORT    37  P-0013               P-0013
SERVER                          16  by design            no (by design)
MISSING_CREDENTIAL               1  P-0013               P-0013
```

Without `--sessions` it prints no counts rather than a row of zeros, and without `--profile-file` it says the answer is unknown rather than assuming the default. A class this machine hits, that a patch covers, but that your profile switched off, makes it exit 1.

## Safety guarantees

- Top-level JSON objects are split strictly at depth zero; `}{` inside a JSON string is not a boundary.
- The first split call keeps its original id; synthetic calls receive `<id>#remedy-N`.
- If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A single object that fails to parse is rejected, never split.
- The plugin mounts only its own rows, adding no route, no tool and no UI.
- The plugin writes nothing to disk unless `journalPath` is configured.
- `retryOnMalformed` defaults to 0 because retry is a stop-gap, not the fix.
- An empty tool name is rejected (`missing-name`) and never dispatched.
- A tool name that changes inside one index aborts the rescue (`name-changed`) and the original failure is re-thrown.
- Adapter `replayState` is preserved across a repaired finish.
- A `block-end` repair is held until the tool-call phase ends; a later rejection in the same stream withdraws it (`rolled-back`) and the original chunks go out.
- `maxCalls` bounds the calls synthesized for the whole stream, not per block.
- A consumer that stops early is recorded as `consumer-abort`, never as quiet.
- A synthesized call is emitted as a `block-start` plus a `block-end`, never a bare `block-end`.
- A withdrawn repair returns its calls to the stream `maxCalls` budget.
- A `max-tokens` stream is counted as truncated, never as an unrepaired fusion.
- A provider error that passes through is counted in `errors`.
- A pure refusal raises `refused` and never `fused`.
- A budget refusal (`too-many-calls`) raises `fused`, `refused` and `unrepaired`, because no repair happened.
- The four verdict words are unchanged (`unmeasured`, `quiet`, `degraded`, `repaired`), evaluated in that order; only the counter line grew, to eight names plus the optional `resealed`.
- A bare member value is quoted only when exactly one segment reproduces the whole text as one plain object with a byte-identical payload.
- Zero candidates is refused as `bare-value-unproven`; two or more is refused as `ambiguous-bare-value` instead of guessed.
- A stream whose only defect was a reseal reads `repaired`, never `quiet`.
- The retry listener names a diagnosis exactly once per step and code, so a host-level retry of the same failure cannot fill the journal with the same sentence.
- A cancellation is never overridden by a retry.
- Control codes (`IMAGE_OFFLOAD_REQUIRED`, `INVALID_CREDENTIAL`, `MISSING_CREDENTIAL`) are passed through and never retried.
- `scan` reads a multi-frame zstd log through `decompressSessionLog`, the same reader the plugin ships.
- A directory scan keeps one auditable row per file.
- `--since` reports what it dropped as `before_since` instead of hiding it.
- An undecompressable file is a failure line and exit 3, never a silent zero.
- Redaction matches a home path escaped with one or two backslashes as well as the session directory that encodes it.
- The scan counts every `turn/end` (completed, `max_tokens`, aborted, error) and names every `reason.error.code`.
- The census is reported and never promoted into a finding, so the exit code still turns on `fused_calls` and `fusion_failures` alone.
- The byte budget is a gate, not a paragraph: it measures the modules a mounted plugin loads (residency), the modules only a command loads, and the total, and every emitted module must belong to exactly one of the first two.

## What it does not do

| Limit | Reality |
|---|---|
| Attribution | Stops at the assembled text: the plugin cannot prove whether the relay or the adapter glued the objects. |
| Truncation | A `max-tokens` cut is missing bytes and is not repaired. |
| Localized messages | The fallback parses the English `Received arguments:` text; a localized host message disables that fallback, though delta buffering still works. |
| Headless session files | A headless profile does not persist `assistant/attempt` streams, so the artifact reports 0 fused calls; the journal counters and the synthetic id carry the proof. |
| Synthetic IDs | `<id>#remedy-N` are traceability aids, not durable identities. |
| Desktop completion | The desktop artifact records `turn_end=aborted` because the operator stopped after the answer. |
| App cache | Verification applies to the recorded tarball's sha256, not to whatever a running app has cached. |
| Verdict granularity | One verdict word cannot express "observed and correctly refused"; only the counter line can. |
| Journal migration | Existing journal lines are not migrated; in a mixed journal `status --json` reports the shape of the last line. |
| Custom index tracking | An adapter that closes blocks itself and keeps its own index bookkeeping is still unmeasured (`BS-11`). |
| Request retries | Off by default. `SERVER`, `TRANSPORT` and `TIMEOUT` are already retried upstream, so this plugin only retries `MALFORMED_RESPONSE`, and only inside a budget you set. |
| Reasoning effort | The plugin can tell you a configured effort will be refused, but it never changes it for you. `agent/pre-step` is **not** mounted, and that is now a measured decision: P-0015 records what a rejection does — the turn closes as `blocked` with no step opened, the claimed input is discarded, and the CLI exits `1` — so a patch may use the seam, but it must rewrite the message with `{kind:'enter'}` rather than refuse. The desktop rendering of `blocked` is still unmeasured (`BS-17`). |
| Mid-stream withdrawal | Measured unreachable on this host: none of the persisted attempt streams carried a provable fusion inside a `block-end`, which is what `rolled-back` requires (`BS-14`). |

## Verify it yourself

```bash
dsh-remedy verify
dsh-remedy scan ~/.dsh/sessions --json
dsh-remedy explain --sessions ~/.dsh/sessions
pnpm run verify
node scripts/gate.mjs --mutate
```

Every artifact in `data/results/` is script-produced and has a `.sha256` sidecar. Two are worth opening first: the live run `data/results/live-2026-11-12T12-20-00.000Z.json` and the corpus replay `data/results/malformed-replay-2026-11-12T11-30-00.000Z.json`.

The whole `MALFORMED_RESPONSE` corpus on one machine was replayed through the built engine: 47 turns, 39 repaired, 8 refused, and no repaired case dispatched a call whose arguments failed to parse. A generated stress pass of 300000 argument texts asserts the same invariant with a recorded seed.

## Status

Three patches are `verified` on a real host: P-0001 on a headless profile and on the desktop app, P-0002 on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched, and P-0003 on a 2026-11-10 headless run whose journal wrote a non-zero `refused` after the code declined to repair a budget refusal.

The other twenty-three are `tested`, not `verified`. Each carries unit tests, a negative control and a measured artifact where one exists: P-0004, P-0006 and P-0009 change an offline reader; P-0005 has no live bare-value shape yet; P-0007, P-0008, P-0012, P-0014, P-0017, P-0018, P-0019, P-0020, P-0024 and P-0026 are build-side; P-0010, P-0016 and P-0025 change text a command prints; P-0011 and P-0013 sit on a seam a live journal witnesses only when a turn fails in a class this plugin retries, which the default budget of 0 never triggers; and P-0015 is a measurement on an isolated profile rather than a mount.
Release status: `0.4.3` is published and is the registry `latest` for both `dsh-remedy` and `dsh-remedy-core`; it carries the same twenty-six patches as `0.4.2` and is the first release measured on **DSH 0.2.2-rc.3**. A cold directory installed 0.4.3 from the registry and `dsh-remedy verify` printed `OK 6 fixture(s)`. The previous release is `0.4.2` with twenty-six patches, `0.4.1` with twenty-three, `0.4.0` with twenty, and `0.3.8` before that with thirteen.

Package sizes:

- 0.4.1 plugin: 36906 bytes compressed, 35 files, 119744 bytes unpacked, shasum `dac640ea140aadf9249685ebcc98964db8a3adbf`.
- 0.4.1 core: 33091 bytes compressed, 21 files, 105353 bytes unpacked, shasum `c9a081bf4e5f8c7ae82973e2a56d0bd93244e727`.
- 0.4.0 plugin: 36928 bytes compressed, 35 files, 119866 bytes unpacked, shasum `dd3b764dd57d09d4cf85e312867da23360a4e06f`.
- 0.4.0 core: 31773 bytes compressed, 21 files, 100304 bytes unpacked, shasum `48d449b75bb7fa06f4bc16181433e617d2ca5a66`.
- 0.3.8 plugin: 35898 bytes compressed, 35 files, 117750 bytes unpacked, shasum `3bc47df12f21fe7d68336f595d397ff868b3d4d7`; core: 26551 bytes compressed, 21 files, 83461 bytes unpacked, shasum `0df993f85589e101b15b830fa105e7ef8c66c5d5`.
- No sourcemaps are shipped; that removal is worth 41926 bytes of unpacked payload.

The emitted plugin budget is three checks: residency 41143 of 44000 bytes (the modules a mounted plugin loads), cli 40845 of 42000 bytes (the modules only a command loads), and a total of 81988 of 83000 bytes. Per-file caps: `repair-stream.js` 28000, `session-scan.js` 14000, `cli.js` 12000. A patch that crosses a per-file number splits that file instead of absorbing it. These three are measured on the working tree and the 0.4.1 tarball ships 81988 of those bytes, so a reader checking the published package sees the same figure.

## Development

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

Six gates run on every change: `ssot`, `registry`, `namespace`, `step-review`, `copy`, `size`. `--mutate` breaks each one on purpose and requires every one to go red; it currently catches 6 of 6. The suite is 255 tests and 0 failing.

## Contributing

- Issues and pull requests are welcome.
- A behaviour change needs a failing test first.
- `pnpm run verify` must pass, and `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.
- Outward text is checked, not authored freely: every number in it must exist in `docs/copy/facts/public-repo-facts.md`, and the bytes must match `docs/copy/manifest.json`.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository: https://github.com/jjjjjjjjnnjnn/dsh-remedy/security/policy

## License

MIT. Independent project; not affiliated with DeepSeek.
