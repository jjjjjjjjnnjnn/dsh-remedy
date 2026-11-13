# P-0020 — The market index claimed to pin git bytes while naming a published tarball

**Status**: `tested`  **Severity**: major  **Surface**: `scripts`  **Depends on**: P-0019

## Symptom

`docs/market-index.json` (added in P-0019) declared:

```json
"version": "0.3.8",
"source": { "type": "git", "commit": "39cc358e…", "path": "packages/plugin" }
```

Both halves cannot be true at once. `0.3.8` is the **published tarball** — thirteen
patches, no P-0014…P-0019 — while the commit it pinned contained the **unreleased**
head: nineteen patches, new package descriptions, a rewritten README. A market that
trusted the entry would clone the commit and install code that is not what the
version number says, which is the exact drift `format: 1` exists to prevent.

The pin also churned on every document commit, because the index cannot name the
commit that contains it. Three re-pins in a row were the visible symptom; the
undefined meaning was the defect.

## Why it lasted one round only

P-0019's guard (`tests/governance/distribution-entry.test.ts`) checked the **shape**
of the pin — that `commit` matched `^[0-9a-f]{40}$` and that `path` was
`packages/plugin` — and never asked whether the pinned commit could be the bytes of
the version being advertised. That is the same defect this repository has now
written down four times: **a check on form is not a check on meaning.**

## What changed

`source` is now honest per version:

- the published version points at the registry — `{"type": "npm"}` — because that is
  where `0.3.8` actually lives, and a market resolving it gets exactly the bytes
  that were published;
- the git source is recorded separately, in `docs/market-index.json`'s top-level
  `head` note, as **what the repository currently contains** (nineteen patches,
  unreleased), so nobody reads the working tree as the released artifact.

The index also drops the per-commit re-pin: a document commit no longer moves it,
because it no longer claims a commit.

`tests/governance/distribution-entry.test.ts` now refuses a git source that names a
version the registry does not serve:

- `source.type` must be `npm` or `git`;
- if it is `git`, `commit` and `path` are required **and** the version must be
  declared unreleased in the same file (`versions[].unreleased: true`), so a git
  pin cannot masquerade as a published version;
- if it is `npm`, `commit` and `path` must be absent, because an npm source has no
  commit to point at.

## What this does not do

- It does not make the repository publishable: P-0014…P-0019 remain merged and
  unreleased, and the index says so instead of hiding it.
- It does not stop a future release from using a git pin — that is allowed, but only
  with `unreleased: true` off and a commit that genuinely is the released bytes.
- It does not verify the registry from the test: whether `0.3.8` is still `latest`
  is a network fact, and the guard only checks what can be checked offline.

## Reproduction

```
node --test tests/governance/distribution-entry.test.ts
node -e "const j=require('./docs/market-index.json');console.log(j.plugins[0].versions[0].source)"
npm view dsh-remedy version   # 0.3.8, which is what an npm source resolves
```
