# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](package.json)
[![status: verified](https://img.shields.io/badge/status-verified-brightgreen.svg)](data/results)

[中文说明](README.zh-CN.md)

A resident repair layer for DeepSeek Harness that fixes one measured defect and refuses to hide the rest. It repairs tool-call fusion on the `llm/stream` seam without modifying `app.asar` or swallowing upstream failures.

## What it fixes

The relay can stream two tool calls into one index. `@earendil-works/pi-ai` receives glued JSON objects and throws an error, which `dsh-llm-pi-ai` converts to `MALFORMED_RESPONSE`. Because `MALFORMED_RESPONSE` is not in default `retryableCodes`, `dsh-agent-loop` re-throws and the turn ends.

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"path":"README.md"}{"path":"CHANGELOG.md"}
```

In a measured sample of 48 session files and 120 `turn/end` events, 40 `MALFORMED_RESPONSE` failures occurred. 37 are provable fusions of two JSON objects glued at the top level, 2 are cut inside an object, and 1 is another split failure. Upstream discussion deepseek-ai/deepseek-harness discussion #4427 describes the same fusion family.

## Install

```bash
dsh plugin --profile <name> add dsh-remedy@0.3.2
```

```bash
pnpm add dsh-remedy@0.3.2 dsh-remedy-core@0.3.2
```

Release 0.3.0 of the plugin cannot be installed from the registry because npm published its raw workspace manifest with a literal `workspace:*` dependency. Release 0.3.2 repairs that manifest by publishing a pnpm-packed tarball. Release 0.3.1 was built with the same manifest fix but was superseded by 0.3.2 before it ever reached the registry, so 0.3.2 also carries the P-0005 reseal.

For contributors developing from source:

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## How it works

The plugin buffers tool-call deltas on the `llm/stream` Cordis waterfall. On a terminal `finish` with `MALFORMED_RESPONSE`, it splits every open buffer at top-level object boundaries.

```
Input stream:
  delta:       '{"path":"README.md"}{"path":"CHANGELOG.md"}'
  finish:      kind="error", code="MALFORMED_RESPONSE"

Repaired stream:
  block-end:   arguments='{"path":"README.md"}'
  block-start: id="<id>#remedy-1"
  block-end:   arguments='{"path":"CHANGELOG.md"}'
  finish:      kind="stop"
```

The repair follows an all-or-nothing rule: if any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.

## Safety guarantees

- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.
- A `max-tokens` truncation is never repaired.
- The plugin writes nothing unless `journalPath` is configured.
- `retryOnMalformed` defaults to 0.
- An empty tool name is rejected (`missing-name`).
- A tool name that changes inside one index aborts the rescue (`name-changed`).
- A repaired `finish` preserves the adapter `replayState`.
- A `block-end` repair is held until the tool-call phase ends; a later rejection in the same stream withdraws the repair (`rolled-back`) and original chunks go out.
- Per-stream `maxCalls` bounds the calls synthesized for the whole stream, not per block.
- A stream whose consumer stops early is recorded as abandoned (`consumer-abort`), not as quiet.
- A synthesized call opens its own `block-start` before `block-end`.
- A withdrawn repair returns its calls to the stream `maxCalls` budget.
- A `max-tokens` stream is counted as truncated, never as an unrepaired fusion.
- A passed-through provider error is counted in `errors`.
- A pure refusal raises `refused` and never `fused`.
- A budget refusal (`too-many-calls`) also raises `unrepaired` so a refused-but-unrepaired stream never reads `repaired`.
- An abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`.
- A truncation raises `withdrawn` and never `fused`.
- The four verdict words are unchanged (`unmeasured`, `quiet`, `degraded`, `repaired`) and only the counter line grew to eight names.
- A bare member value is quoted only when exactly one segment reproduces the whole text as one plain object with a byte-identical payload.
- The resealed call keeps its own id and name.
- The reseal synthesizes nothing and does not consume the stream-wide `maxCalls` budget.
- Zero or two-or-more candidates are refused instead of guessed (`bare-value-unproven` and `ambiguous-bare-value`).
- A stream whose only defect was a reseal reads `repaired` and never `quiet`.
- The ninth counter `resealed` is optional in the type so a counter object recorded by an older build still renders its original line.

## What it does not do

| Limit | Description |
|---|---|
| Attribution | Stops at assembled text; cannot prove whether relay or adapter glued objects. |
| Headless session storage | Headless profile does not persist `assistant/attempt` streams, so `session.fused_calls` is 0; journal counters and synthetic ids carry proof. |
| Synthetic identities | Synthetic ids are traceability aids, not durable identities. |
| Message localization | Message fallback parses English `Received arguments:`; localized host message disables fallback, though delta buffers still work. |
| Truncation repair | A `max-tokens` truncation is not repaired. |
| Turn completion | Operator stopped desktop run; artifact records `turn_end=aborted` instead of claiming completion. |
| Verification scope | Verification applies to recorded tarball sha256, not cached desktop code. |
| Verdict granularity | Verdict word cannot express observed and correctly refused; only counter line can, so bad JSON alone reads `quiet`. |
| Journal migration | Existing journal lines are not migrated; in a mixed journal `status --json` reports shape of last line. |
| Custom adapter bookkeeping | Adapter closing blocks itself with independent bookkeeping is unmeasured (`BS-11`). |
| Request error retries | Retry fallback on `agent/request-error` defaults to 0 and is a stop-gap; host already retries server-error family (84 of 93 failing groups were followed by a successful attempt in the same turn). |
| Sample scope | Sample behind the 0.3.0 numbers reflects one machine and one account over a fixed cutoff. |
| Out of scope | Does not modify `app.asar`, add a plugin market, provide a launcher, or pick packages for the user. |

## Verify it yourself

```bash
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy verify
```

Evidence artifacts and sidecars:
- Repaired live run: `data/results/live-2026-11-10T14-45-00.000Z.json`
- Refusal live run: `data/results/live-2026-11-10T16-30-00.000Z.json`
- Desktop profile run: `data/results/live-desktop-2026-11-09T19-10-00.000Z.json`

## Status

Release 0.3.2 is the installable release of both packages (`dsh-remedy` and `dsh-remedy-core`), and 0.3.0 of the plugin is a broken release that the registry cannot install.

- P-0001 is `verified` on the headless profile and the desktop app.
- P-0002 is `verified` on a 2026-11-10 headless run that repaired a real two-call fusion and saw the synthesized call dispatched.
- P-0003 is `verified` on a 2026-11-10 headless run whose journal wrote a non-zero `refused` after the code declined to repair a budget refusal.
- P-0005 is `tested`, not `verified`: it has unit tests, negative controls, and a measured fixture, but no live host run has produced the bare-value shape yet.

The shipped 0.3.2 plugin tarball is 24689 bytes compressed (25 entries, 81904 bytes unpacked: 56344 bytes of `dist/*.js`, 16701 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, and 5276 bytes of package-root files). The 0.3.2 core tarball is 15864 bytes compressed (19 entries, 52828 bytes unpacked: 32537 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`). Sourcemaps are no longer shipped, removing 41926 bytes of unpacked payload. P-0005 crossed the 53000 byte ceiling for `dist/*.js` (reaching 55815 bytes), which is why 0.3.2 splits the seam into `stream-types.ts` and `failure-text.ts`, cutting `repair-stream.js` from 28955 to 27925 bytes while total `dist/*.js` is 56344 bytes due to import and export scaffolding. The working ceiling is restated as 58000 bytes for `dist/*.js` and 28000 bytes for emitted `repair-stream.js`.

## Development

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

## Contributing

Issues and pull requests are welcome.
- A behavior change needs a failing test first.
- `pnpm run verify` must pass; `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.

## Security

Security reports should use GitHub private vulnerability reporting on the public repository (enabled 2026-11-09).

## License

MIT. Not affiliated with DeepSeek.
