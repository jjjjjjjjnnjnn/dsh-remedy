# Public repo facts — dsh-remedy

> This file is the ONLY source of numbers and claims for externally visible text.
> A copy artifact may not contain a number that is absent here.

## Identity

- Name: dsh-remedy
- Tagline (internal, not final copy): a resident repair layer for DeepSeek Harness.
- Package names: `dsh-remedy` (plugin), `dsh-remedy-core` (engine).
- Version: 0.3.5 (plugin), 0.3.5 (core). Both are published and both are `latest`.
- License: MIT
- Repository: https://github.com/jjjjjjjjnnjnn/dsh-remedy (public, created 2026-11-09)
- npm: `0.3.5` is published and is `latest` for both `dsh-remedy` and `dsh-remedy-core`; its packed manifest pins `"dsh-remedy-core": "0.3.5"`, so installing the plugin alone resolves the core; `0.3.4` becomes the previous release. `dsh-remedy@0.3.0` reached the registry with a literal `workspace:*` dependency because npm published the raw workspace manifest, so installing that version fails with `EUNSUPPORTEDPROTOCOL`; 0.3.2 republished the same code from a pnpm-packed tarball with the manifest fix. 0.3.1 was built with the same fix but never reached the registry. Publishing needs a fresh one-time password every time: the account is `auth-and-writes`, and a write without one is answered `EOTP`.
- The 0.3.3 publish: core first (`HTTP 202` SET on `PUT https://registry.npmjs.org/dsh-remedy-core`), then the plugin (`HTTP 202` SET on `PUT https://registry.npmjs.org/dsh-remedy`); the metadata read for the plugin answered `404` for a few seconds after its own `202`, which is the documented replica lag and not a failed publish. Both packages answered `latest = 0.3.4` for that publish: it printed `both packages published`, and the registry confirmed `0.3.4` on both names within a minute; `npm view` kept answering `0.3.3` after the publish had succeeded, which is the same replica lag this file records. The 0.3.5 publish printed the same line and the direct metadata read confirmed `0.3.5` on both names within two minutes (core `modified 2026-11-11T13:47:32.623Z`, plugin `2026-11-11T13:47:05.132Z`), while `record_publish.mjs` at 14:55 still saw core on `0.3.4` and had to be run again at 15:05 before both packages answered `exact_ok`.
- Publishing needs the account authentication mode in view: `npm whoami` proves the credential, `npm profile get tfa` reports `auth-and-writes`, and a write without a fresh code is answered `EOTP`. A logged-out shell instead answers the write with `404`, which is why the publish script asks `npm whoami` before it packs.
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
- Measured sample (0.3.0): 48 session files, 120 `turn/end` events, 40 `MALFORMED_RESPONSE` failures.
- Shape of those 40 failures: 37 are two JSON objects glued at the top level (provable and repairable); 2 are cut inside an object; 1 is another split failure.
- Sample window: 2026-11-08T08:35:56.956Z to 2026-11-10T10:27:17.272Z.
- Tools in the fused sample: `ops_bash` 13, `read_page` 8, `ops_inspect_local_file` 4, `list_agents` 3, `ops_read_files` 3, `send_message` 3, `ops_grep` 2, `web_search` 2, `edit` 1, `spawn_teammate` 1.
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
- A call whose tool name never arrived is rejected, never dispatched to an empty name.
- A tool name that changes inside one index aborts the rescue and the original failure is re-thrown.
- A repaired `finish` keeps the adapter `replayState`.
- A `block-end` repair is held until the tool-call phase ends; a later rejection in the same stream withdraws it and the originals go out.
- `maxCalls` bounds the calls synthesized for the whole stream, not per block.
- A stream whose consumer stops early is recorded as abandoned, not as quiet.

## The hardening (P-0002)

