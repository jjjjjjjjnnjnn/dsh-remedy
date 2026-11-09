# Copy channel

Externally visible text is not written by the engineering agent. It is generated
by `agy` with `gemini-3.8-flash-high` from a fact pack, then checked by
`scripts/gate_copy.mjs` and `tests/governance/public-copy.test.ts`.

## Why

A repair project's credibility rests on exact numbers. A README written from
memory is the easiest place for an unverified percentage to enter a repository
and the hardest place to notice it. The channel makes the number set explicit
and the provenance machine-checkable.

## Files

| Path | Role |
|---|---|
| `facts/public-repo-facts.md` | the only source of numbers and claims |
| `facts/oss-patterns.md` | structure notes from vitest and zustand, no copy |
| `prompts/*.md` | the brief for each artifact |
| `raw/*.txt` | the exact bytes `agy` returned |
| `manifest.json` | model, timestamps, facts/prompt/request/output hashes |
| `repo-metadata.json` | GitHub description, topics, release blurb, npm descriptions |

## Rules

1. Never edit a generated artifact by hand. Change the fact pack or the prompt,
   then regenerate with `--force`.
2. A generated artifact may not contain a number that is absent from the fact
   pack (URLs, code blocks and inline code are excluded from the check).
3. Every generated artifact has a manifest entry whose `output_sha256` matches
   the file. `gate_copy` fails when the bytes drift.
4. A stale fact pack (`facts_sha256` no longer matches) fails every entry, so a
   number change forces a regeneration instead of a silent mismatch.
5. Model is pinned: `gemini-3.8-flash-high`. The manifest records it per entry.

## Commands

```powershell
node scripts/copy_with_agy.mjs --name readme --prompt docs/copy/prompts/readme.md --out README.md --force
node scripts/copy_with_agy.mjs --name templates --prompt docs/copy/prompts/templates.md --split --force
node scripts/gate.mjs            # includes gate_copy
```

## What is not in this channel

- Code, tests, gates, configs and engineering docs: written by the engineering
  agent and reviewed like any other code.
- `LICENSE`: legal text, not copy.
- `CODE_OF_CONDUCT.md`: generated from Contributor Covenant 2.1 by the same
  channel because it is externally visible.
