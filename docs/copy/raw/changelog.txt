# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added
- The `llm/stream` wrapper buffering tool-call deltas and recovering fused calls on terminal error.
- Top-level JSON object splitter for concatenated tool call arguments.
- CLI commands: `dsh-remedy status`, `dsh-remedy repair`, `dsh-remedy scan`, and `dsh-remedy verify`.
- Session scanner for offline `.jsonl` session log analysis.
- Multi-frame zstd reader helper `decompressSessionLog` for log streams.
- The four gates: `ssot`, `registry`, `namespace`, and `step-review`.

### Fixed
- P-0001 tool-call fusion where multiple tool calls stream into one index.
- Synchronous-waterfall regression from the first real mount where an async listener broke stream iteration.

### Verified
- Headless verification on profile `remedy-live`: 2 runs, 10 streams observed, 1 fused call, 1 repaired, 0 unrepaired, 5 tool calls, 5 tool results, and `completed` turn outcome.
- Evidence recorded in `data/results/live-2026-11-09T17-00-00.000Z.json`.

### Notes
- Version 0.1.0 is the first release and is published to npm for both packages (`dsh-remedy` and `dsh-remedy-core`).
- Operating limits are documented in `audit/blind_spots.json`.
- No retry-as-fix: `retryOnMalformed` defaults to 0.
- No asar patching: operates at the runtime seam without modifying `app.asar`.
