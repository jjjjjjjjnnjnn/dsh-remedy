Write the public `README.md` for the open-source repository `dsh-remedy`.

Audience: (1) a DSH user who just saw the red `MALFORMED_RESPONSE` error, (2) a
developer deciding whether to install a resident repair plugin.

Voice: calm, concrete, engineering. Short sentences. No hype, no exclamation
marks, no "revolutionary", no "blazing fast". State limits as plainly as features.

Required structure (use these exact H2 headings):

```
# dsh-remedy

<badge row>

<one paragraph: what it is and why it is different>

## What it fixes
## Install
## How it works
## Safety guarantees
## What it does not do
## Verify it yourself
## Status
## Development
## Contributing
## Security
## License
```

Rules:

- Badges: CI status, npm version, MIT license, Node >= 22.19, and a static
  "status: verified" badge. Use the intended repository URL from FACTS.
- First screen must answer: what is it, what does it fix, how do I get it.
- "What it fixes": name the defect, show the failure signature in one fenced
  block, give the measured sample numbers exactly once (48 session files, 120
  `turn/end` events, 40 `MALFORMED_RESPONSE`, of which 37 are provable fusions),
  and name the upstream discussion from FACTS. The old 27-session sample must
  not appear.
- "Install": do not hardcode a version. Show
  `dsh plugin --profile <name> add dsh-remedy` first (npm resolves the latest
  published release) and `pnpm add dsh-remedy dsh-remedy-core` second. State
  plainly, in one short note, that 0.3.0 of the plugin cannot be installed from
  the registry because npm published its raw workspace manifest with a literal
  `workspace:*` dependency, that the published releases after it repair that
  manifest by shipping a pnpm-packed tarball, and that 0.3.1 was built with the
  same manifest fix but was superseded before it ever reached the registry.
  Keep the source workflow (clone, pnpm install, pnpm run verify) for
  contributors, clearly marked.
- "How it works": one short fenced sequence showing the measured chunk order and
  the repaired output. Explain the all-or-nothing rule.
- "Safety guarantees": a bullet list, one guarantee per line, each one already
  in FACTS. Cover the P-0001 guarantees, the P-0002 hardening ones (empty tool
  name rejected, name change aborts the rescue, `replayState` preserved, atomic
  `block-end` commit, per-stream `maxCalls`, consumer abort, a synthesized call
  opens its own `block-start`, a withdrawn repair returns its budget, `max-tokens`
  counted as truncated, a passed-through provider error counted in `errors`), and
  the P-0003 observability ones: a pure refusal raises `refused` and never
  `fused`; a budget refusal also raises `unrepaired` so a refused-but-unrepaired
  stream never reads `repaired`; an abandoned stream keeps `fused` and
  `unrepaired` and also raises `withdrawn`; the four verdict words are unchanged
  and only the counter line grew to eight names. Then the P-0005 reseal ones:
  a bare member value is quoted only when exactly one segment reproduces the
  whole text as one plain object with a byte-identical payload, the call keeps
  its own id and name, the reseal synthesizes nothing and does not consume the
  stream-wide `maxCalls` budget, zero or two-or-more candidates are refused
  instead of guessed, a stream whose only defect was a reseal reads `repaired`
  and never `quiet`, and the ninth counter `resealed` is optional in the type so
  a counter object recorded by an older build still renders its original line.
  Then the P-0004 ones: `scan` reads a multi-frame zstd log through the same
  reader the plugin ships, a directory scan keeps one row per file, `--since`
  reports what it dropped as `before_since` instead of hiding it, an
  undecompressable file is a failure line and a non-zero exit instead of a zero
  report, and a redaction matches a home path escaped with one or two
  backslashes as well as a session directory that encodes it.
- "What it does not do": a Markdown table with a row per limit from FACTS.
- Also mention `scan` once: it reads a single session file or a whole session
  directory, understands both plain `.jsonl` and multi-frame `.jsonl.zstd`, and
  reports one row per file with `--since` support.
- "Verify it yourself": copy-pasteable commands and the real artifact path.
- "Status": P-0001, P-0002 and P-0003 are all `verified` on a real host (P-0001
  on the headless profile and the desktop app, P-0002 on a 2026-11-10 headless
  run that repaired a real two-call fusion and saw the synthesized call
  dispatched, and P-0003 on a 2026-11-10 headless run whose journal wrote a
  non-zero `refused` after the code declined to repair a budget refusal).
  P-0005 and P-0004 are `tested`, not `verified`: both have unit tests, negative
  controls, and a measured fixture or a measured scan, but no live host run has
  produced the bare-value shape that P-0005 repairs, and P-0004 changes an
  offline reader rather than the resident seam. Name the release status from
  FACTS: the newest published release of both packages is the one FACTS names as
  `latest`, and the pending release is prepared but not published. Do not
  hardcode a patch version; the npm badge is the version.
- Include one short paragraph or table listing the package size: the published
  plugin tarball size, entries, unpacked size, the unpacked breakdown, the core
  tarball size, the sourcemaps that are no longer shipped, and the `dist/*.js`
  byte budget that P-0005 crossed, which is why the seam was split. Use only
  FACTS numbers, and do not invent a size for the pending release.
- "Development": the exact commands from FACTS.
- Link to `README.zh-CN.md` near the top for Chinese readers.
- End with MIT and "not affiliated with DeepSeek".
- Keep the whole file under 220 lines.