- Status: `verified` — the live run of 2026-11-10 repaired a real two-call fusion end to end (see Live verification).
- What it refuses: an empty tool name (`missing-name`), a tool name that changes inside one index (`name-changed`), and a `max-tokens` tail.
- What it preserves: the adapter `replayState` on a repaired `finish`.
- What it makes atomic: a `block-end` repair is held until the tool-call phase ends; if a later block in the same stream is rejected, the repair is withdrawn (`rolled-back`) and the original chunks go out.
- `maxCalls` bounds calls synthesized for the whole stream, not per block.
- A stream whose consumer stops early is recorded as `consumer-abort`, not as quiet.
- A synthesized call is emitted as a `block-start` plus a `block-end`, never a bare `block-end`.
- A withdrawn repair returns its calls to the stream `maxCalls` budget.
- A `max-tokens` stream is counted as truncated, never as an unrepaired fusion.
- A provider error that passes through is counted in `errors`.

## The observability (P-0003)

- Status: `verified` — the live run of 2026-11-10 proves the budget-refusal branch on a real host, and the eight counters are written by the shipped code.
- What it separates: a refusal that was never repairable, a repair that was withdrawn, and a repair that failed. Before 0.3.0 every refusal also incremented the fusion counter, so a stream whose only defect was bad JSON read as `degraded`.
- New counters: `refused` (seen and correctly rejected, never repairable) and `withdrawn` (repairable but given up: a later block was rejected, the consumer stopped, or the stream was truncated).
- A pure refusal raises `refused` only; it never raises `fused`.
- A budget refusal (`too-many-calls`) raises `fused` and `refused` and `unrepaired`, because no repair happened and the verdict must not read `repaired`.
- An abandoned stream (`consumer-abort`) keeps the 0.2.0 `fused` and `unrepaired` and also raises `withdrawn`.
- A truncation raises `withdrawn` and never `fused`.
- The verdict vocabulary is unchanged: `unmeasured`, `quiet`, `degraded`, `repaired`, in that order of evaluation. Only the counter line grew from six to eight names.
- The CLI prints one line with all eight counters: `streams=`, `fused=`, `repaired=`, `unrepaired=`, `truncated=`, `errors=`, `refused=`, `withdrawn=`.
- `unrepaired` now means exactly one thing: a fusion was proven and was not repaired.
- Blind spot `BS-12` is closed by this patch.

## The reseal (P-0005)

- Status: `tested` — unit tests, negative controls and a measured fixture; no live host run exists for this patch.
- What it fixes: a tool call whose single member value was written **without a quote**, so the whole argument text is one object that does not parse. Measured shapes are `Unexpected token 'c'` and `Unexpected end of JSON input` on `run_code`, where the model wrote a program after `"code": `.
- What it does: exactly one segment must reproduce the whole text as one plain object whose payload round-trips byte for byte; then that value is quoted with `JSON.stringify` and the same call is dispatched with its own id and name.
- Zero provable segments is refused as `bare-value-unproven`; two or more is refused as `ambiguous-bare-value`. Two possible resealings is treated as none.
- A reseal keeps the call id, synthesizes nothing, and does not consume the stream-wide `maxCalls` budget.
- The ninth counter is `resealed`. It is optional in the type on purpose: a counter object recorded by a 0.3.x build has no such field, and its rendered verdict line must stay byte for byte what it was.
- A stream whose only defect was a reseal reads `repaired`, never `quiet`; the quiet guard was widened instead of the vocabulary.
- Still refused, each with a negative control: a truncated tail, a duplicate key, a doubled colon, a missing closing brace, an illegal escape, and a bare single-line token.

## The scan and the redaction (P-0004)

- Status: `tested` — an offline reader and a redaction rule, so no resident journal can attest it; the evidence is unit and end-to-end tests plus a measured scan of this machine.
- What it fixes: `scan` used to read a `session.v4.jsonl.zstd` log with a plain text read, so every compressed line became an unreadable line and a 28-event session reported zero attempts. It now uses the same `decompressSessionLog` reader the plugin ships.
- `scan` accepts one file or a directory, merges every session file, and keeps one auditable row per file.
- `scan --since <ISO>` drops older events and reports them as `before_since`; an event without a timestamp is unreadable inside a window, never assumed to be inside it.
- One undecompressable file is a `failures` line and exit 3, never a silent zero.
- A measured run over this machine's session directory: 77 files, 276 attempts, 38 fused calls, 43 fusion failures, 39 repairable, 0 unreadable lines.
- What it fixes in redaction: a home path escaped with one or two backslashes and a DSH session directory that encodes the same path are now matched; before this, three recorded artifacts still carried the account name.
- A measured redaction pass rewrote 3 of 17 recorded artifacts and left every other one clean; `produced_by` and `generated_at` are never restated by a redaction fix.
- Still unmeasured: the same repair seen by both a journal and a session file is not deduplicated, and a home path without a drive letter is not matched.

