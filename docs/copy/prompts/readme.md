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
  block, give the measured sample numbers exactly once, and name the upstream
  discussion from FACTS.
- "Install": the npm package is published. Show
  `dsh plugin --profile <name> add dsh-remedy` first and
  `pnpm add dsh-remedy dsh-remedy-core` second. Keep the source workflow
  (clone, pnpm install, pnpm run verify) for contributors, clearly marked.
- "How it works": one short fenced sequence showing the measured chunk order and
  the repaired output. Explain the all-or-nothing rule.
- "Safety guarantees": a bullet list, one guarantee per line, each one already
  in FACTS.
- "What it does not do": a Markdown table with a row per limit from FACTS.
- "Verify it yourself": copy-pasteable commands and the real artifact path.
- "Status": 0.1.x is published to npm (`dsh-remedy` and `dsh-remedy-core`),
  verified on a headless profile and the desktop app. Do not hardcode a patch
  version; the npm badge is the version.
- "Development": the exact commands from FACTS.
- Link to `README.zh-CN.md` near the top for Chinese readers.
- End with MIT and "not affiliated with DeepSeek".
- Keep the whole file under 220 lines.
