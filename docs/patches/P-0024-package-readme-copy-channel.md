# P-0024 — The two pages npm renders were outside the copy channel

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0017

## Symptom

`packages/plugin/README.md` and `packages/core/README.md` are the pages npm shows
for each package. They were hand-written and outside `docs/copy/manifest.json`:

- `scripts/gate_copy.mjs` iterated the manifest, and the manifest only held files at
  the repository root (plus the release notes and the templates);
- `tests/governance/package-readme-prose.test.ts` (P-0017) checked two things — no
  prose number, and every fenced `dsh-remedy` command is dispatchable — but not the
  bytes, not the fact-pack hash, and not the writer;
- `tests/unit/cli-usage.test.ts` pinned the CLI block line for line.

So the pages had a **partial** mechanism: their prose could not carry a stale digit
and their commands had to exist, but a sentence could still be edited into something
the code does not do, and nothing recorded which fact pack the page was written
against. That is the remaining half of blind spot `BS-13`.

## What was measured first

The copy channel's own number rule was run against both pages before they were
registered. Both contain **zero** prose numbers outside fences, inline code and URLs
(P-0017 measured the plugin page at 2331 bytes; it has grown since, and the answer is
still zero). So registering them is a bookkeeping change, not a rewrite: the bytes
`copy_record` writes are the bytes that were already on disk, plus the trailing
newline it always writes.

## What changed

1. `docs/copy/manifest.json` now has two live entries, `package-readme-plugin`
   (target `packages/plugin/README.md`, 2886 bytes) and `package-readme-core`
   (target `packages/core/README.md`, 1788 bytes), both written `in-session` and
   both citing the current fact pack.
2. `scripts/gate_copy.mjs`'s `covered` list now requires those two targets, so
   deleting either manifest entry turns the gate red. The entries are then checked
   like every other live entry: bytes, fact-pack hash, prose numbers, placeholder
   and writer.
3. `tests/governance/package-readme-prose.test.ts` stays as a second guard with a
   different criterion, and its comment now says so instead of claiming `gate_copy`
   cannot see the pages.

## What this does not do

- The copy gate checks numbers, bytes and provenance, **not truth**. A page can
  still describe behaviour the code does not have; the prose test's command check
  only covers fenced `dsh-remedy` commands.
- The pages are shipped inside the tarball. A change to them reaches npm only with
  a release; the manifest entry is checked in the repository, not against the
  published tarball.
- It does not regenerate the pages from a template. They remain hand-written prose
  that is now registered; a generated page is a different product decision.
- No live artifact is possible: this is a build-side channel, not a resident seam.

## Reproduction

```
node scripts/gate_copy.mjs                         # covered:packages/plugin/README.md, covered:packages/core/README.md
node --test tests/governance/package-readme-prose.test.ts
node scripts/copy_record.mjs --name package-readme-plugin --out packages/plugin/README.md \
  --file docs/copy/raw/package-readme-plugin.txt --force   # refuses a number the pack does not carry
```
