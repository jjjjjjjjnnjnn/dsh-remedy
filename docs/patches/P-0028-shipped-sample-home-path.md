# P-0028 — A published sample carried this machine's home path

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0004

## Symptom

Every npm tarball since 0.1.0 shipped `fixtures/toolcall-fusion/session-9045e2ec-seq-526.json`
with the account name inside the fused arguments, because the fixture quotes the shell
command the session actually ran:

```
{"command": "cd \"C:/Users/<account>/Desktop/…/DSH-Addition\" && ls scripts/lib/", …}{"path": "data/results/…"}
```

The public repository carried the same name in six patch docs, in `HANDOFF.md`, in
`audit/step_reviews.json` and in one adaptation artifact.

Reported by the dshopen maintainer on 2026-11-14 while accepting the plugin into
`polang233/dsh-plugin-index` (issue #472): *「发布样例里有本机路径，可以在后续版本替换成虚构路径」*.

## Root cause

Redaction was wired where data is **produced** — `record_*.mjs`, `scan --out`, the journal
event writer — and never where data leaves the machine. P-0004 fixed the three shapes a
home path reaches an artifact in, but it fixed the *reader* and left the files that were
already tracked alone: a fixture is quoted evidence, and nobody treated a fixture as
outbound text.

The same blind spot in one sentence: the rule lived in the writer, and a hand-checked-in
corpus has no writer.

## What changed

1. `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json`: the account segment is
   replaced with `<home>`, which is the placeholder the redactor already writes. Its `note`
   now says the file is no longer a byte-for-byte copy and why; the glued-JSON shape the
   fixture exists for is untouched.
2. `scripts/record_adaptation.mjs` redacts the runtime path it records (`runtime.source`),
   and the one artifact it already wrote was rewritten in place with a new `.sha256`.
3. Six patch docs, `HANDOFF.md`, `audit/step_reviews.json` and one research note: the
   account name is replaced with `<home>` / `--<home-encoded>`.
4. The packaged copy was regenerated (`sync_fixtures.mjs`), so the tarball carries the
   redacted bytes.

## Judgement (red first)

`tests/governance/shipped-samples.test.ts`:

| rule | what it does |
|---|---|
| no shipped file names this machine | walks `data/fixtures` **and** `packages/plugin/fixtures`, plus the two package pages, the root pages, the changelog, `cordis.patch.yml` and the fact pack, and forbids any `…:/Users/<name>` segment |
| the detector detects | injects a forward-slash and a backslash sample (must match) and the `<home>` placeholder (must not) |

Run against the pre-patch tree the first rule names the fixture; the second rule is what
stops a typo from turning the first one into a no-op.

## What this does not do

- The forbidden shape is `…:/Users/<name>`. A path in another shape — the DSH encoded
  session directory, a POSIX home, a UNC share — is still only caught by the P-0004
  redactor at write time, not by this test.
- Docs and artifacts were rewritten in place; their stamps are unchanged, so this is a
  redaction repair, not a re-measurement.
- The fixture is no longer byte-identical to the session it came from. That claim was the
  reason the path survived six releases; it is now stated as "the exact joined delta text,
  with the home path replaced".

## Reproduction

```
node --test tests/governance/shipped-samples.test.ts
node scripts/sync_fixtures.mjs --check
node --test tests/unit/fixtures-sync.test.ts
```
