# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.4.4] - 2026-11-13
### Fixed
- A fused text that glues two calls of **different** tools no longer runs the wrong tool. The stream carries one tool name for that index, so the fragments after the first inherited it; measured twice on DSH 0.2.2-rc.3, the surplus object was dispatched as `read` and the tool answered `invalid arguments: missing required property "file_path"`. The wrapper now receives the request's tool declarations and checks each synthesized fragment against the named tool's `required` fields; one that does not fit goes out as `remedy_unattributed`, which the runtime answers with `UNKNOWN_TOOL` while the turn continues. The `repaired` event records `unattributed: <n>`.
- `BS-18` narrows with it: the wrong dispatch is now a named failure the model can retry, and what stays open is a tool whose declaration proves nothing.

### Notes
- This release carries 27 patches.
- The resident half paid for the patch itself: the first build was 2 539 bytes over the 83000-byte total, so `repair-stream.ts` prose was condensed in four passes and `toolsOf` was inlined. No cap moved; the gate now reads residency 41623 of 44000, CLI 41362 of 42000, total 82985 of 83000.
- P-0027 is `tested`, not `verified`: the engine is pinned by six unit tests, and the runtime's answer to the fallback name was measured with a probe rather than by a live fusion of two different tools.

## [0.4.3] - 2026-11-13
### Changed
- Re-measured on **DSH 0.2.2-rc.3**, the desktop build released today (the previous measurement was 0.2.2-rc.1). All three seams this plugin uses are declared identically in both versions — `llm/stream` stays a synchronous waterfall over `AsyncIterable<StreamChunk>`, `agent/pre-step` keeps `PreStepDecision`, `agent/request-error` keeps `RequestErrorAction` — so the supported range stays `>=0.2.0-rc.1 <0.3.0-0` and only the measured statement moved. `data/results/adaptation-0.4.2-on-0.2.2-rc.3-2026-11-13T19-55-00.000Z.json` records the run: an isolated `DSH_HOME`, the published 0.4.2 tarball, one real turn, and a real fusion repaired with the synthesized call dispatched.
- One measured behaviour changed: on rc.1 the adapter never closed a tool-call block, on rc.3 it closes the first fragment itself and leaves the surplus object to the finish-time rescue. Both paths are accepted by the runtime; P-0002's record now says which version showed which.

### Recorded
- `BS-18`, open: a fused text that glues two calls of different tools carries one name for that index, so fragments after the first inherit it. Measured twice on rc.3 — the synthesized call was dispatched as `read` with shell arguments and the tool answered `INVALID_ARGS`. Visible, but a wrong dispatch; P-0002's limits and doc no longer claim otherwise. The fix is planned as `P-0027`.
- `scripts/record_adaptation.mjs` regenerates that artifact from an isolated home, so the next runtime upgrade is measured the same way instead of argued from version numbers.

### Notes
- No seam behaviour changed: the engine, the wrapper and the CLI are byte-identical to 0.4.2 except the registry's P-0002 limit text. This release exists because the published page said "measured on 0.2.2-rc.1" while the runtime in use is rc.3, and because the probe that checked it found a boundary the record claimed was closed.

## [0.4.2] - 2026-11-13
### Fixed
- `dsh-remedy explain` no longer reports an unread profile as a finding. With `--sessions` and no `--profile-file` it printed `(no)` in the "enabled here" column for every covered class and exited `1`, while the same screen said `enabled-here is unknown`; the column now has three states (the coverers, `(no)` for a profile that switches them off, and `unknown` when no profile was named) and only a profile that was actually read can make the command exit `1`. The package README, which npm renders, described the old semantics and is corrected through the copy channel.
- The release procedure now has one home. `docs/HANDOFF.md` still taught the pnpm filter publish path and an OTP requirement, and its boundary section described the profiles and the registry latest three releases out of date; the handoff now points at `docs/PUBLISH.md` and a governance test refuses the retired commands, any flag `scripts/publish_packages.mjs` does not read, and a boundary statement that cites a gitignored `.tmp/` path or a `latest` the packages do not ship.

### Changed
- The two package READMEs are now live entries in the copy channel. `gate_copy` checks their bytes, fact-pack hash, prose numbers and writer, and requires both entries; the P-0017 prose test stays as a second guard. The pages are still hand-written and still ship in the tarball, so a change to them reaches npm only with a release.

