Write the GitHub release notes for `dsh-remedy` version `0.3.8`.

This text is pasted onto a GitHub release page, not stored in the repository, so
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

- Take every number from FACTS. The version is `0.3.8`, published, and the
  registry `latest` for both packages; `0.3.7` is the previous release. Do not
  call `0.3.8` prepared, pending or unreleased.
- "Added" covers three things:
  1. P-0011: the plugin's second seam, `agent/request-error`, had **no test at all**
     since 0.2.0, called `next()` and then overrode the answer it got back, and kept
     its retry budget in a map that was never pruned. It now follows the runtime's
     own documented contract (`{ kind: 'retry' }` is returned **without** calling
     `next()`; an unowned decision returns `next()`), and the budget is a bounded
     cache of 256 entries. Nine tests pin it.
  2. P-0013: 37 turns on one machine died with `UNSUPPORTED_REASONING_EFFORT`
     (`provider ... does not support reasoning effort "xhigh"`) and nothing in the
     journal said so, because `llm/stream` only runs after a request is dispatched.
     Those classes are now named once per step and code, and a pure preflight
     (`ok` / `refuse` / `unknown` plus a suggested level) can answer whether an
     configured effort will be refused before a token is spent. It reports a
     suggestion and never silently downgrades.
  3. `dsh-remedy explain`: a new CLI command that prints, per failure class, how
     often this machine hit it, which patch covers it, and whether that patch is
     switched on in the named profile.
- "Changed" is P-0012: the byte budget was one number describing two load paths
  (`residency` = modules a mounted plugin loads, `cli` = modules only a command
  loads). It is now three checks — residency, cli, total — and every emitted module
  must belong to exactly one of them; a governance test walks the real module graph
  so moving a file into the cheaper half cannot pay for growth.
- "Fixed" is that the largest non-fusion failure class on the measured machine is
  no longer silent, and that the second seam is no longer unverified code.
- "Package size" quotes the published 0.3.8 tarballs exactly as FACTS gives them,
  both plugin and core, with the shasum.
- "Notes" says what is still `tested` rather than `verified` and why, states that
  `agent/pre-step` is deliberately **not** mounted because nobody has measured what
  a user sees when a plugin rejects a step, and states that the `withdrawn`
  counter was measured unreachable on this host (0 of 24 329 streams can hold a
  proven fusion in a `block-end`).
- No emoji, no exclamation marks, no marketing adjectives.
- Do not invent a benchmark, a user count, a date or a version that FACTS does not
  carry.
