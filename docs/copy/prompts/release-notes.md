Write the GitHub release notes for `dsh-remedy` version `0.3.7`.

This text is pasted into a GitHub release page, not a file in the repository, so
it may be shorter than the changelog but it must be exactly as honest.

Required shape:

```
## dsh-remedy <version>

### Added

### Changed

### Fixed

### Package size

### Notes
```

Rules:

- Take every number from FACTS. The version is `0.3.7`, published, and the
  registry `latest` for both packages; `0.3.6` is the previous release. Do not
  call `0.3.7` prepared, pending or unreleased.
- "Added" is P-0010: the packaged `README.md` — the page npm renders — documented
  `scan` as `<session.jsonl> [--json] [--out <file>]` and the CLI's own usage said
  `<session.jsonl|session.v4.jsonl.zstd>`, while the binary has accepted a
  directory, `--since` and `--max-files` since 0.3.3. Say both strings now carry
  the identical line and that `tests/unit/cli-usage.test.ts` fails if they ever
  diverge again or if the one-file-only shape returns.
- "Changed" is the byte work: the four per-command descriptions were condensed to
  one line each so the longer flag list paid for itself, taking the emitted
  `cli-args.js` from 3086 to 2972 bytes and the plugin total from 67997 to 67883
  under an unchanged 68000 byte ceiling.
- "Fixed" is that the `scan` documentation no longer describes a CLI that has not
  existed since 0.3.3, on the page strangers read first.
- "Package size" quotes the published 0.3.7 tarballs exactly as FACTS gives them,
  both plugin and core, with the shasum.
- "Notes" says P-0010 is `tested` and not `verified` (a usage string is not a
  resident seam), records the 0.3.7 live run that repaired a real fusion on this
  host, and records the two corpus measurements: every `MALFORMED_RESPONSE` turn
  on one host replayed through the built engine, and the generated stress pass.
  State plainly that the `withdrawn` counter cannot move on this host and why.
- No emoji, no exclamation marks, no marketing adjectives, no "blazing fast".
- Do not invent a benchmark, a user count, a star count or a date that FACTS does
  not carry.