### Notes
- This release carries 26 patches: the 23 that 0.4.1 shipped plus P-0024, P-0025 and P-0026.
- All three are `tested`, not `verified`: two are build-side and one changes text a command prints, so no resident seam can witness them.

## [0.4.1] - 2026-11-13
### Fixed
- The package no longer advertises `./retry-listener`. No `src/retry-listener.ts` has ever existed, so importing that subpath failed with `ERR_MODULE_NOT_FOUND` while the manifest said it was supported; the listener is still exported from the main entry. Every export target now has to have a source module, with a negative control that keeps the check from passing on an empty input.
- The fixture drift test no longer repairs the drift it claims to detect. It used to run `sync_fixtures.mjs` in write mode and then compare the copy, so the copy step overwrote any drift before the assertion; it now runs `--check` first and seeds only a missing copy, and a copy with one changed byte must be reported.
### Added
- `gate_registry` now requires a `docs/patches/P-NNNN-*.md` for every registered patch. It found P-0016, which had shipped without one; the doc is written from the recorded round and the index range is corrected.
### Notes
- All three patches are `tested`, not `verified`: they touch a manifest, a test and a governance gate, and no resident seam can witness them.
- This release carries 23 patches: the 20 that 0.4.0 shipped plus P-0021 through P-0023.

## [0.4.0] - 2026-11-13
### Added
- `dsh-remedy explain` answers a second question the registry alone could not: which patch covers a failure class your machine actually hits, and whether that patch is switched on in the profile you point it at. Coverage now lives on the patch itself (`failureClasses`, `switchKey`), so a patch added tomorrow is answered the same day instead of waiting for a command to be edited.
- `scan` counts every way a turn can end and names every error code, instead of only the repairable ones. On the host this was measured on, that surfaced `max_tokens` and `UNSUPPORTED_REASONING_EFFORT`, the two largest classes, neither of which had been visible.
- `agent/request-error` gained a written contract and a bounded retry budget, and the deterministic refusals that used to end a turn in silence are now named once per step instead of not at all.
### Changed
- The byte budget is measured per load path (residency, CLI, total) rather than as one number, so a CLI command and a daemon no longer compete for the same ceiling.
- Outward text is written in the session that does the work, and every prose number in it must exist in the fact pack; the check is no longer "which model typed it".
### Fixed
- A bare, unquoted value after a member key is resealed only when exactly one rewriting proves, and otherwise refused; a truncated call is never repaired.
- A refusal is observable: a stream whose only defect is bad JSON reads quiet, a proven fusion that was declined reads refused, and neither is reported as an attempted repair.
- A scan reads multi-frame zstd logs instead of counting compressed bytes as unreadable lines, and a session header is dated by its `createdAt` rather than reported as unreadable.
- The npm page documents every command the binary dispatches, including `explain`, and the usage block is compared line for line against the CLI own text.
- The project description is checked instead of trusted: the fact pack version and pins must match the manifests, and the release notes are frozen records rather than pages that drift with the pack.
- The publish wrapper names a Windows access violation for what it is instead of printing a bare exit code and offering HTTP advice for a process that never spoke to the registry.
### Package size
- The plugin tarball and the core tarball are measured at pack time; `record_publish` refuses wording that claims a size before the artifact exists.
### Notes
- Seven patches in this release are `tested`, not `verified`: they touch prose, manifests, a build script, offline readers or a measurement on an isolated profile, and no resident journal can witness them. Three earlier patches stay `verified` on a real host.
- `agent/pre-step` is measured but still not mounted: a rejection closes the turn as `blocked` with no step opened and discards the claimed input, so a later patch may use the seam only to rewrite the message. The desktop rendering of `blocked` remains unmeasured.
- A mid-stream withdrawal (`withdrawn`) cannot happen on this host; 0 of 24 329 persisted attempt streams carry a provable fusion inside a `block-end`, which is what `rolled-back` needs.

