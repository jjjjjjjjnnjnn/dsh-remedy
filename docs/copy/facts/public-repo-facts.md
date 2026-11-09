# Public repo facts — dsh-remedy

> This file is the ONLY source of numbers and claims for externally visible text.
> A copy artifact may not contain a number that is absent here.

## Identity

- Name: dsh-remedy
- Tagline (internal, not final copy): a resident repair layer for DeepSeek Harness.
- Package names: `dsh-remedy` (plugin), `@dsh-remedy/core` (engine).
- Version: 0.1.0
- License: MIT
- Intended repository URL: https://github.com/jjjjjjjjnnjnn/dsh-remedy (not created yet; badges may point here)
- npm: `dsh-remedy` (not published yet)
- Independent project; not affiliated with DeepSeek.
- Language of code and CLI: English. Chinese README is a translation.

## Compatibility

- Node: >= 22.19
- DeepSeek Harness: >= 0.2.0-rc.1 < 0.3.0-0
- Package manager: pnpm 12.15.0 in development.
- Verified on: DSH 0.2.2-rc.1, Windows, provider route `opendesign` / model `deepseek-v4.1-flash-eco`.

## The defect (P-0001)

- Symptom text: `Tool call "<name>": Unexpected non-whitespace character after JSON at position N` followed by `Received arguments:` and two JSON objects glued together.
- Mechanism: the relay can stream two tool calls into one index; `@earendil-works/pi-ai` `parseToolCallArguments` receives `{...}{...}`, throws; `dsh-llm-pi-ai` converts it to `LlmError(..., 'MALFORMED_RESPONSE')`; `dsh-agent-loop` re-throws because `MALFORMED_RESPONSE` is not in the default `retryableCodes`; the turn ends.
- Measured sample: 27 sessions, 79 `turn/end` events, 37 fusion failures (about 47 percent).
- Sample window: 2026-11-08T10:47Z to 2026-11-09T15:58Z.
- Tools in the sample: `ops_bash` 11, `read_page` 8, `ops_inspect_local_file` 4, `ops_read_files` 3, `list_agents` 3, `send_message` 3, `web_search` 2, `edit` 1, `ops_grep` 1, `spawn_teammate` 1.
- Counter-evidence: one successful attempt carried two distinct ids, so the defect is intermittent, not universal.
- Upstream: deepseek-ai/deepseek-harness discussion #4427 describes the same fusion family.

## The repair

- Seam: the `llm/stream` Cordis waterfall.
- Behavior: buffer tool-call deltas; on a terminal `finish{kind:'error'}` with `MALFORMED_RESPONSE` (or a thrown error with the same signature), split every open buffer at top-level object boundaries; emit one `block-end` per proven object; the first call keeps its id, the rest get `<id>#remedy-N`; replace the error finish with `{kind:'stop'}`.
- If any buffer cannot be proven, nothing is emitted and the original failure is re-thrown.
- A `block-end` that already carries fused arguments is repaired the same way.
- `retryOnMalformed` defaults to 0: retry is a stop-gap, not the fix.
- The plugin mounts one row (`remedy-stream`), adds no route, no tool, no UI.
- The plugin writes nothing unless `journalPath` is configured.
- A `max-tokens` truncation is never repaired.
- A single object that fails to parse is rejected, not split.
- `}{` inside a JSON string is not a boundary.
- The first call keeps the original id; synthetic ids are `<id>#remedy-N`.

## Live verification

- Profile: `remedy-live`, a headless DSH profile; the desktop provider block was copied into it.
- Install method: `dsh plugin --profile remedy-live add <tarball>`.
- Runs: 2.
- Streams observed: 10.
- Fused calls: 1.
- Repaired: 1.
- Rejected or unrepaired: 0.
- Truncated: 0.
- Other stream errors: 0.
- Turn outcome: `completed`.
- Tool calls: 5. Tool results: 5.
- Synthetic id observed in the session: `call_00_82805lrla1dhndlzpv1cakrx#remedy-1`.
- Evidence file: `data/results/live-2026-11-09T17-00-00.000Z.json`.
- First mount failed with `stream is not async iterable`: `llm/stream` is a synchronous waterfall and an `async` listener returns a Promise. Fixed; pinned by a unit test.

## Tests and gates

- Tests: 95 pass, 0 fail.
- Gates: 5 (`ssot`, `registry`, `namespace`, `step-review`, `copy`).
- Negative controls (`--mutate`): 5 of 5 caught.
- Fixtures: 5, including one real fused call and one counter-evidence call.
- Test command: `pnpm run verify` (build, typecheck, test, gate).
- Negative-control command: `node scripts/gate.mjs --mutate`.
- Copy gate: every externally visible file must match the recorded manifest hash and the current fact pack.

## Install and use

- Install into a DSH profile: `dsh plugin --profile <name> add dsh-remedy`.
- Embed as a library: `pnpm add dsh-remedy @dsh-remedy/core`.
- CLI commands: `dsh-remedy status`, `dsh-remedy repair [file]`, `dsh-remedy scan <session.jsonl>`, `dsh-remedy verify`.
- CLI exit codes: 0 ok, 1 finding, 2 usage, 3 unavailable.
- Scan accepts a `.jsonl` session log; a `.jsonl.zstd` log is read by the library helper `decompressSessionLog`.
- The repair config keys: `repair` (default true), `retryOnMalformed` (default 0), `maxCalls` (default 8), `journalPath` (unset), `log` (default true).

## Limits (public wording may use these)

- Attribution stops at the assembled text: the plugin cannot prove whether the relay or the adapter glued the objects.
- The headless profile does not persist `assistant/attempt` streams, so `session.fused_calls` in the live artifact is 0; the journal counters and the synthetic id carry the proof.
- Synthetic ids are traceability aids, not durable identities.
- The message fallback parses the English `Received arguments:` text; a localized host message disables that fallback, but the delta buffer path still works.
- A `max-tokens` truncation is not repaired.
- The desktop app was not restarted; the live run used a separate headless profile.
- Verification applies to the recorded tarball sha256, not to whatever a running desktop app has cached.

## Repository layout

- `packages/core` — pure engine: splitter, repair decision, registry, redaction, verdict.
- `packages/plugin` — DSH loader, `llm/stream` wrapper, CLI, session scanner, zstd log reader.
- `scripts/` — gates and recorders, Node built-ins only.
- `tests/` — unit, governance, e2e.
- `data/fixtures` — real fused text, counter-evidence, negative controls.
- `data/results` — script-produced evidence with sha256 sidecars.
- `audit/` — gate ledger, patch ledger, step reviews, blind spots, AI disclosure.
- `docs/` — handoff, patch record, ADR, copy channel.

## Contributing facts

- Issues and pull requests are welcome.
- A behavior change needs a failing test first.
- `pnpm run verify` must pass; `node scripts/gate.mjs --mutate` must catch every gate.
- Gates use Node built-ins only; a new gate must be registered in `audit/gate_ledger.json`.
- No new runtime dependency in `@dsh-remedy/core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.
- Security reports should use GitHub private vulnerability reporting (the repository is not created yet).

## Numbers allowed in copy

0 1 2 3 4 5 6 7 8 9 10 11 19 22 27 37 47 79 86 95 4427 0.1.0 0.2.0 0.3.0
