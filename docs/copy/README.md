# Copy channel

Externally visible text is written **in the session that does the work**, from a
fact pack, and then checked by `scripts/gate_copy.mjs` and
`tests/governance/public-copy.test.ts`.

## Why

A repair project's credibility rests on exact numbers. A README written from
memory is the easiest place for an unverified percentage to enter a repository
and the hardest place to notice it.

The channel used to send the fact pack to an external model and paste the answer
back. That indirection was a proxy: the model could not invent a number because
it was only given one. The proxy is retired — no external model is called any
more — but **the property it protected is not retired**, and it is now checked
directly instead of inferred from the author's identity. A file written in this
session is held to the same rule the external model was: every prose number must
come from the fact pack, and the bytes must not drift afterwards.

## Files

| Path | Role |
|---|---|
| `facts/public-repo-facts.md` | the only source of numbers and claims |
| `facts/oss-patterns.md` | structure notes from vitest and zustand, no copy |
| `prompts/*.md` | the requirements for each artifact (kept as the checklist, not as a model brief) |
| `raw/*.txt` | the exact draft that was registered |
| `manifest.json` | writer, timestamps, facts/output hashes, frozen records |
| `release-notes/` | the frozen body of each published GitHub release |
| `repo-metadata.json` | GitHub description, topics, release blurb, npm descriptions |

## Rules

1. Never edit a registered artifact by hand. Change the fact pack or the draft,
   then register again with `scripts/copy_record.mjs --force`.
2. An artifact may not contain a number that is absent from the fact pack
   (URLs, code blocks and inline code are excluded). A number the pack writes
   with a space (`24 329`) must be quoted the same way; `24329` is a different
   token and will be refused.
3. Every registered artifact has a manifest entry whose `output_sha256` matches
   the file. `gate_copy` fails when the bytes drift.
4. A stale fact pack (`facts_sha256` no longer matches) fails the entry, so a
   number change forces a re-registration instead of a silent mismatch.
5. A **frozen** entry is a published record — the GitHub release notes. It keeps
   the writer and fact pack it was published with, because rewriting a page that
   is already public is worse than carrying a stale hash. It must still match its
   own bytes.
6. A live entry records `writer: in-session`. The retired channel may only appear
   on a frozen row.
7. `metadata.json`'s `description` has a 160-character ceiling; changing it
   requires updating both `package.json` descriptions in the same commit, which
   `gate_copy` compares.

## Commands

```powershell
# 1. write the draft
#    .tmp/drafts/readme.md
# 2. register it (validates numbers and placeholders before writing anything)
node scripts/copy_record.mjs --name readme --out README.md --file .tmp/drafts/readme.md --force

# several targets at once, separated by <<<FILE: path>>> markers
node scripts/copy_record.mjs --name templates --split --file .tmp/drafts/templates.md --force

# 3. prove it
node scripts/gate_copy.mjs
```