## The turn census (P-0006)

- Status: `tested` — an offline reader, so no resident journal can attest it.
- What it fixes: `scan` counted only the turns that died on `MALFORMED_RESPONSE` (44 here) and dropped every other ending, so the largest failure classes on this machine were invisible in the one report meant to map them.
- The census counts every `turn/end` by its top-level `reason.kind`: completed, `max_tokens`, aborted, error. On this machine that is 92 completed, 88 `max_tokens`, 99 error and 8 aborted out of 287 turns, so the 88 truncated turns are 31 percent of all turns.
- Every error turn also names its `reason.error.code`: `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 36, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, `INVALID_REQUEST` 1.
- A census is reported, never promoted into a finding: the exit code still turns on `fused_calls` and `fusion_failures`, so the truncated turns do not make every scripted scan fail. `fusion_failures` keeps its exact meaning.
- Truncation stays unfixed on purpose: a cut tail is missing bytes rather than a missing quote, and no truncated turn could be tied to a buffered call, so there is nothing honest to repair.
- A measured run over this machine: 78 files, 375 attempts, 38 fused calls, 44 fusion failures, 39 repairable, 0 unreadable lines.
- Still unmeasured: a `reason.kind` the census does not recognise is left uncounted rather than given an invented bucket.

## The byte budget gate (P-0008)

- Status `tested`. Surface `scripts`. It is a build-side gate: nothing the plugin mounts changes, so no live journal can attest it.
- The budget had been in prose only. It was crossed three times — 55815 bytes after P-0005, 64539 after P-0004 and 70389 on the first P-0006 attempt — and every crossing was found by hand after the patch had been built, tested and packed. `grep -rn "68000" scripts/` returned nothing, which was the defect: the number had no mechanism.
- `scripts/gate_size.mjs` measures `packages/plugin/dist/*.js` and checks four things: the plugin total against 68000 bytes, `repair-stream.js` against 28000, `session-scan.js` against 14000, and any file above 10000 bytes for having a cap of its own, so a new module cannot quietly become the biggest uncapped file.
- Measured when the gate was written: 67908 bytes in total, `repair-stream.js` 27925, `session-scan.js` 13237, `cli.js` 8503. Every file starts inside its line, so the gate begins green rather than green by exception.
- `--mutate` compares the measured total against a cap one byte below it and must go red; `node scripts/gate.mjs --mutate` reports 6 of 6 gates caught their injected violation.
- It caps the emitted plugin only. Core does not load at startup, `dist/*.d.ts` is paid at build time rather than load time, and the gate cannot choose a split for a file that crosses a line — it only refuses the crossing, so the structural fix stays a decision.
- Unmeasured: whether holding the line forces awkward module boundaries later. Both splits so far grew the plugin total, so the per-file caps are what make a split the answer rather than a byte saving.

## The copy channel (P-0007)

- Status: `tested` — the build side, so no resident journal attests it and no outward file was edited by hand to prove it.
- What it fixes: the two longest outward files could not be regenerated at all, and every attempt printed the same six words, `copy_with_agy: agy exited null`, with no status, no reason and no difference between a model that refused and a process that never started.
- Two faults printed that one line: the request is the brief plus the whole fact pack plus the pattern notes, and it measured 35509 characters for the changelog and 33530 for the readme against the 32767 character cap on one Windows command line, so the spawn failed with `ENAMETOOLONG` before agy started; and a generation longer than the 600000 ms spawn timeout was killed, which also leaves a null status.
- What it does now: below 30000 characters the prompt still travels on argv exactly as before; above it the prompt travels over stdin as one `stream-json` user event and the answer is read from the final `result` event; a failed spawn is named by its own code; the timeout is half an hour.
- A refused generation is not retried across transports and the fact pack is not shortened to fit the cap: the facts are the point, and the operator re-runs a failure by hand after reading a named cause.
- Measured after the change: `README.md` regenerated at 10872 bytes and `CHANGELOG.md` at 6851 bytes, both via stdin, and `node scripts/gate.mjs` printed `ALL GREEN · 5 gates` with the copy gate verifying both manifests.

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
- Desktop profile: the same tarball was installed with `dsh plugin --profile desktop add`, the app was restarted, and the desktop process repaired 2 fused calls across 39 streams with 0 unrepaired.
- Desktop evidence: `data/results/live-desktop-2026-11-09T19-10-00.000Z.json`. The attached session shows `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`; the turn was stopped by the operator after the answer and the artifact records `turn_end=aborted`.
- 0.3.0 live run (2026-11-10): a headless `remedy-live` host running the shipped 0.3.0 tarball was asked four times to issue two tool calls in one message; the fourth task produced a real fusion. The journal holds 18 events (17 `stream` plus 1 `repaired`), the `repaired` event carrying `fused=1, repaired=1, unrepaired=0, truncated=0, errors=0, refused=0, withdrawn=0`.
- That session shows seq 18 `call_00_6zgcmtvebmpnr8613wbr7wk9` (README.md), seq 19 `call_00_6zgcmtvebmpnr8613wbr7wk9#remedy-1` (CHANGELOG.md), the two matching tool results, and `turn/end` `kind=completed` — the synthesized call was dispatched and answered.
- 0.3.0 live evidence: `data/results/live-2026-11-10T14-45-00.000Z.json`; tarball sha256 `5f73032548c761174aea697167c14b0ef25e1d881ddf2c6e2c0182fe73e99aeb`; DSH 0.2.2-rc.1; journal and session cross-check agree.
- 0.3.0 refusal live run (2026-11-10): the same headless host with `maxCalls: 1` was asked to issue two tool calls in one message, and the shipped code refused instead of repairing. The journal wrote one `rejected` event with `code=too-many-calls` and `detail=2 objects exceeds the ceiling of 1`, leaving `fused=1, repaired=0, unrepaired=1, refused=1, withdrawn=0`.
- The session that run produced has 21 events, zero tool calls, no synthetic id, and `turn_end` `kind=error`: the refusal re-threw the original failure rather than pretending to repair it.
- That verdict was `degraded` with `1 fused call(s), 1 could not be repaired` and `the original failure was re-thrown, not swallowed`.
- 0.3.0 refusal live evidence: `data/results/live-2026-11-10T16-30-00.000Z.json`; the same tarball; `cross_check.match` true.

## Tests and gates

- Tests: 189 pass, 0 fail.
- Gates: 6 (`ssot`, `registry`, `namespace`, `step-review`, `copy`, `size`).
- Negative controls (`--mutate`): 5 of 5 caught.
- Publishing: `scripts/publish_packages.mjs` publishes the two package
  directories in order and refuses to start when the workspace root is not
  private, when the versions disagree, when `dist/` is missing, or when a
  package is not `public`. A bare `pnpm -r publish` reports the missing
  one-time password as `404 Not Found`; the real answer is `EOTP`. A package
  that depends on a sibling by `workspace:*` must be published from a
  `pnpm pack` tarball: pnpm rewrites the protocol to the exact version, npm
  does not, and the registry then answers a plain install with
  `EUNSUPPORTEDPROTOCOL`.
- A registry write with no valid credential is reported as `404 Not Found` on
  the PUT while the metadata read in the same session answers `200`; on
  2026-11-11 that is exactly how a logged-out shell presented itself, and
  `npm whoami` answered `401 Unauthorized`. The publish script therefore asks
  who it is before it packs anything and refuses a real publish when the answer
  is 401 or empty; `--dry-run` prints the same warning and keeps going so the
  tarball checks still run on a machine that is not logged in.
- Fixtures: 6, including one real fused call, one counter-evidence call, and one measured bare-value program.
- The plugin tarball ships `fixtures/`; `dsh-remedy verify` works from an installed copy (0.2.0), and 0.3.0 keeps that property.
- Test command: `pnpm run verify` (build, typecheck, test, gate).
- Negative-control command: `node scripts/gate.mjs --mutate`.
- Copy gate: every externally visible file must match the recorded manifest hash and the current fact pack.

## Package size (0.3.0)

- Published tarball before the slimming pass (0.1.1): 26345 bytes compressed, 98424 bytes unpacked, 30 files, including 10 sourcemap files.
- The slimming pass was measured on the 0.1.1 code: 19114 bytes compressed, 20 entries, 63170 bytes unpacked.
- The shipped 0.2.0 tarball, which carries the P-0002 hardening, is 19569 bytes compressed, 20 entries, 64933 bytes unpacked.
- The shipped 0.3.0 tarball, which also carries the P-0003 observability, is 22418 bytes compressed, 20 entries, 74014 bytes unpacked. 0.3.1 ships the same bytes; only the published manifest differs.
- 0.3.2 adds the P-0005 reseal, ships 6 fixtures instead of 5, and splits the seam: 24689 bytes compressed, 25 entries, 81904 bytes unpacked.
- Unpacked breakdown of the shipped 0.3.0 tarball: 52247 bytes of `dist/*.js`, 13797 bytes of `dist/*.d.ts`, 2694 bytes of `fixtures/`, 5276 bytes of package-root files.
- The package still ships `dist/*.js`, `dist/*.d.ts`, `fixtures/`, `cordis.patch.yml`, `README.md`, `LICENSE`; no sourcemaps.
- Dropping sourcemaps removes 41926 bytes of the unpacked payload (measured in `docs/research/stability-audit-2026-11-10.md`).
- Shipped 0.3.2 tarball: 24689 bytes compressed, 25 entries, 81904 bytes unpacked. Breakdown: 56344 bytes of `dist/*.js`, 16701 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/` (6 fixtures plus `checksums.json`), 5276 bytes of package-root files.
- The published 0.3.5 plugin tarball is 29448 bytes compressed, 29 files, 97944 bytes unpacked (67908 bytes of `dist/*.js`, 21177 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `c1b1b43185ea49347c394c987dd878c717d8f4f5`; it has the same byte count as 0.3.4 only because `scripts/` is not packed, and its shasum moved because the packed manifest carries the new version. The published 0.3.5 core tarball is 18723 bytes compressed, 19 files, 61553 bytes unpacked (41262 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `cc9895f826b56e9e7a5a1af2ed0886cb43514531`; it grew by one patch record, not by new modules.
- The published 0.3.3 plugin tarball is 28378 bytes compressed, 29 files, 94769 bytes unpacked (65521 bytes of `dist/*.js`, 20389 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `46ad57ea718be732133979c4b0449f7221ee69c7`. The published 0.3.3 core tarball is 16776 bytes compressed, 19 files, 55684 bytes unpacked (35393 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `6fbbeb060505cb80c7f454dbab5ea74acd463fdd`.
- The 0.3.2 core tarball is 15864 bytes compressed, 19 entries, 52828 bytes unpacked (32537 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`).
- Byte budget, restated honestly: `dist/*.js` reached 55815 bytes after P-0005, over the 53000 byte ceiling. 0.3.2 splits the seam into `stream-types.ts` and `failure-text.ts`, which cuts `repair-stream.js` from 28955 to 27925 bytes but grows the plugin total to 56344, because import and export scaffolding is not free. P-0004 then took the total to 64539 and split the CLI the same way: `cli.ts` fell from 16640 to 8503 bytes while `cli-args.ts` and `scan-command.ts` added 9119, so the total rose again to 65521. Both splits are structural fixes, not byte fixes: the ceiling exists to stop one file from absorbing every patch. P-0006 then took the total to 67908 bytes, 92 bytes under the ceiling, after a first attempt that moved the census into a separate module and overshot to 70389 bytes: the scaffolding of a ninth file costs more than the code it holds, so the module was deleted and the helpers were inlined. The working ceiling is 28000 bytes for the emitted `repair-stream.js`, 14000 for `session-scan.js`, 10000 for `cli.js`, and 68000 bytes for the plugin total, and a patch that crosses a per-file number splits that file again. P-0008 turned those four numbers into a gate: `scripts/gate_size.mjs` measures `packages/plugin/dist` on every run and refuses the crossing, so the next patch cannot produce a 70389 byte total and have 189 tests and six gates pass green before anyone notices.
- The package still ships `dist/*.js`, `dist/*.d.ts`, `fixtures/`, `cordis.patch.yml`, `README.md`, `LICENSE`; no sourcemaps.
- The 0.3.3 plugin tarball is 29 files and the 0.3.3 core tarball is 19 files (0.3.0 shipped 20 and 17). The 0.3.1 core tarball is 11585 bytes compressed, 17 entries, 38582 bytes unpacked.

## Install and use

- Install into a DSH profile: `dsh plugin --profile <name> add dsh-remedy`.
- Embed as a library: `pnpm add dsh-remedy dsh-remedy-core`.
- CLI commands: `dsh-remedy status`, `dsh-remedy repair [file]`, `dsh-remedy scan <session.jsonl|directory>`, `dsh-remedy verify`.
- CLI exit codes: 0 ok, 1 finding, 2 usage, 3 unavailable.
- Scan accepts one `.jsonl` file or a directory: plain JSONL is read line by line, and a `session.v4.jsonl.zstd` log is read through the same `decompressSessionLog` helper the plugin ships. `scan --since <ISO>` is supported.
- The repair config keys: `repair` (default true), `retryOnMalformed` (default 0), `maxCalls` (default 8), `journalPath` (unset), `log` (default true).

## Limits (public wording may use these)

- Attribution stops at the assembled text: the plugin cannot prove whether the relay or the adapter glued the objects.
- The headless profile does not persist `assistant/attempt` streams, so `session.fused_calls` in the live artifact is 0; the journal counters and the synthetic id carry the proof.
- Synthetic ids are traceability aids, not durable identities.
- The message fallback parses the English `Received arguments:` text; a localized host message disables that fallback, but the delta buffer path still works.
- A `max-tokens` truncation is not repaired.
- The desktop turn was stopped by the operator after the task answer; the artifact records `turn_end=aborted` instead of claiming completion.
- Verification applies to the recorded tarball sha256, not to whatever a running desktop app has cached.
- The verdict word cannot express `observed and correctly refused`; only the counter line can. A stream whose only defect was bad JSON now reads `quiet`.
- Existing journal lines are not migrated; in a mixed journal `status --json` reports the shape of the last line.
- A synthesized tool call now opens its own `block-start`, and the live run of 2026-11-10 proves the finish path is accepted downstream; an adapter that closes blocks itself and keeps its own index bookkeeping is still unmeasured (blind spot `BS-11`).
- The retry fallback on `agent/request-error` defaults to 0 and is a stop-gap, not the fix; the 0.3.0 sample shows the host already retries the server-error family (84 of 93 failing groups were followed by a successful attempt in the same turn).
- The sample behind the 0.3.0 numbers is one machine and one account over a fixed cutoff; a different cutoff yields a different total.

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
- No new runtime dependency in `dsh-remedy-core`.
- A patch cannot claim `verified` without a `data/results/live-*` artifact.
- Security reports should use GitHub private vulnerability reporting on the public repository (enabled 2026-11-09).

## Numbers allowed in copy

0 1 0001 2 0002 3 0003 4 0004 5 05 0005 0006 6 0007 08 8 0008 09 10 11 12 13 14 15 16 17 18 19 20 21 22 25 27 28 29 30 31 35 36 37 38 39 40 43 44 48 55 56 77 78 84 88 92 93 99 120 189 256 272 276 287 375 401 956 2026 2694 3583 4427 5276 6851 8503 9119 10000 10872 11585 13237 13797 14000 15864 16640 16701 16776 16994 18723 19114 19569 20389 21177 22418 24689 26345 27925 28000 28378 28955 29448 30000 32537 32767 33530 35393 35509 38582 41262 41926 52247 52828 53000 55684 55815 56344 61553 63170 64539 64933 65521 67908 68000 70389 74014 81904 94769 97944 98424 600000 0.3.5 0.3.2 0.3.1 0.3.3 0.2.0 0.3.0 12.15.0 0.2.2 0.1.1 0.3.4
