Write the public `CHANGELOG.md` for `dsh-remedy`.

Use Keep a Changelog structure and Semantic Versioning.

Required shape:

```
# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.3.8] - 2026-11-12
### Added
### Changed
### Fixed
### Notes

## [0.3.7] - 2026-11-12
### Added
### Changed
### Notes

## [0.3.6] - 2026-11-11
### Added
### Changed
### Notes

## [0.3.5] - 2026-11-11
### Added
### Changed
### Notes

## [0.3.4] - 2026-11-11
### Added
### Changed
### Notes

## [0.3.3] - 2026-11-10
### Added
### Changed
### Fixed
### Notes

## [0.3.2] - 2026-11-10
### Added
### Changed
### Fixed
### Notes

## [0.3.1] - 2026-11-10
### Fixed
### Notes

## [0.3.0] - 2026-11-10
### Added
### Changed
### Fixed
### Notes

## [0.2.0] - 2026-11-10
### Added
### Changed
### Fixed
### Notes

## [0.1.1] - 2026-11-10
### Fixed
### Notes
```

Rules:

- The newest section is `0.3.8` and it is **the shipped one**: `0.3.8` is
  published and is the registry `latest` for both packages, so nothing may call it
  pending, and `0.3.7` is the release before it. Its Added entries are three:
  P-0011, that the second seam `agent/request-error` had **no test at all** since
  0.2.0 and called `next()` before overriding the answer, which the runtime's own
  documentation forbids (a handler returns `{ kind: 'retry' }` **without** calling
  `next()`), plus a retry budget that grew by one entry per step forever and is now
  a bounded cache of 256; P-0013, that 37 turns on one machine died with
  `UNSUPPORTED_REASONING_EFFORT` and the journal said nothing because
  `llm/stream` only runs after a request is dispatched, so those classes are now
  named once per step and code and a pure preflight answers whether a configured
  effort will be refused before a token is spent; and `dsh-remedy explain`, which
  prints per failure class how often this machine hit it, which patch covers it and
  whether that patch is switched on in the named profile. Its Changed entry is
  P-0012: the byte budget was one number describing two load paths, and is now
  three checks (residency, cli, total) with a module-graph test that refuses a file
  moved into the cheaper half. Its Notes entry is that all three are `tested` and
  not `verified`, that `agent/pre-step` is deliberately not mounted because
  nobody has measured what a user sees when a plugin rejects a step. Also record
  that the whole `MALFORMED_RESPONSE` corpus on one host was replayed through the
  built engine (47 turns, 39 repaired, 8 refused, none unparsable) and that a
  300000-case generated stress pass found no unparsable dispatch, no duplicate id
  and no lost tool name.
- Keep a `0.3.7` section below it (Add P-0010, the packaged README and the CLI usage text), then the `0.3.6` section below that, with only `Added`,
  `Changed` and `Notes` subsections. Its Added entry is P-0009: a windowed
  `scan --since` over a real session directory reported `unreadable_lines=78`
  for 78 files, because every session opens with a `session` header whose
  instant is the top-level `createdAt` rather than `time` and the scanner
  required `time` before it would apply the window, so it called the one
  reliably dated line in the log unreadable. Say the header now falls back to
  `createdAt`, that the same command went to `unreadable_lines=0` with the same
  `attempts=67`, and that an ordinary event with no instant is still counted
  unreadable. Note that P-0009 landed at 67997 of 68000 emitted bytes. Its
  Notes entry is that P-0009 is `tested` and not `verified` because, like
  P-0004 and P-0006, it moves an offline reader, and that `0.3.6` is published
  and is the registry `latest` for both packages, with `0.3.5` the release
  before it.
