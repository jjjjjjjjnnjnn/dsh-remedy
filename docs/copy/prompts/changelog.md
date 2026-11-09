Write the public `CHANGELOG.md` for `dsh-remedy`.

Use Keep a Changelog structure and Semantic Versioning.

Required shape:

```
# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-11-09
### Added
### Fixed
### Verified
### Notes
```

Rules:

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