## [0.3.8] - 2026-11-12
### Added
- P-0011: the second seam, `agent/request-error`, had **no test at all** since 0.2.0 (twenty test files, none of which mentioned it). It also called `next()` and then overrode whatever the default chain returned, and kept its retry budget in a map that was never pruned, so a long-lived process kept one entry per step forever. It now follows the contract the runtime documents in its own README: a handling listener returns `{ kind: 'retry' }` **without calling `next()`**, and a listener that does not own the decision returns `next()`. The budget is a bounded cache of 256 entries, and the listener exposes `cacheSize()` so a test proves the bound. Nine tests pin every branch.
- P-0013: 37 turns on this host died with `UNSUPPORTED_REASONING_EFFORT` — `provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"` — across three workspaces, eleven sessions and two days, and the journal said nothing, because `repair-stream` is mounted on `llm/stream` and a step refused during preparation never reaches that seam. Those classes are now named once per `(step, code)` and never retried, and `packages/core/src/preflight.ts` can answer `ok` / `refuse` / `unknown` for a declared effort before a token is spent.
- `dsh-remedy explain`: a new command that prints, per failure class, how often this machine hit it, which patch covers it, and whether that patch is switched on in the named profile.
### Changed
- P-0012: the byte budget was one number describing two load paths — the modules a mounted plugin loads at startup, and the modules only a command loads. A daemon pays the first half on every session and the second half never, so one cap made every resident byte compete with CLI code. It is now three checks (`residency` ≤ 44000, `cli` ≤ 42000, total ≤ 83000) plus a rule that every emitted module belongs to exactly one of them, with a governance test that walks the real module graph in both directions.
- The copy channel's transport is retired: outward files are written in the session that does the work, and `scripts/gate_copy.mjs` enforces the property the channel existed for — every prose number traceable to the fact pack, every artifact's bytes unchanged — instead of checking the identity of the author.
### Fixed
- The largest non-fusion failure class on the measured machine is no longer silent, and the second seam is no longer unverified code.
### Notes
- P-0011, P-0012 and P-0013 are `tested`, not `verified`. P-0011 and P-0013 live on a seam a live journal witnesses only when a turn fails in a class this plugin retries, and the retry budget defaults to 0; P-0012 is a build-side gate.
- `agent/pre-step` is deliberately **not** mounted. The upstream contract is that a rejected `PreStepDecision` opens no step, but nobody has measured what a user sees when a plugin rejects one, so mounting a refusal would be guessing.
- The `withdrawn` counter was measured unreachable on this host: 0 of 24 329 persisted attempt streams carry a provable fusion inside a `block-end`, and `rolled-back` needs exactly that. Blind spot `BS-14` records it.
- This release was published on 2026-11-12 and is the registry `latest` for both packages; `0.3.7` is the release before it.

## [0.3.7] - 2026-11-12
### Added
- P-0010: the packaged `README.md` — the page npm renders — documented `scan` as `<session.jsonl> [--json] [--out <file>]` and the CLI's own usage said `<session.jsonl|session.v4.jsonl.zstd>` with the same missing flags, while the binary has accepted a directory, `--since` and `--max-files` since 0.3.3. Both strings now carry the identical line and `tests/unit/cli-usage.test.ts` fails if they ever differ again.
### Changed
- The four per-command descriptions were condensed to one line each, which took the emitted `cli-args.js` from 3086 to 2972 bytes and the plugin total from 67997 to 67883, so the byte ceiling with three bytes of headroom became a ceiling with 117.
### Notes
- P-0010 is `tested` and not `verified`, because a usage string is not a resident seam, and that `0.3.7` is the registry `latest` while `0.3.6` is the release before it. The whole `MALFORMED_RESPONSE` corpus on one host was replayed through the built engine (47 turns, 39 repaired, 8 refused, none unparsable) and a 300000-case generated stress pass found no unparsable dispatch, no duplicate id and no lost tool name.

## [0.3.6] - 2026-11-11
### Added
- P-0009: a windowed `scan --since` over a real session directory reported `unreadable_lines=78` for 78 files, because every session opens with a `session` header whose instant is the top-level `createdAt` rather than `time` and the scanner required `time` before it would apply the window, so it called the one reliably dated line in the log unreadable. The header now falls back to `createdAt`, the same command went to `unreadable_lines=0` with the same `attempts=67`, and an ordinary event with no instant is still counted unreadable. P-0009 landed at 67997 of 68000 emitted bytes.
### Changed
- Documentation blocks in `session-scan.ts` were condensed to keep the emitted plugin within the 68000 byte ceiling without raising the cap.
### Notes
- P-0009 is `tested` and not `verified` because, like P-0004 and P-0006, it moves an offline reader, and that `0.3.6` is published and is the registry `latest` for both packages, with `0.3.5` the release before it.

