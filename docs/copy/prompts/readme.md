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
- "Install": 0.3.1 is the version to install. Show
  `dsh plugin --profile <name> add dsh-remedy@0.3.1` first and
  `pnpm add dsh-remedy@0.3.1 dsh-remedy-core@0.3.1` second. State plainly, in
  one short note, that 0.3.0 of the plugin cannot be installed from the registry
  because npm published its raw workspace manifest with a literal `workspace:*`
  dependency, and that 0.3.1 ships the same code from a pnpm-packed tarball. Keep
  the source workflow (clone, pnpm install, pnpm run verify) for contributors,
  clearly marked.
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
  and only the counter line grew to eight names.
- "What it does not do": a Markdown table with a row per limit from FACTS.
- "Verify it yourself": copy-pasteable commands and the real artifact path.
- "Status": 0.3.1 is the installable release of both packages (`dsh-remedy`
  and `dsh-remedy-core`), and 0.3.0 of the plugin is a broken release that the
  registry cannot install;
  P-0001, P-0002 and P-0003 are all `verified` on a real host (P-0001 on the
  headless profile and the desktop app, P-0002 on a 2026-11-10 headless run that
  repaired a real two-call fusion and saw the synthesized call dispatched, and
  P-0003 on a 2026-11-10 headless run whose journal wrote a non-zero `refused`
  after the code declined to repair a budget refusal). Do not hardcode a patch
  version; the npm badge is the version.
- Include one short paragraph or table listing the package size: the 0.3.1
  plugin tarball size, entries, unpacked size, the unpacked breakdown, the
  0.3.1 core tarball size, the sourcemaps that are no longer shipped, and the
  `dist/*.js` byte budget. Use only FACTS numbers.
- "Development": the exact commands from FACTS.
- Link to `README.zh-CN.md` near the top for Chinese readers.
- End with MIT and "not affiliated with DeepSeek".
- Keep the whole file under 220 lines.
