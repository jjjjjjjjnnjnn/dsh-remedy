# Public repo facts — dsh-remedy

> This file is the ONLY source of numbers and claims for externally visible text.
> A copy artifact may not contain a number that is absent here.

## Identity

- Name: dsh-remedy
- Tagline (internal, not final copy): a resident repair layer for DeepSeek Harness.
- Package names: `dsh-remedy` (plugin), `dsh-remedy-core` (engine).
- Version: 0.4.0 (plugin), 0.4.0 (core). Both are published and both are `latest`.
- License: MIT
- Repository: https://github.com/jjjjjjjjnnjnn/dsh-remedy (public, created 2026-11-09)
- npm: `0.4.0` is published and is `latest` for both `dsh-remedy` and `dsh-remedy-core`; its packed manifest pins `"dsh-remedy-core": "0.4.0"`, so installing the plugin alone resolves the core. `0.3.8` is the previous release and shipped thirteen patches; `0.3.7` is the one before it. The publish artifact is `data/results/publish-2026-11-13T09-45-00.000Z.json` (both packages `exact_ok` and `latest_ok`), and the cold-directory install is `data/results/install-acceptance-2026-11-13T09-50-00.000Z.json` (`ok: true`, `OK 6 fixture(s)`). `dsh-remedy@0.3.0` reached the registry with a literal `workspace:*` dependency because npm published the raw workspace manifest, so installing that version fails with `EUNSUPPORTEDPROTOCOL`; 0.3.2 republished the same code from a pnpm-packed tarball with the manifest fix. 0.3.1 was built with the same fix but never reached the registry. Publishing needs a fresh one-time password every time: the account is `auth-and-writes`, and a write without one is answered `EOTP`.
- The 0.3.3 publish: core first (`HTTP 202` SET on `PUT https://registry.npmjs.org/dsh-remedy-core`), then the plugin (`HTTP 202` SET on `PUT https://registry.npmjs.org/dsh-remedy`); the metadata read for the plugin answered `404` for a few seconds after its own `202`, which is the documented replica lag and not a failed publish. Both packages answered `latest = 0.3.4` for that publish: it printed `both packages published`, and the registry confirmed `0.3.4` on both names within a minute; `npm view` kept answering `0.3.3` after the publish had succeeded, which is the same replica lag this file records. The 0.3.5 publish printed the same line and the direct metadata read confirmed `0.3.5` on both names within two minutes (core `modified 2026-11-11T13:47:32.623Z`, plugin `2026-11-11T13:47:05.132Z`), while `record_publish.mjs` at 14:55 still saw core on `0.3.4` and had to be run again at 15:05 before both packages answered `exact_ok`. The 0.3.6 publish was the first one that had to be driven by `npm publish <tarball>` directly: the wrapper run exited with status 3221226505 in `packages/core` (a Windows access violation, not a registry answer), both npm logs for that attempt stop right after the tarball notice with no HTTP request at all, and the two identical `npm publish` calls then answered `+ dsh-remedy-core@0.3.6` and `+ dsh-remedy@0.3.6` with exit 0. `npm view` kept answering `0.3.5` for about two minutes before `dist-tags.latest` became `0.3.6` on both names.
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

## The patch set, by seam (the shape of the project)