## [0.3.5] - 2026-11-11
### Added
- P-0008: a sixth gate, `scripts/gate_size.mjs`, measures `packages/plugin/dist/*.js` on every run and checks four things: the plugin total against 68000 bytes, `repair-stream.js` against 28000, `session-scan.js` against 14000, and any file above 10000 bytes for having a cap of its own; before this, the budget lived only in prose and had no mechanism.
### Changed
- `node scripts/gate.mjs --mutate` now checks six gates and reports 6 of 6 gates caught their injected violation, with the negative control comparing the measured total against a cap one byte below it.
### Notes
- Measured when the gate was written: 67908 bytes in total, `repair-stream.js` 27925, `session-scan.js` 13237, `cli.js` 8503; P-0008 is `tested`, not `verified`, because it is a build-side gate with no resident seam; this release `0.3.5` is published and is the registry `latest` for both packages, so the 0.3.5 section is the shipped one; `0.3.4` becomes the previous release and `0.3.3` the one before it; `0.3.6` is now published and is the `latest`, so the 0.3.6 section is the shipped one and the 0.3.5 section is the release before it.

## [0.3.4] - 2026-11-11
### Added
- P-0006: `scan` now counts how every turn ended (`completed`, `max_tokens`, `aborted`, `error`) and names every `reason.error.code`, where before it counted only the `MALFORMED_RESPONSE` turns and dropped every other ending, so the largest failure classes were invisible in the report meant to map them. Of 293 turns, 94 completed, 88 `max_tokens`, 100 error and 11 aborted, and the error codes `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, `INVALID_REQUEST` 1.
- P-0007: the copy channel could not regenerate the two longest outward files at all and printed only `copy_with_agy: agy exited null`, because the whole request travelled on one Windows command line once the fact pack grew (35509 characters for the changelog and 33530 for the readme, against a 32767 character cap — the spawn failed with `ENAMETOOLONG` before agy started and reported a null status), and because a generation that outlived the 600000 ms spawn timeout was killed and reported the same null status. Above the cap the prompt now travels over stdin as one `stream-json` user event, the answer is read from the final `result` event, a failed spawn is reported by its own code instead of a null status, and the timeout is half an hour; this is the build-side channel and touches no seam.
### Changed
- The census was first written as a separate module, the plugin `dist` then overshot the 68000 byte ceiling at 70389 bytes, and the module was deleted and its helpers inlined so the total settled at 67908 bytes — the scaffolding of a ninth file costs more than the code it holds.
### Notes
- A census is reported and never promoted into a finding (the exit code still turns on `fused_calls` and `fusion_failures`); P-0006 is `tested` and not `verified` because it moves an offline reader; truncated turns stay unfixed on purpose; this release `0.3.5` is published and is the registry `latest` for both packages, so the 0.3.5 section is the shipped one; `0.3.4` becomes the previous release and `0.3.3` the one before it; `0.3.6` is now published and is the `latest`, so the 0.3.6 section is the shipped one and the 0.3.5 section is the release before it.

## [0.3.3] - 2026-11-10
### Added
- P-0004: `scan` reads the log it is pointed at (a single session file or a whole session directory, plain `.jsonl` or multi-frame `.jsonl.zstd` through the same reader the plugin ships), keeps one auditable row per file, supports `--since`, reports the events it dropped as `before_since` instead of hiding them, and turns one undecompressable file into a failure line and a non-zero exit instead of a silent zero report.
- The redaction fix: a home path escaped with one or two backslashes, and a DSH session directory that encodes the same path, are now matched, and a measured pass rewrote three already recorded artifacts while leaving `produced_by` and `generated_at` untouched.
### Changed
- The seam split continues: the scan command and the argument plumbing move into their own modules because `dist/*.js` crossed the budget again.
### Fixed
- The same installable-manifest property carried forward.
### Notes
- P-0004 is `tested`, not `verified`, because it changes an offline reader and a redaction rule rather than the resident `llm/stream` seam, so no journal can attest it; and that this release is now published and is the registry `latest` for both packages, while the previous one (0.3.2) stays listed as superseded.

## [0.3.2] - 2026-11-10
### Added
- P-0005: a tool call whose single member value was written without a quote is resealed instead of being thrown away, but only when exactly one segment reproduces the whole text as one plain object whose payload round-trips byte for byte; the call keeps its own id and name, nothing is synthesized, and the stream-wide `maxCalls` budget is not consumed. A ninth counter `resealed` is added and is optional in the type on purpose, so a counter object recorded by an older build still prints its original line, and a stream whose only defect was a reseal reads `repaired` and never `quiet`.
### Changed
- The seam split: the stream types and the failure helpers move into their own modules, because `dist/*.js` crossed the byte ceiling after P-0005.
### Fixed
- The installable manifest, carried over from 0.3.1, so 0.3.2 is the first release that both installs and reseals.
### Notes
- P-0005 is `tested`, not `verified`, because no live host has produced the bare-value shape yet, and that 0.3.1 never reached the registry, because `publish_packages.mjs` was still being hardened when 0.3.2 took its place.

## [0.3.1] - 2026-11-10
### Fixed
- `dsh-remedy@0.3.0` reached the registry with a literal `workspace:*` dependency because npm published the raw workspace manifest, so every install failed with `EUNSUPPORTEDPROTOCOL`; the same code was repacked from a tarball that `pnpm pack` produced, where the protocol is rewritten to the exact `dsh-remedy-core` version.
### Notes
- No code changed, the tarball is the same size, the defect was in the published manifest only, and `scripts/publish_packages.mjs` now packs and checks the manifest before it publishes, so this cannot ship again. 0.3.1 was superseded by 0.3.2 before it reached the registry.

## [0.3.0] - 2026-11-10
### Added
- P-0003: two new counters, `refused` (seen and correctly rejected, never repairable) and `withdrawn` (repairable but given up), so the counter line carries eight names while the four verdict words stay unchanged.
### Changed
- A pure refusal no longer increments `fused`, which closes blind spot `BS-12`, and `unrepaired` now means exactly one thing: a fusion was proven and was not repaired.
### Fixed
- A budget refusal also raises `unrepaired` so a refused-but-unrepaired stream never reads `repaired`; an abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`; a truncation raises `withdrawn` and never `fused`.
### Notes
- P-0003 moved from `tested` to `verified` on 2026-11-10, when a headless run with a small `maxCalls` refused a real fusion and the journal wrote `refused=1`; that P-0002 moved from `tested` to `verified` the same day, when a headless run repaired a real two-call fusion and the synthesized call was dispatched and answered; that `dsh-remedy-core` moves to 0.3.0 with the same engine, and that the package size moved from the 0.2.0 tarball (19569 bytes compressed, 64933 bytes unpacked) to the 0.3.0 tarball (22418 bytes compressed, 74014 bytes unpacked).

## [0.2.0] - 2026-11-10
### Added
- P-0002: an empty tool name is rejected (`missing-name`), a tool name that changes inside one index aborts the rescue (`name-changed`), a repaired `finish` keeps the adapter `replayState`, and a `block-end` repair is held until the tool-call phase ends.
### Changed
- Package slimming: sourcemaps are no longer shipped.
### Fixed
- The per-stream `maxCalls` ceiling; a withdrawn repair returns its calls to the budget; a synthesized call now opens its own block instead of a bare `block-end`; a `max-tokens` stream is counted as truncated rather than as an unrepaired fusion; a passed-through provider error is counted instead of reporting zero errors; and a non-string `argumentsDelta` no longer concatenates text.
### Notes
- P-0002 is `tested`, not `verified`, and that `dsh-remedy-core` moves to 0.2.0 with the same engine.

## [0.1.1] - 2026-11-10
### Fixed
- The published 0.1.0 tarball omitted the fixtures, so `dsh-remedy verify` failed from an installed copy; 0.1.1 ships `fixtures/` and the CLI resolves them from the package.
### Notes
- Version 0.1.1 applies to `dsh-remedy`; `dsh-remedy-core` remains at 0.1.0.
