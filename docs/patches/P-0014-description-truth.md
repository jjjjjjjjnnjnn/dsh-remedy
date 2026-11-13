# P-0014 — The project's own description is the part nothing checked

**Status**: `tested`  **Severity**: major  **Surface**: `scripts`  **Depends on**: P-0010

## Symptom

Three descriptions of this project said things that were not true, and all three
were green:

1. **The fact pack lied about what it describes.** `docs/copy/facts/public-repo-facts.md`
   said `its packed manifest pins "dsh-remedy-core": "0.3.7"` and `0.3.6` becomes the
   previous release. Measured:

   ```
   $ tar -xzOf .tmp/pack20/dsh-remedy-0.3.8.tgz package/package.json | grep dsh-remedy-core
       "dsh-remedy-core": "0.3.8"
   $ npm view dsh-remedy@0.3.8 dependencies
   { "dsh-remedy-core": "0.3.8" }
   ```

   The previous release was `0.3.7`, not `0.3.6`. `README.md` and `CHANGELOG.md`
   both said so, so the repository was contradicting itself, and the fact pack is
   the file the outward text is checked against.

2. **The handoff quoted a hash for a file that has a different hash.**
   `docs/HANDOFF.md` called `patch-registry-2026-11-12T19-35-00.000Z.json`
   `900820ae…`; the file hashes to `96f9144f…` and its sibling `.sha256` says
   `96f9144f…` as well. `900820ae` exists in no artifact and no sidecar — only in
   that sentence.

3. **The npm page still documented four commands.** `packages/plugin/README.md`
   lists `status`, `repair`, `scan`, `verify`. The CLI's own `switch` dispatches
   five: `explain` shipped in 0.3.8 and the page strangers install from never
   learned about it.

Two smaller ones came with the same audit: three rows of the handoff evidence
index were marked **当前** at once while the newest artifact of the same family was
missing from the index entirely; and five 0.3.8 artifacts (`publish`, `install
acceptance`, two gate records, the registry snapshot) were cited in prose and
absent from the index.

## Why it lasted

R21 replaced one criterion with a better one and left a hole between them:

- `scripts/gate_copy.mjs` checks that **every prose number in an outward file
  exists in the fact pack**. That is a statement about the *shape* of a claim.
  Nothing ever read the fact pack's own claims, so the pack could describe a
  version the packages had left behind — and it did.
- The handoff is prose about the repository. `scripts/gate_ssot.mjs` validates
  `data/results/*.json`; it never reads a sentence that quotes one. A hash in
  prose has no sibling `.sha256`.
- `tests/unit/cli-usage.test.ts` compared **one** line, `scan`, exactly as far as
  P-0010 needed. P-0010 recorded that limit in its own `limits` ("the new test
  compares the two scan lines, not the package README as a whole") and the very
  next release added a command that fell straight through it. Blind spot `BS-13`
  was still `open` when this patch landed.

This is the fourth instance of the same family — P-0004, P-0006 and P-0010 were
the first three: **a fact that no mechanism watches rots.** The difference is that
the first three rotted inside a report, and this one rotted on the pages that
describe the project to a stranger.

## What changed

Criteria first, each one red before the fix and green after:

1. `tests/governance/facts-truth.test.ts` (5 tests)
   - the pack's `- Version:` line equals `packages/*/package.json` and the
     workspace root, and both packages ship one version;
   - every `pins "dsh-remedy-core": "X"` equals the current core version (the rule
     `scripts/publish_packages.mjs:259` already enforces at pack time);
   - the source manifest is still `workspace:*`, so the pin sentence is
     understood to describe the **tarball**, not the working tree;
   - every version the pack calls "the previous release" has a `CHANGELOG.md`
     section and is older than the current one;
   - every `P-NNNN` the pack names exists in `registry.ts`, and no malformed id
     (`P-0001x` was one) is quoted.
2. `tests/governance/handoff-truth.test.ts` (5 tests), with the two contracts
   written down in the file header:
   - **the evidence index is "now"**: each row resolves, the hash printed on the
     row equals the file's hash, each family marks at most one row **当前** and it
     is the newest artifact on disk, and every artifact the live sections cite
     appears in the index;
   - **the batch sections are "then"**: R1…R21 quotes the stamps and hashes of that
     day and is *not* required to resolve.
   - the live sections may not describe a state that has moved on (profiles on an
     older release, a stale `latest`, an older profile tarball).
3. `tests/unit/cli-usage.test.ts` grew three checks: the packaged README must have
   a usage line for **every** command `cli.ts` dispatches, must not document a
   command the CLI cannot dispatch, and its usage block must equal the `USAGE`
   block **line for line**. That last one is the strongest form: a flag added to
   one side is now a red gate.

What was edited to make them green:

- the fact pack's npm sentence (pin `0.3.8`, previous release `0.3.7`, the one
  before it `0.3.6`) and its `P-0001x` → `P-0011`/`P-0012`/`explain`-module
  attribution;
- the handoff's evidence index (the wrong hash, the three **当前** rows, and the
  five missing 0.3.8 artifacts);
- `packages/plugin/README.md` (the `explain` usage line and one sentence about
  what it prints and when it exits `1`);
- `scripts/copy_record.mjs --freeze` — freezing a published release record became a
  recorded operation instead of a hand edit of `docs/copy/manifest.json`. It
  refuses to freeze an entry whose bytes on disk do not match the recorded ones,
  because that drift must not be hidden behind the "already public" exemption.

## What this does not fix

- It does not move `packages/*/README.md` into the copy channel. The README is
  still hand-written package prose with no `output_sha256`; what now guards it is
  the comparison with `USAGE`, not a hash against a fact pack. `BS-13` narrows to
  "the rest of the page, outside the CLI block, still has no mechanism".
- It does not check the fact pack's *prose* against anything but other repository
  files. A sentence the repository does not otherwise record is still a claim
  about the world, and this patch cannot verify it.
- The hash check only reads evidence-index rows that carry exactly one artifact
  and exactly one hash. A row comparing two publishes (two shasums in one cell) is
  skipped rather than guessed.
- `gate_copy` still cannot see the handoff or the package README.
- No live artifact is possible: this patch touches prose, a manifest recorder and
  governance tests. It stays `tested`.

## Reproduction

```
node --test tests/governance/facts-truth.test.ts      # red on the old pack, green now
node --test tests/governance/handoff-truth.test.ts    # red on 900820ae…, green now
node --test tests/unit/cli-usage.test.ts              # red on the four-line block, green now
tar -xzOf .tmp/pack20/dsh-remedy-0.3.8.tgz package/package.json | grep core
npm view dsh-remedy@0.3.8 dependencies
node scripts/copy_record.mjs --freeze --name release-notes-038
node scripts/gate_copy.mjs
```