- Add a `0.3.4` section above `0.3.3`, with only `Added`, `Changed` and `Notes`
  subsections. Its Added entry is P-0006: `scan` now counts how every turn ended
  (`completed`, `max_tokens`, `aborted`, `error`) and names every
  `reason.error.code`, where before it counted only the `MALFORMED_RESPONSE`
  turns and dropped every other ending, so the largest failure classes were
  invisible in the report meant to map them. Give the measured census exactly
  once, from FACTS: of 293 turns, 94 completed, 88 `max_tokens`, 100 error and
  11 aborted, and the error codes `MALFORMED_RESPONSE` 44,
  `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1,
  `MISSING_CREDENTIAL` 1, `INVALID_REQUEST` 1. Its Changed entry is that the
  census was first written as a separate module, that the plugin `dist` then
  overshot the 68000 byte ceiling at 70389 bytes, and that the module was
  deleted and its helpers inlined so the total settled at 67908 bytes — say
  plainly that the scaffolding of a ninth file costs more than the code it
  holds. Its Notes entry is that a census is reported and never promoted into a
  finding (the exit code still turns on `fused_calls` and `fusion_failures`),
  that P-0006 is `tested` and not `verified` because it moves an offline
  reader, that truncated turns stay unfixed on purpose, and that this release
  `0.3.5` is published and is the registry `latest` for both packages, so the
  0.3.5 section is the shipped one; `0.3.4` becomes the previous release and
  `0.3.3` the one before it; `0.3.6` is now published and is the `latest`, so the
  0.3.6 section is the shipped one and the 0.3.5 section is the release before it.
  Its Added entry is P-0007: the copy channel could not regenerate the
  two longest outward files at all and printed only `copy_with_agy: agy exited
  null`, because the whole request travelled on one Windows command line once
  the fact pack grew (35509 characters for the changelog and 33530 for the
  readme, against a 32767 character cap — the spawn failed with `ENAMETOOLONG`
  before agy started and reported a null status), and because a generation that
  outlived the 600000 ms spawn timeout was killed and reported the same null
  status. Above the cap the prompt now travels over stdin as one `stream-json`
  user event, the answer is read from the final `result` event, a failed spawn is
  reported by its own code instead of a null status, and the timeout is half an
  hour. State that this is the build-side channel and touches no seam.
- Add a `0.3.3` section above `0.3.2`. Its Added entry is P-0004: `scan` reads the
  log it is pointed at (a single session file or a whole session directory,
  plain `.jsonl` or multi-frame `.jsonl.zstd` through the same reader the plugin
  ships), keeps one auditable row per file, supports `--since`, reports the
  events it dropped as `before_since` instead of hiding them, and turns one
  undecompressable file into a failure line and a non-zero exit instead of a
  silent zero report. Its second Added entry is the redaction fix: a home path
  escaped with one or two backslashes, and a DSH session directory that encodes
  the same path, are now matched, and a measured pass rewrote three already
  recorded artifacts while leaving `produced_by` and `generated_at` untouched.
  Its Changed entry is that the seam split continues: the scan command and the
  argument plumbing move into their own modules because `dist/*.js` crossed the
  budget again. Its Fixed entry is the same installable-manifest property
  carried forward. Its Notes entry is that P-0004 is `tested`, not `verified`,
  because it changes an offline reader and a redaction rule rather than the
  resident `llm/stream` seam, so no journal can attest it; and that this release
  is now published and is the registry `latest` for both packages, while the
  previous one (0.3.2) stays listed as superseded.
- Add a `0.3.2` section above `0.3.1`. Its Added entry is P-0005: a tool call whose
  single member value was written without a quote is resealed instead of being
  thrown away, but only when exactly one segment reproduces the whole text as one
  plain object whose payload round-trips byte for byte; the call keeps its own id
  and name, nothing is synthesized, and the stream-wide `maxCalls` budget is not
  consumed. A ninth counter `resealed` is added and is optional in the type on
  purpose, so a counter object recorded by an older build still prints its original
  line, and a stream whose only defect was a reseal reads `repaired` and never
  `quiet`. Its Changed entry is the seam split: the stream types and the failure
  helpers move into their own modules, because `dist/*.js` crossed the byte ceiling
  after P-0005. Its Fixed entry is: the installable manifest, carried over from
  0.3.1, so 0.3.2 is the first release that both installs and reseals. Its Notes
  entry is that P-0005 is `tested`, not `verified`, because no live host has
  produced the bare-value shape yet, and that 0.3.1 never reached the registry,
  because `publish_packages.mjs` was still being hardened when 0.3.2 took its place.
- Add a `0.3.1` section above `0.3.0`. Its Fixed entry is: `dsh-remedy@0.3.0`
  reached the registry with a literal `workspace:*` dependency because npm
  published the raw workspace manifest, so every install failed with
  `EUNSUPPORTEDPROTOCOL`; the same code was repacked from a tarball that
  `pnpm pack` produced, where the protocol is rewritten to the exact
  `dsh-remedy-core` version. Its Notes entry is: no code changed, the tarball is
  the same size, the defect was in the published manifest only, and
  `scripts/publish_packages.mjs` now packs and checks the manifest before it
  publishes, so this cannot ship again. Say plainly that 0.3.1 was superseded by
  0.3.2 before it reached the registry.
- Add a `0.3.0` section above `0.2.0`. Its Added entry is P-0003: two new counters,
  `refused` (seen and correctly rejected, never repairable) and `withdrawn`
  (repairable but given up), so the counter line carries eight names while the
  four verdict words stay unchanged. Its Changed entry is that a pure refusal no
  longer increments `fused`, which closes blind spot `BS-12`, and that
  `unrepaired` now means exactly one thing: a fusion was proven and was not
  repaired. Its Fixed entry is: a budget refusal also raises `unrepaired` so a
  refused-but-unrepaired stream never reads `repaired`; an abandoned stream keeps
  `fused` and `unrepaired` and also raises `withdrawn`; a truncation raises
  `withdrawn` and never `fused`. Its Notes entry is that P-0003 moved from
  `tested` to `verified` on 2026-11-10, when a headless run with a small `maxCalls`
  refused a real fusion and the journal wrote `refused=1`; that P-0002 moved from
  `tested` to `verified` the same day, when a
  headless run repaired a real two-call fusion and the synthesized call was
  dispatched and answered; that `dsh-remedy-core` moves to 0.3.0 with the same
  engine, and that the package size moved from the 0.2.0 tarball to the 0.3.0
  tarball.
- Add a `0.2.0` section above `0.1.1`. Its Added entry is P-0002: an empty tool
  name is rejected (`missing-name`), a tool name that changes inside one index
  aborts the rescue (`name-changed`), a repaired `finish` keeps the adapter
  `replayState`, and a `block-end` repair is held until the tool-call phase ends.
  Its Changed entry is the package slimming: sourcemaps are no longer shipped.
  Its Fixed entry is: the per-stream `maxCalls` ceiling; a withdrawn repair returns
  its calls to the budget; a synthesized call now opens its own block instead of
  a bare `block-end`; a `max-tokens` stream is counted as truncated rather than as
  an unrepaired fusion; a passed-through provider error is counted instead of
  reporting zero errors; and a non-string `argumentsDelta` no longer concatenates
  text. Its Notes entry is that P-0002 is `tested`, not `verified`, and that
  `dsh-remedy-core` moves to 0.2.0 with the same engine.
- Do not bump the tests/gates counts by hand: use the FACTS numbers.
- Add a `0.1.1` section above `0.1.0`. Its Fixed entry is: the published 0.1.0
  tarball omitted the fixtures, so `dsh-remedy verify` failed from an installed
  copy; 0.1.1 ships `fixtures/` and the CLI resolves them from the package.
- `0.1.0` is the first release and is published to npm for both packages; say so
  under Notes, not under Added.- Added: the `llm/stream` wrapper, the splitter, the CLI commands, the session
  scanner, the multi-frame zstd reader, the four gates.
- Fixed: P-0001 tool-call fusion; the synchronous-waterfall regression found on
  the first real mount.
- Verified: the real headless run numbers and the evidence path from FACTS.
- Notes: limits are documented in `audit/blind_spots.json`; no retry-as-fix; no
  asar patching.
- Use only numbers from FACTS.
- Output only the Markdown file, under 95 lines.
