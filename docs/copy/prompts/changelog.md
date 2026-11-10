Write the public `CHANGELOG.md` for `dsh-remedy`.

Use Keep a Changelog structure and Semantic Versioning.

Required shape:

```
# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

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
  under Notes, not under Added.
- Added: the `llm/stream` wrapper, the splitter, the CLI commands, the session
  scanner, the multi-frame zstd reader, the four gates.
- Fixed: P-0001 tool-call fusion; the synchronous-waterfall regression found on
  the first real mount.
- Verified: the real headless run numbers and the evidence path from FACTS.
- Notes: limits are documented in `audit/blind_spots.json`; no retry-as-fix; no
  asar patching.
- Use only numbers from FACTS.
- Output only the Markdown file, under 80 lines.
