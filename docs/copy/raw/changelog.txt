# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.3.6] - 2026-11-11
### Added
- P-0009: a windowed `scan --since` over a real session directory reported `unreadable_lines=78` for 78 files, because every session opens with a `session` header whose instant is the top-level `createdAt` rather than `time` and the scanner required `time` before it would apply the window, so it called the one reliably dated line in the log unreadable. The header now falls back to `createdAt`, the same command went to `unreadable_lines=0` with the same `attempts=67`, and an ordinary event with no instant is still counted unreadable. P-0009 landed at 67997 of 68000 emitted bytes, so the plugin now sits three bytes under its ceiling and the next patch that adds code to `dist` must split a file instead of absorbing it.
### Changed
- Documentation blocks in `session-scan.ts` were condensed to keep the emitted plugin within the 68000 byte ceiling without raising the cap.
### Notes
- P-0009 is `tested` and not `verified` because, like P-0004 and P-0006, it moves an offline reader, and that this release `0.3.6` is published and is the registry `latest` for both packages, so the 0.3.6 section is the shipped one; `0.3.5` becomes the previous release and `0.3.4` the one before it.

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
