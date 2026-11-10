# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.3.0] - 2026-11-10

### Added
- P-0003: two new counters, `refused` (seen and correctly rejected, never repairable) and `withdrawn` (repairable but given up), so the counter line carries eight names while the four verdict words stay unchanged.

### Changed
- A pure refusal no longer increments `fused`, which closes blind spot `BS-12`, and `unrepaired` now means exactly one thing: a fusion was proven and was not repaired.

### Fixed
- A budget refusal also raises `unrepaired` so a refused-but-unrepaired stream never reads `repaired`; an abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`; a truncation raises `withdrawn` and never `fused`.

### Notes
- P-0003 is `tested`, not `verified`.
- `dsh-remedy-core` moves to 0.3.0 with the same engine.
- The package size moved from the 0.2.0 tarball (19569 bytes compressed, 64933 bytes unpacked) to the 0.3.0 tarball (22418 bytes compressed, 74014 bytes unpacked).

## [0.2.0] - 2026-11-10

### Added
- P-0002: an empty tool name is rejected (`missing-name`), a tool name that changes inside one index aborts the rescue (`name-changed`), a repaired `finish` keeps the adapter `replayState`, and a `block-end` repair is held until the tool-call phase ends.

### Changed
- Package slimming: sourcemaps are no longer shipped.

### Fixed
- The per-stream `maxCalls` ceiling; a withdrawn repair returns its calls to the budget; a synthesized call now opens its own block instead of a bare `block-end`; a `max-tokens` stream is counted as truncated rather than as an unrepaired fusion; a passed-through provider error is counted instead of reporting zero errors; and a non-string `argumentsDelta` no longer concatenates text.

### Notes
- P-0002 is `tested`, not `verified`.
- `dsh-remedy-core` moves to 0.2.0 with the same engine.

## [0.1.1] - 2026-11-10

### Fixed
- The published 0.1.0 tarball omitted the fixtures, so `dsh-remedy verify` failed from an installed copy; 0.1.1 ships `fixtures/` and the CLI resolves them from the package.

### Notes
- Version 0.1.1 applies to `dsh-remedy`; `dsh-remedy-core` remains at 0.1.0.

## [0.1.0] - 2026-11-09

### Added
- The `llm/stream` wrapper, the splitter, the CLI commands, the session scanner, the multi-frame zstd reader, the four gates.

### Fixed
- P-0001 tool-call fusion; the synchronous-waterfall regression found on the first real mount.

### Verified
- Headless verification on profile `remedy-live`: 2 runs, 10 streams observed, 1 fused call, 1 repaired, 0 unrepaired, 5 tool calls, 5 tool results, and `completed` turn outcome.
- Evidence recorded in `data/results/live-2026-11-09T17-00-00.000Z.json`.

### Notes
- First release, published to npm for both packages (`dsh-remedy` and `dsh-remedy-core`).
- Limits are documented in `audit/blind_spots.json`.
- No retry-as-fix: `retryOnMalformed` defaults to 0.
- No asar patching.