- The project is a patch set, not one wrapper. 20 patches are registered, each with its own evidence, guards and limits, and each declaring the seam it touches. The registry is `packages/core/src/registry.ts`; `dsh-remedy status` prints it and `dsh-remedy explain` answers which of them cover a failure class this host actually hits.
- Four patches sit on the resident `llm/stream` seam: P-0001 (split a proven fusion), P-0002 (a rescue must be provable, attributable and atomic), P-0003 (a refusal must be observable), and P-0005 (reseal a bare member value or refuse it).
- Two patches sit on the second resident seam, `agent/request-error`: P-0011 (the contract for who owns the decision, plus a bounded retry budget) and P-0013 (name the deterministic refusals instead of retrying them).
- Five patches live in the CLI half: P-0004 (scan fidelity and redaction shapes), P-0006 (the turn census), P-0009 (a session header is dated by createdAt), P-0010 (the usage text must match the binary), and P-0016 (coverage is declared by the patch, not restated by the command).
- Eight patches are build-side, on `scripts`: P-0007 (a copy channel that cannot report "exited null"), P-0008 (a byte budget no script checks is a suggestion), P-0012 (one cap for two load paths), P-0014 (the project description itself must be true), P-0017 (the two npm pages had no mechanism), P-0018 (a Windows exit code is not a registry answer), P-0019 (the outward pages described a project that had stopped existing), and P-0020 (a listing that pins git bytes while advertising a registry version).
- One patch is a measurement rather than a mount: P-0015 records what a rejected `agent/pre-step` decision does, so that a later patch can use that seam on measured ground.
- Three patches are `verified` (P-0001, P-0002, P-0003 — each on a real host with a `data/results/live-*` artifact). The other 17 are `tested`: they have unit tests, negative controls and a measured fixture, scan or corpus, but no artifact a resident journal can witness.
- What the set is trying to be: every claim about a defect carries the same four things — a symptom quoted from the host, a mechanism with the file and line that was measured, counter-evidence, and a written limit. That is enforced by `scripts/gate_registry.mjs` and `packages/core/src/registry.ts`.

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
- The live host has witnessed the budget-refusal branch and a clean repair; it has not yet witnessed a mid-stream withdrawal. The `withdrawn` bucket therefore rests on unit tests and fixtures only, and P-0003 stays `verified` for the branch that was actually observed rather than for the whole row.

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
- The census counts every `turn/end` by its top-level `reason.kind`: completed, `max_tokens`, aborted, error. On this machine that is 94 completed, 88 `max_tokens`, 100 error and 11 aborted out of 293 turns, so the 88 truncated turns are 30 percent of all turns.
- Every error turn also names its `reason.error.code`: `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, `INVALID_REQUEST` 1.
- A census is reported, never promoted into a finding: the exit code still turns on `fused_calls` and `fusion_failures`, so the truncated turns do not make every scripted scan fail. `fusion_failures` keeps its exact meaning.
- Truncation stays unfixed on purpose: a cut tail is missing bytes rather than a missing quote, and no truncated turn could be tied to a buffered call, so there is nothing honest to repair.
- A measured run over this machine: 78 files, 393 attempts, 38 fused calls, 44 fusion failures, 39 repairable, 0 unreadable lines. The artifact is `data/results/scan-full-2026-11-11T18-15-00.000Z.json`, written by `dsh-remedy scan --out`, which also writes its `.sha256` sidecar.
- The census is reproducible: `node scripts/record_session_sample.mjs --until 2026-11-11T17:00:00.000Z` over the same directory reports the same 293 turns, and two runs with different stamps differ only in `generated_at` (artifact `data/results/session-sample-2026-11-11T18-10-00.000Z.json`). A cutoff is required because the session directory is append-only and the live session keeps growing, so an unfiltered pass returns a different total every time.
- Still unmeasured: a `reason.kind` the census does not recognise is left uncounted rather than given an invented bucket.

## The project describing itself (P-0014)

- Status `tested`. Surface `scripts`. It changes prose, a manifest recorder and governance tests, so no live journal can attest it.
- What it fixes: three statements about this repository were false while every gate was green. The fact pack said the published 0.3.8 plugin pins `dsh-remedy-core` 0.3.7, while the packed manifest and `npm view dsh-remedy@0.3.8 dependencies` both say 0.3.8, and README, CHANGELOG and the registry already named 0.3.7 as the previous release. The handoff called `patch-registry-2026-11-12T19-35-00.000Z.json` `900820ae…`; the file and its `.sha256` both hash to `96f9144f…`, and `900820ae` exists in no artifact. And `packages/plugin/README.md`, the page npm renders, documented four commands after `explain` shipped in 0.3.8.
- Why it lasted: R21 replaced "an external model wrote this" with "every prose number exists in the fact pack", which checks the shape of a claim and never its truth. Nothing read the fact pack's own statements, nothing read the handoff, and `tests/unit/cli-usage.test.ts` compared one line — exactly the limit P-0010 recorded in its own limits field.
- The three mechanisms, each red before the fix: `tests/governance/facts-truth.test.ts` checks the pack's version, pin, previous-release and patch-id claims against the manifests, `CHANGELOG.md` and the registry; `tests/governance/handoff-truth.test.ts` checks the handoff's evidence index against the files it cites (every row resolves, the hash beside a row matches the file, each family marks one current row and it is the newest artifact, and every artifact the live sections cite is listed); `tests/unit/cli-usage.test.ts` requires the packaged README's usage block to equal the CLI's `USAGE` block line for line, and a usage line for every command `cli.ts` dispatches.
- Two contracts, not one loose check: the evidence index is "now" and must resolve, while the batch sections are "then" and may quote the stamp of that day. `git log --follow` shows every publish renames the registry snapshot to a new stamp while keeping 99 percent of its bytes, so demanding that old prose resolve would mean rewriting the only record of what that batch saw.
- Freezing a published release record is now a recorded operation: `copy_record.mjs --freeze` keeps the recorded bytes, adds `frozen_at`, and refuses to freeze an entry whose bytes on disk have drifted from the manifest.
- Byte account: the comment change costs 68 emitted bytes and no cap moved. Residency is 41143 of 44000, the CLI half 40665 of 42000, and the total 81988 of 83000; the published 0.3.8 tarball remains 81740 of those bytes, so both numbers are stated instead of one being quietly replaced.
- Still unmeasured: the fact pack is only checked against other files in this repository, so a sentence nothing else records stays a claim about the world; and the package README's prose outside the CLI block still has no mechanism (BS-13).

## The pre-step rejection (P-0015)

- Status `tested`. Surface `profile`. It is a measurement of a seam, not a mount: no shipped profile calls `agent/pre-step`.
- What was unmeasured: three rounds of handoff repeated that a rejected pre-step "could read as a cancellation", and that sentence kept the seam unmounted since R20. Nobody had run it.
- What the runtime does, read from `dsh-agent-loop/lib/index.js:492-514`: `preStep` claims the inbox batch, awaits the `agent/pre-step` waterfall, and on `{kind:'reject'}` closes the turn with `reason.kind = "blocked"` without appending `step/start`.
- What the probe measured: an isolated `DSH_HOME` under `.tmp`, a bundle with one inserted row whose listener always rejects, and one prompt. The CLI exits 1 and the session holds eight events: one `turn/start`, two `agent/inbox/spliced`, one `turn/end {"reason":{"kind":"blocked"}}`. There is no `step/start`, no `user/message`, no `assistant/*` and no `tool/call`.
- The three measured facts: a rejection is a named ending (`blocked`), not a cancellation; the claimed input is discarded (`removedCount:1`, no `inserted`, no `outcome:'canceled'`), so a user who retries has to retype; and the CLI exit code is 1, so a script can tell a refusal from a completion.
- The evidence is `data/results/prestep-probe-2026-11-13T07-45-00.000Z.json`, produced by `scripts/record_prestep_probe.mjs`.
- What is still unmeasured: how the desktop UI renders `reason.kind "blocked"` (the conversation definitions in this install contain no match on it), so the seam is usable but not presentable; and a rejection inside a multi-step turn was not exercised. That is blind spot `BS-17`.
- What this enables and forbids: a later patch may use the seam, but should rewrite the message with `{kind:'enter'}` rather than refuse, because only a rewrite keeps the user's input alive; and it must not ship to the desktop profile until the `blocked` rendering is measured.

## The coverage table (P-0016)

- Status `tested`. Surface `cli`. It moves six coverage claims out of the command and no behaviour with them.
- What it fixes: `dsh-remedy explain` printed "which patch covers this failure class" from two constants of its own, `COVERAGE` and `SWITCHES`. The registry therefore had a second home for one claim: a patch could cover a class and never appear in the answer, and the only mechanism against that was a human comparing two files.
- What changed: the patches carry `failureClasses` and `switchKey` in `packages/core/src/registry.ts`, and the command reads `PATCHES`. Six patches declare coverage today — P-0001, P-0002, P-0003, P-0005 and P-0011 over `MALFORMED_RESPONSE`, and P-0013 over `UNSUPPORTED_REASONING_EFFORT`, `INVALID_REQUEST`, `MISSING_CREDENTIAL` and `EMPTY_RESPONSE`.
- The guard is `tests/governance/coverage-single-source.test.ts`: it names the two constants so they cannot quietly return, checks the exact covered set, refuses a duplicate class on one patch, and refuses a patch that names a switch key without covering a class. A patch added tomorrow is answered by `explain` the moment it lands in `PATCHES`.
- The printed table is unchanged, which is the point: the move is a single-source fix, not a behaviour change.
- Still unmeasured: the switch vocabulary is a closed pair (`repair`, `retryOnMalformed`), and a patch switched by any other key needs that key added here rather than inferred.

## The package pages (P-0017)

- Status `tested`. Surface `scripts`. It is a measurement plus two guards, not a new channel for npm pages.
- What it fixes: `packages/plugin/README.md` and `packages/core/README.md` are hand-written, carry no `output_sha256`, and are not generated by the copy channel, so `gate_copy` never saw them. P-0010 pinned one scan line, P-0014 pinned the CLI block, and the rest of the page was compared against nothing.
- What was measured first: the plugin page is 2331 bytes and carries zero prose numbers once fenced blocks, inline code and URLs are stripped — the exact rule `copy-policy` applies — so the number rule had nothing left to rot there. What remained was the fenced command block (already pinned by P-0014) and behavioural prose.
- The guards: `tests/governance/package-readme-prose.test.ts` reuses `proseNumbers` from the copy channel instead of restating the stripping rule, requires zero prose numbers on both pages, and requires every `dsh-remedy <command>` inside a fence to be one `cli.ts` actually dispatches; the engine page must not document a CLI at all.
- What is still open: the pages are not in the copy channel, so layout and behavioural prose stay hand-written (BS-13 stays open, narrowed). The number rule is the channel criterion, not a truth test.

## The Windows exit code (P-0018)

- Status `tested`. Surface `scripts`. It changes advice printed by a build script, not a seam.
- What it fixes: `node scripts/publish_packages.mjs` printed `npm exited 3221226505 in packages/core` and then offered advice shaped like an HTTP answer. `3221226505` is Windows `0xC0000409`, and both npm debug logs for the 0.3.6 attempt stop right after the tarball notice with **no HTTP request**, so nothing was sent and every branch of that advice was about the wrong cause.
- What changed: `windowsStatusAdvice(status)` names `3221226505` as `0xC0000409` and `3221225477` as `0xC0000005`, says the process died before answering the registry, and points at the direct `npm publish <tarball> --access public` call, which is what succeeded twice on 2026-11-12. The call site checks it before the OTP and HTTP advice.
- The guard: `tests/unit/publish.test.ts` grew two tests — one pins that both codes produce advice naming the exception, the other is the negative control that `0`, `1`, `402`, `403`, `404`, `429`, `null` and `undefined` do **not** take that branch, so a real 404 keeps its real advice.
- Still unmeasured: only the two codes this machine produced are named; a third Windows exception still prints its raw number. The patch also does not retry the publish, because publishing is the operator's decision.

## The outward pages (P-0019)

- Status `tested`. Surface `scripts`. It rewrites prose and adds no behaviour.
- What it fixes: `README.md` and `README.zh-CN.md` opened as "a resident repair layer that mounts on `llm/stream`" while the project had become a patch set of eighteen defects across two resident seams, the CLI and the build side. One sentence had also become false: both pages said `agent/pre-step` was not mounted because nobody had measured what a rejection does, and R23 had measured exactly that (P-0015).
- Why it lasted: the copy channel guards numbers, not shape. `gate_copy` checks that every prose digit exists in the fact pack and has no opinion about whether the page still describes the product; P-0014 pinned the pack own claims and P-0017 pinned the package pages, so the two root READMEs could keep saying "one seam, one wrapper".
- What changed: both pages now open as a patch set, carry a seam classification table, and replace the pre-step guess with the measurement plus its remaining blind spot (`BS-17`). Status names three `verified` and sixteen `tested` patches and states that the six after `0.3.8` are merged, tested and unreleased.
- The two package READMEs, which npm renders, now explain the split: installing the plugin installs the engine because the pin is exact, and the engine is its own package because it does no I/O and can be embedded and tested alone.
- Still unmeasured: the root README has no structural guard, so a page could still describe behaviour the code does not have without a gate noticing; npm keeps serving the `0.3.8` tarball until a release carries these pages.

## The market source (P-0020)

- Status `tested`. Surface `scripts`. It corrects a machine-readable listing, not a seam.
- What it fixes: `docs/market-index.json` declared version `0.3.8` and a git commit in the same entry. `0.3.8` is the published tarball with thirteen patches; the commit it named carried nineteen, the new package descriptions and a rewritten README, so a market trusting the entry would have installed bytes the version number does not describe.
- Why it lasted one round: the guard added with the index checked the shape of the pin — a forty-character hex commit and `path: packages/plugin` — and never its meaning. It is the same defect the project has now written down five times: a check on form is not a check on meaning.
- What changed: a `source` now names where a version bytes actually live. The published version points at the registry (`{"type":"npm"}`) and carries no commit; a git pin is allowed only together with an explicit `unreleased` marker, so a working tree cannot pose as a release. The unreleased head is stated once in words under `head` instead of being pinned.
- The guard: `tests/governance/distribution-entry.test.ts` enforces all four cases (npm without commit, git with sha plus `unreleased`, the measured `publishTimestamp` of `1794505202`, and both halves of the head note).
- Still unmeasured: the guard cannot ask the registry over the network, so "0.3.8 is still the latest" remains a fact read at release time; and it cannot correct a third-party market that already crawled the private workspace shell at the repository root.

## The windowed scan and the session header (P-0009)

- Status `tested`. Surface `cli`. Like P-0004 it changes an offline reader, so no resident journal can attest it.
- A windowed scan over the real session directory reported `unreadable_lines=78` for 78 files. Every session log opens with `{"type":"session",…}` and its instant is the top-level `createdAt`, not `time`; the scanner required `time` before it would apply `--since` and counted every header as an unreadable line.
- Measured on the host: 78 session files, 78 headers, 78 headers without a `time` field, in three key shapes that all carry `createdAt`.
- After the fix the same command reports `unreadable_lines=0`, `before_since=156209` and the same `attempts=67`, so the header moves from the wrong bucket into the right one without changing the fault map.
- Only the `session` header falls back to `createdAt`. An ordinary event with no instant is still counted unreadable, because there is no second field to read.
- Guards: `tests/unit/session-scan.test.ts` dates a header by `createdAt` and expects zero unreadable lines, dates one before the window and expects `before_since`, and keeps the ordinary-event case expecting one unreadable line; `tests/e2e/cli.test.ts` scans a two-file zstd directory and asserts both numbers.
- Unmeasured: whether `createdAt` ever disagrees with the file itself. The fix trusts the header’s own claim and does not compare it against the wall clock or the mtime.

## The second seam (P-0011) and the named refusals (P-0013)

- Status: both `tested`. They live on `agent/request-error`, which a live journal can witness only when a turn fails in a class this plugin retries, and the retry budget defaults to 0.
- `agent/request-error` shipped in 0.2.0 with **no test at all**: twenty test files, none of which mentioned the seam. It also called `next()` and then overrode whatever the default chain returned, and kept its budget in a map that was never pruned, so a long-lived desktop process kept one entry per step forever.
- The shipped runtime documents the real contract: "a handling listener returns `{ kind: 'retry' }` **without calling `next()`**, while an unhandled failure is terminal", and "a waterfall listener that does not own the decision must return `next()`". Calling `next()` first and then overriding it discards the default chain, and context compaction authorizes its own retry on exactly that path.
- What the listener does now, in order: no code / empty code / aborted signal → `next()`; a named class (`UNSUPPORTED_REASONING_EFFORT`, `INVALID_REQUEST`, `MISSING_CREDENTIAL`, `EMPTY_RESPONSE`) → record one diagnosis per (step, code) and then `next()`, never retry; a control code (`IMAGE_OFFLOAD_REQUIRED`, `INVALID_CREDENTIAL`, `MISSING_CREDENTIAL`) → `next()`; `MALFORMED_RESPONSE` with budget left → `{ kind: 'retry' }`; anything else or budget spent → `next()`.
- The budget is a bounded cache of 256 entries, evicted oldest-first; the listener exposes `cacheSize()` so a test proves the bound instead of trusting a comment. Nine tests pin every branch.
- Measured reason for the naming half: 37 turns on this machine died with `provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"`, across three workspaces, eleven sessions and two days, and the journal said nothing. `repair-stream` is mounted on `llm/stream`, which only runs after a request is dispatched, so a step refused during preparation could never reach it.
- `packages/core/src/preflight.ts` re-derives the adapter's supported set from a profile declaration and answers `ok` / `refuse` / `unknown` plus the nearest accepted level as a suggestion. It mirrors the adapter's own filter, including its quirk: an explicit `null` mapping removes a level, a level absent from the map is still accepted for `off`/`low`/`high`, and `xhigh`/`max` require an explicit mapping.
- It **never silently downgrades a level**. The adapter itself will clamp when a requested level differs from a declared default, but changing a user configuration is a decision the user makes, so `effective` stays what was asked and `suggestion` is the fixable alternative.
- `agent/pre-step` is deliberately **not mounted**. Upstream's `PreStepDecision` is `{ kind: 'reject' }` or `{ kind: 'enter', messages, … }` and a rejected decision opens no step, but nobody has measured what a user sees when a plugin rejects a step, so mounting a refusal would be guessing.
- `dsh-remedy explain` reads the registry, an optional profile file and an optional session directory, and prints one row per failure class: how often this machine hit it, which patch covers it, and whether that patch is switched on in the named profile.

## The byte budget by load path (P-0012)

- Status `tested`. Surface `scripts`.
- The budget used to be one number. It was really two: modules a mounted plugin loads at startup, and modules only a command loads. A daemon pays the first half on every session and the second half never, so one cap made every resident byte compete with CLI code. P-0009 landed with three bytes of headroom for that reason, and the next patch needed 4263 bytes of new module that did not fit.
- It is now three checks — `residency` ≤ 44000, `cli` ≤ 42000, total ≤ 83000 — plus a rule that every emitted module belongs to exactly one of them.
- `tests/governance/budget-split.test.ts` walks the real module graph from `packages/plugin/src/index.ts` in both directions: a resident module the list omits fails, and a listed file the loader never reaches fails as unpaid debt. A second test requires the CLI entry not to import the resident seam.
- Two threshold moves happened in one session and both are recorded in `scripts/lib/budgets.mjs` with the owner signature PROJECT_RULES section 1 requires, together with the alternative that was rejected: deleting prose from the emitted plugin. That trade was already rejected once (R15).
- Still true: per-file caps did not move; `repair-stream.js` ≤ 28000, `session-scan.js` ≤ 14000, `cli.js` ≤ 12000, and a file above 10000 bytes with no cap is refused. The graph test follows relative imports only, so a module reached through the core package would not be caught by it.

## The CLI documentation (P-0010)

- Status `tested`. Surface `cli`. It changes two strings, so no resident journal can attest it.
- The npm page for the plugin said `scan <session.jsonl> [--json] [--out <file>]` and the CLI's own usage said `scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]`. Both had been wrong since 0.3.3: `scan` has accepted a directory, `--since` and `--max-files` since P-0004.
- Nothing watched either string. The copy gate covers the eleven outward files at the repository root and this file is hand-written package prose with no recorded hash, so it had no gate; no test ran `help` or compared the two strings.
- Both now carry the same line, `<session.jsonl|directory> [--since <iso>] [--max-files <n>] [--json] [--out <file>]`, and `tests/unit/cli-usage.test.ts` fails if they ever differ again or if the old one-file-only shape returns.
- Paid for under the byte ceiling by stating each command on one line instead of two: the emitted `cli-args.js` fell from 3086 to 2972 bytes and the plugin total from 67997 to 67883.
- Unmeasured: the gate set still does not cover `packages/*/README.md` as a whole; the new test compares the two `scan` lines, not the rest of the package README.

## The byte budget gate (P-0008)

- Status `tested`. Surface `scripts`. It is a build-side gate: nothing the plugin mounts changes, so no live journal can attest it.
- The budget had been in prose only. It was crossed three times — 55815 bytes after P-0005, 64539 after P-0004 and 70389 on the first P-0006 attempt — and every crossing was found by hand after the patch had been built, tested and packed. `grep -rn "68000" scripts/` returned nothing, which was the defect: the number had no mechanism.
- `scripts/gate_size.mjs` measures `packages/plugin/dist/*.js` and checks four things: the plugin total against 68000 bytes, `repair-stream.js` against 28000, `session-scan.js` against 14000, and any file above 10000 bytes for having a cap of its own, so a new module cannot quietly become the biggest uncapped file.
- Measured when the gate was written: 67908 bytes in total, `repair-stream.js` 27925, `session-scan.js` 13237, `cli.js` 8503. Every file starts inside its line, so the gate begins green rather than green by exception.
- `--mutate` compares the measured total against a cap one byte below it and must go red; `node scripts/gate.mjs --mutate` reports 6 of 6 gates caught their injected violation.
- It caps the emitted plugin only. Core does not load at startup, `dist/*.d.ts` is paid at build time rather than load time, and the gate cannot choose a split for a file that crosses a line — it only refuses the crossing, so the structural fix stays a decision.
- Unmeasured: whether holding the line forces awkward module boundaries later. Both splits so far grew the plugin total, so the per-file caps are what make a split the answer rather than a byte saving.

## The copy channel (P-0007)

- Status: `tested` — the build side, so no resident journal attests it and no outward file was edited by hand to prove it. **The transport it describes is retired**: no external model is called any more, and the property that transport protected (no number outside the fact pack) is now enforced by `scripts/copy_record.mjs` and `scripts/gate_copy.mjs` directly. The paragraphs below are the patch record, not the current channel.
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
- 0.3.6 live run (2026-11-11 to 2026-11-12): the shipped 0.3.6 tarball was installed into `remedy-live` and asked, eleven times, to issue two `read` calls in one assistant message. One of those turns produced a real fusion. The journal holds 60 `stream` events plus one `repaired`, and the `repaired` event reads `fused=1, repaired=1, unrepaired=0, truncated=0, errors=0, refused=0, withdrawn=0`.
- That session (`session-be170c33`) shows seq 18 `call_00_2n6gr905wxda0su0f6bsmkm5` reading `docs/copy/manifest.json`, seq 19 `call_00_2n6gr905wxda0su0f6bsmkm5#remedy-1` reading `docs/copy/facts/public-repo-facts.md`, the two matching tool results, and `turn/end` `kind=completed`: the synthesized call was dispatched and answered on the current release.
- 0.3.6 live evidence: `data/results/live-2026-11-12T06-00-00.000Z.json`; the verdict is `repaired` with `1/1 fused call(s) split into valid calls`; journal and session cross-check agree.
- 0.3.7 live run (2026-11-12): the packed 0.3.7 tarball (shasum `69087301f5ff802e387061af61756b65b883b11d`, sha256 `38f584475956d6edd34cff759fe0711e226e5fbb17adcca123d32367ed40d63f`) was installed into `remedy-live` and asked, once, to issue two `read` calls in one message. It fused on the first request and the shipped 0.3.7 build repaired it: the journal holds 3 `stream` events plus one `repaired`, and the `repaired` event reads `fused=1, repaired=1, unrepaired=0, truncated=0, errors=0, refused=0, withdrawn=0`.
- That session (`session-baff8f60`) shows seq 18 `call_00_b3fj2kuahvwb75af3a5o6u7x` reading `docs/copy/manifest.json`, seq 19 `call_00_b3fj2kuahvwb75af3a5o6u7x#remedy-1` reading `docs/copy/facts/public-repo-facts.md`, the two matching tool results, and `turn/end` `kind=completed`.
- 0.3.7 live evidence: `data/results/live-2026-11-12T12-20-00.000Z.json`; verdict `repaired`; the artifact records the packed tarball's sha256, so it is tied to the exact bytes that will be published.
- The whole shipped corpus was replayed through the built engine: every `MALFORMED_RESPONSE` turn on this host (47 of them, 23269 bytes of captured argument text) was fed back into `repairToolCallArguments`. 39 were repaired (38 splits and one reseal), 8 were refused, and no repaired case dispatched a call whose arguments failed to parse (`data/results/malformed-replay-2026-11-12T11-30-00.000Z.json`).
- A generated stress pass asserts the same invariant at scale: 300000 generated argument texts through the built engine, 104795 accepted, 105133 already valid, 90072 refused, zero unparsable dispatches, zero duplicate ids, zero lost tool names (`data/results/stress-repair-2026-11-12T12-10-00.000Z.json`). The seed is recorded in the artifact, so a counter-example would be replayable.
- A mid-stream withdrawal (`withdrawn`) cannot happen on this host, and that is measured, not assumed. `rolled-back` needs a proven repair held in `pending`, and `pending` is only filled by the `block-end` path; fused text here arrives in `tool-call-chunks` entries, which are repaired at `finish` and never held. `scripts/probe_withdrawn_reachability.mjs` walked 24 329 persisted attempt streams: 62 carry a fused `tool-call-chunks` entry, 23 724 carry arguments inside a `block-end`, and 0 carry a provable fusion inside a `block-end`. A live `withdrawn` therefore needs `consumer-abort` (a consumer that stops reading mid-stream), which a scripted headless run does not do.

## Tests and gates

- Tests: 255 pass, 0 fail.
- Gates: 6 (`ssot`, `registry`, `namespace`, `step-review`, `copy`, `size`).
- Negative controls (`--mutate`): 6 of 6 caught.
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
- The plugin tarball ships `fixtures/`; `dsh-remedy verify` works from an installed copy (0.2.0), and every release since keeps that property. The check is not a sentence in the handoff: `scripts/record_install_acceptance.mjs` installs the published version into a fresh directory from the registry alone, runs `dsh-remedy verify`, and writes `data/results/install-acceptance-*.json` with the three commands, their exit codes and the output. The 0.3.6 artifact reports `ok` with `OK 6 fixture(s)`.
- Test command: `pnpm run verify` (build, typecheck, test, gate).
- Negative-control command: `node scripts/gate.mjs --mutate`.
- Copy gate: every externally visible file must match the recorded manifest hash and the current fact pack. The release notes are a copy artifact too (docs/copy/release-notes/), so the words on the GitHub release page come from the same fact pack as the README.

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
- The published 0.3.8 plugin tarball is 35898 bytes compressed, 35 files, 117750 bytes unpacked (81740 bytes of `dist/*.js`, 26605 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5822 bytes of package-root files), shasum `3bc47df12f21fe7d68336f595d397ff868b3d4d7`. The published 0.3.8 core tarball is 26551 bytes compressed, 21 files, 83461 bytes unpacked (58062 bytes of `dist/*.js`, 22102 bytes of `dist/*.d.ts`), shasum `0df993f85589e101b15b830fa105e7ef8c66c5d5`. The plugin file count rose from 29 to 35 because P-0011 added `failure-listener`, the P-0012 split added `monitor`, and `explain` added `explain-command`, and the core file count rose from 19 to 21 because `preflight` is one module and its declaration is shipped.
- The published 0.4.0 plugin tarball is 36928 bytes compressed, 35 files, 119866 bytes unpacked; shasum `dd3b764dd57d09c4cf85e312867da23360a4e06f`, sha256 `84b93ff292a0b682ac2d17af7b9364323d3758c68897a46397bfd426588768d4`. The published 0.4.0 core tarball is 31773 bytes compressed, 21 files, 100304 bytes unpacked; shasum `48d449b75bb7fa06f4bc16181433e617d2ca5a66`, sha256 `6d035484bd76a0f7273a5f41ea80a0efd0e568fca2beadd199a113a512dfc40a`. The two file counts did not move; the core grew because the registry now carries four more patch records.
- The 0.3.7 tarballs, three releases back after 0.4.0, remain 29462 / 29 / 98001 (shasum `69087301f5ff802e387061af61756b65b883b11d`) and 20000 / 19 / 65961 (shasum `33eaaf0320eb474d5d7c5ce2761f10de79d17d21`).
- The published 0.3.7 plugin tarball is 29462 bytes compressed, 29 files, 98001 bytes unpacked (67883 bytes of `dist/*.js`, 20835 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5700 bytes of package-root files), shasum `69087301f5ff802e387061af61756b65b883b11d`, sha256 `38f584475956d6edd34cff759fe0711e226e5fbb17adcca123d32367ed40d63f`. The published 0.3.7 core tarball is 20000 bytes compressed, 19 files, 65961 bytes unpacked (45670 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `33eaaf0320eb474d5d7c5ce2761f10de79d17d21`.
- The 0.3.6 tarballs, four releases back after 0.4.0, remain 29445 / 29 / 97807 (shasum `fe85d15a5e97e9956a8a899d993ec1122f0c8774`) and 19247 / 19 / 63408 (shasum `76777609f4e3928af5ed591c01edb7ee1c2323f0`).
- The 0.3.6 release published a plugin tarball of 29445 bytes compressed, 29 files, 97807 bytes unpacked (67997 bytes of `dist/*.js`, 20951 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `fe85d15a5e97e9956a8a899d993ec1122f0c8774`. The published 0.3.6 core tarball is 19247 bytes compressed, 19 files, 63408 bytes unpacked (43117 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `76777609f4e3928af5ed591c01edb7ee1c2323f0`; it grew by one patch record, not by new modules. The 0.3.5 tarballs remain 29448 / 29 / 97944 (shasum `c1b1b43185ea49347c394c987dd878c717d8f4f5`) and 18723 / 19 / 61553 (shasum `cc9895f826b56e9e7a5a1af2ed0886cb43514531`).
- The published 0.3.3 plugin tarball is 28378 bytes compressed, 29 files, 94769 bytes unpacked (65521 bytes of `dist/*.js`, 20389 bytes of `dist/*.d.ts`, 3583 bytes of `fixtures/`, 5276 bytes of package-root files), shasum `46ad57ea718be732133979c4b0449f7221ee69c7`. The published 0.3.3 core tarball is 16776 bytes compressed, 19 files, 55684 bytes unpacked (35393 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`), shasum `6fbbeb060505cb80c7f454dbab5ea74acd463fdd`.
- The 0.3.2 core tarball is 15864 bytes compressed, 19 entries, 52828 bytes unpacked (32537 bytes of `dist/*.js`, 16994 bytes of `dist/*.d.ts`).
- Byte budget, restated honestly: `dist/*.js` reached 55815 bytes after P-0005, over the 53000 byte ceiling. 0.3.2 splits the seam into `stream-types.ts` and `failure-text.ts`, which cuts `repair-stream.js` from 28955 to 27925 bytes but grows the plugin total to 56344, because import and export scaffolding is not free. P-0004 then took the total to 64539 and split the CLI the same way: `cli.ts` fell from 16640 to 8503 bytes while `cli-args.ts` and `scan-command.ts` added 9119, so the total rose again to 65521. Both splits are structural fixes, not byte fixes: the ceiling exists to stop one file from absorbing every patch. P-0006 then took the total to 67908 bytes, 92 bytes under the ceiling, after a first attempt that moved the census into a separate module and overshot to 70389 bytes: the scaffolding of a ninth file costs more than the code it holds, so the module was deleted and the helpers were inlined. P-0012 then split the ceiling by load path: 44000 for the modules a mounted plugin loads, 42000 for the modules only a command loads, 83000 for the total, and 12000 for `cli.js` (the per-file caps for `repair-stream.js` at 28000 and `session-scan.js` at 14000 are unchanged). Measured after the split and after P-0011 and P-0013: residency 41143, cli 40845, total 81988, and a patch that crosses a per-file number splits that file again. P-0008 turned those four numbers into a gate: `scripts/gate_size.mjs` measures `packages/plugin/dist` on every run and refuses the crossing, so the next patch cannot produce a 70389 byte total and have 192 tests and six gates pass green before anyone notices. P-0009 then landed at 67997 of 68000 bytes, leaving three bytes of headroom, and P-0010 paid for its longer flag list by stating each command on one line, which took the total back to 67883 bytes.
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

0 1 0001 2 0002 3 0003 4 0004 5 05 0005 6 0006 0007 7 8 08 0008 09 0009 10 0010 11 0011 12 0012 13 0013 14 15 16 17 18 19 20 21 22 23 24 25 27 28 29 30 35 37 38 39 40 43 44 47 48 55 56 60 62 77 78 84 88 92 93 94 100 120 192 228 256 272 276 293 329 393 401 724 956 2026 2694 2972 3086 3583 4263 4427 5276 5700 5822 6851 8503 9119 10000 10872 11585 12000 13237 13797 14000 15864 16640 16701 16776 16994 18723 19114 19247 19569 20000 20389 20835 20951 22102 22418 23269 24689 26345 26551 26605 27925 28000 28378 28955 29445 29448 29462 30000 32537 32767 33530 35393 35509 35898 38582 40665 41075 41926 42000 43117 44000 45670 52247 52828 53000 55684 55815 56344 58062 61553 63170 63408 64539 64933 65521 65961 67883 67908 67997 68000 70389 74014 81740 81904 83000 83461 90072 94769 97807 97944 98001 98424 104795 105133 117750 300000 600000 3221226505 0.3.8 0.3.2 0.3.1 0.3.3 0.3.5 0.3.6 0.2.0 0.3.0 12.15.0 0.2.2 0.3.7 0.1.1
