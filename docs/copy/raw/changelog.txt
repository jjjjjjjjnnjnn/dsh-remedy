# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]
### Added
- P-0014: the project's own description became an assertion. Three statements about this repository were false while every gate was green: the fact pack said the published `0.3.8` plugin pins `dsh-remedy-core` `0.3.7` (the tarball, and the registry, pin `0.3.8`), the handoff quoted a hash for a registry snapshot that hashes differently, and the package README that npm renders still documented four commands after `explain` shipped. Three governance tests now check the claims instead of the shape of the claims: the fact pack's version, pin, previous-release and patch-id statements against the manifests, the change log and the registry; the handoff's evidence index against the files it cites (and the batch sections stay dated records that may quote the stamp of that day); and the packaged README's usage block against the CLI's own block, line for line. Blind spots `BS-15` and `BS-16` close, and `BS-13` narrows to the package README's prose outside the CLI block.
- P-0015: `agent/pre-step` was left unmounted since R20 on a sentence nobody had checked — a rejected step "could read as a cancellation". It does not: the runtime claims the batch, awaits the waterfall, and on a rejection closes the turn with `reason.kind "blocked"`, and a probe on an isolated `DSH_HOME` produces a session with eight events and no step at all. What the `reject` **does** cost is measured too: the claimed input is discarded, so a user who retries has to retype the message, and the CLI exits `1`. `scripts/record_prestep_probe.mjs` records that as an artifact, and the seam is now usable but not yet presentable, because the desktop rendering of `blocked` is still unmeasured.
- `dsh-remedy` records the freezing of a published release record: `copy_record.mjs --freeze` turns an existing entry into a frozen one, keeping its recorded bytes, and refuses to freeze an entry whose bytes on disk have drifted from what the manifest records.
### Changed
- P-0016: `dsh-remedy explain` kept its own `COVERAGE` and `SWITCHES` tables for "which patch covers this failure class", so the registry had a second home for one claim and the only mechanism against drift was a person comparing two files. The patches now carry `failureClasses` and `switchKey`, the command reads `PATCHES`, and `tests/governance/coverage-single-source.test.ts` fails if the tables return. The printed table is unchanged.
### Changed
- P-0019: `README.md` and `README.zh-CN.md` described a single-seam repair layer while the project had become a patch set of eighteen defects, and they still said `agent/pre-step` was unmounted because nobody had measured what a rejection does — R23 had measured exactly that. Both pages now open as a patch set, carry a seam classification table, and replace the guess with P-0015 measurement plus the blind spot it leaves (`BS-17`). The status section names three `verified` and fifteen `tested` patches, and says the five after `0.3.8` are merged but unreleased.
- The two package READMEs, which npm renders, now explain the split: installing the plugin installs the engine because the pin is exact, and the engine is its own package because it does no I/O and can be embedded and tested alone. Their descriptions were re-registered through the copy channel so `gate_copy` compares them with both manifests.
### Fixed
- P-0018: `node scripts/publish_packages.mjs` printed `npm exited 3221226505` and left it there. That number is Windows `0xC0000409`, raised before npm spoke to the registry at all — both debug logs for the 0.3.6 attempt stop after the tarball notice with no HTTP request — so the message sent the operator hunting for a credentials problem that did not exist. `3221226505` and `3221225477` are now named for what they are, and the advice says the direct `npm publish <tarball>` call is what succeeded.
- P-0017: the two pages npm renders, `packages/plugin/README.md` and `packages/core/README.md`, had no mechanism at all — hand-written, no `output_sha256`, invisible to the copy gate. The exposure was measured before a guard was written: 2331 bytes on the plugin page and zero prose numbers, so the number rule had nothing to rot there. `tests/governance/package-readme-prose.test.ts` now reuses the copy channel's own stripping rule, requires zero prose numbers on both pages, and requires every fenced `dsh-remedy <command>` to be one the CLI dispatches.
- The emitted plugin's comment change costs 68 bytes and no cap moved: residency `41143` of `44000`, CLI `40665` of `42000`, total `81808` of `83000`. The published `0.3.8` tarball remains `81740` of those bytes, so the README states both rather than quietly replacing one.
### Notes
- P-0014 through P-0019 are `tested` and not `verified`: they touch prose and manifests, measure a seam on an isolated profile, move a table into the registry, guard two hand-written pages, name a Windows exit code, and rewrite the outward pages. None is released on its own; all will ride with the next version.

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
