# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions) [![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](package.json) [![status: verified](https://img.shields.io/badge/status-verified-brightgreen)](data/results/)

[简体中文](README.zh-CN.md)

dsh-remedy is a resident repair layer for DeepSeek Harness (DSH). When an upstream relay concatenates multiple tool calls into a single stream index, DSH aborts the turn with an unrecoverable MALFORMED_RESPONSE error. dsh-remedy hooks into the llm/stream Cordis seam, splits proven top-level JSON objects, and re-emits them as distinct calls before the agent loop fails. If any chunk cannot be proven, the plugin leaves the stream untouched and re-throws the original failure.

## What it fixes

During tool streaming, upstream relays can stream multiple tool calls into one index. Upstream argument parsing receives concatenated JSON objects, throws, and triggers a fatal MALFORMED_RESPONSE turn crash. This failure family is tracked in deepseek-ai/deepseek-harness discussion #4427.

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"command":"pwd"}{"command":"ls"}
```

In a measured sample of 48 session files containing 120 turn/end events, 40 ended in MALFORMED_RESPONSE failures. Of those 40 failures, 37 are provable fusions of two top-level JSON objects, 2 are cut inside an object, and 1 is another split failure.

## Install

Install the plugin into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-remedy
```

Install as library dependencies:

```bash
pnpm add dsh-remedy dsh-remedy-core
```

For contributors working from source:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

The plugin wraps the llm/stream waterfall. It buffers tool-call deltas and catches terminal error finishes or exceptions:

```
Raw stream:      block-start(id="call_0") -> delta('{"cmd":"pwd"}{"cmd":"ls"}') -> finish(error: MALFORMED_RESPONSE)
Repaired output: block-start(id="call_0") -> delta('{"cmd":"pwd"}') -> block-end
                 block-start(id="call_0#remedy-1") -> delta('{"cmd":"ls"}') -> block-end
                 finish(kind: 'stop')
```

The repair follows an all-or-nothing rule. Every open buffer must split cleanly into complete, parseable JSON objects. If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.

## Safety guarantees

- Writes nothing to disk unless journalPath is configured.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.
- A max-tokens truncation is never repaired and is counted as truncated.
- A call whose tool name never arrived is rejected, never dispatched to an empty name.
- A tool name that changes inside one index aborts the rescue and the original failure is re-thrown.
- A repaired finish keeps the adapter replayState.
- A block-end repair is held until the tool-call phase ends; an invalid subsequent block rolls back the repair.
- A synthesized call opens its own block-start before block-end.
- maxCalls bounds calls synthesized for the whole stream, not per block.
- A withdrawn repair returns its calls to the stream maxCalls budget.
- An early consumer exit is recorded as consumer-abort and raises withdrawn.
- A passed-through provider error is counted in errors.
- A pure refusal raises refused and never fused.
- A budget refusal also raises unrepaired so a refused-but-unrepaired stream never reads repaired.
- An abandoned stream keeps fused and unrepaired and also raises withdrawn.
- The four verdict words (unmeasured, quiet, degraded, repaired) are unchanged and only the counter line grew to eight names.

## What it does not do

| Limit | Detail |
|---|---|
| Attribution | Stops at assembled text; cannot prove whether the relay or adapter glued objects. |
| Headless streams | The headless profile does not persist assistant attempt streams; journal counters carry the proof. |
| Identity persistence | Synthetic ids are traceability aids, not durable identities. |
| Host localization | Message fallback parses English `Received arguments:`; localized messages disable fallback while deltas still work. |
| Truncation | A max-tokens truncation is not repaired. |
| Desktop abort | The desktop turn was stopped by the operator after the task answer; recorded as turn_end=aborted. |
| Host cache | Verification applies to recorded tarball sha256 hashes, not running app memory cache. |
| Verdict precision | The verdict word cannot express observed and correctly refused; only the counter line can. |
| Journal migration | Existing journal lines are not migrated; status --json reports the shape of the last line. |
| Non-standard adapters | Adapters that close blocks themselves and keep custom index bookkeeping remain unmeasured (BS-11). |
| Retry strategy | Retrying agent/request-error defaults to 0; 84 of 93 failing groups were already retried upstream. |
| Sample scope | The 0.3.0 sample comes from one machine and account across a fixed cutoff window. |

## Verify it yourself

Run verification and gate mutation checks locally:

```bash
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy verify
```

Live host verification artifacts with matching sha256 sidecars are located at:
- `data/results/live-2026-11-10T14-45-00.000Z.json`
- `data/results/live-2026-11-10T16-30-00.000Z.json`

## Status

0.3.x is published to npm (`dsh-remedy` and `dsh-remedy-core`). P-0001, P-0002, and P-0003 are all verified on a real host: P-0001 on the headless profile and the desktop app, P-0002 on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched, and P-0003 on a 2026-11-10 headless run whose journal wrote a non-zero refused after the code declined to repair a budget refusal.

The shipped 0.3.0 tarball is 22418 bytes compressed (20 entries) and 74014 bytes unpacked. Unpacked contents include 52247 bytes of `dist/*.js`, 13797 bytes of `dist/*.d.ts`, 2694 bytes of `fixtures/`, and 5276 bytes of package-root files. Sourcemaps are no longer shipped, removing 41926 bytes of unpacked payload. The `dist/*.js` byte budget is 52247 bytes against a working ceiling of 53000 bytes.

## Development

Run development and diagnostic commands:

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy status
dsh-remedy repair [file]
dsh-remedy scan <session.jsonl>
dsh-remedy verify
```

## Contributing

Issues and pull requests are welcome. A behavior change needs a failing test first. `pnpm run verify` must pass and `node scripts/gate.mjs --mutate` must catch every gate. Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`. No new runtime dependencies may be added to `dsh-remedy-core`. A patch cannot claim verified without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository.

## License

MIT. Independent project; not affiliated with DeepSeek.
