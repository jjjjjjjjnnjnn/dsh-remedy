# P-0026 — The release procedure had two homes, and the older one was retired

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0018

## Symptom

Two files described how to publish this repository, and they disagreed:

| | `docs/PUBLISH.md` (rewritten in R35) | `docs/HANDOFF.md` (the copy a successor reads) |
|---|---|---|
| command | `scripts/publish_packages.mjs` → pack both, read the packed manifest back, `npm publish <tarball>` | `pnpm --filter dsh-remedy-core publish --access public --no-git-checks` |
| auth | the token in this environment bypasses the one-time password (R29) | "需要 npm OTP；token 不绕过 2FA" |
| public repo | `commit-tree` (git 2.56 here has no `subtree` subcommand) | `git subtree split` |
| outward copy | every live entry re-registered in one pass | "重新生成全部 copy（8 个文件）" |

And `docs/HANDOFF.md`'s `明确边界` section described a state four releases old:

- the two profiles "现在都指向 `.tmp/pack17/dsh-remedy-0.3.5.tgz`";
- "npm 上 `latest` 是 0.3.5".

Measured on 2026-11-13: both profiles load `0.4.1` from a tarball whose sha1/sha512
match the registry's `dist.shasum` / `dist.integrity`, and `npm view dsh-remedy
version` answers `0.4.1`.

The older procedure is not merely outdated, it is the one that failed once already:
`publish_packages.mjs` exists because `pnpm --filter … publish` publishes the *source*
manifest, which still carries `workspace:*`, and npm wrote that straight into the
registry for 0.3.0.

## Root cause

`tests/governance/handoff-truth.test.ts` defines the handoff's "live" part as the
status table plus `第一件事`, and those two are checked thoroughly: artifact rows must
resolve, hashes must match, exactly one row per family may say `当前`, and certain
stale phrases are refused.

`发布流程` and `明确边界` sit *after* the evidence index, so they were outside that
contract — while still being sections a successor acts on. A claim with no reader
rots, and here the rotting copy was the one the instructions pointed at. Same family
as P-0014 (the fact pack's own claims) and P-0020 (the market index's two mutually
exclusive statements), one section further out.

## What changed

1. `docs/HANDOFF.md`'s `发布流程` section is now a pointer to `docs/PUBLISH.md`, with
   one sentence saying why it is a pointer: the two copies disagreed, the retired one
   survived inside the section no test read.
2. `docs/HANDOFF.md`'s `明确边界` section no longer cites `.tmp/` paths (gitignored —
   a fresh clone cannot open one) and no longer claims a `latest` other than the
   version the packages ship. Where the profiles point is now recorded in the batch
   narrative and in `data/results/install-acceptance-*.json`, which is where a dated
   fact belongs.
3. `tests/governance/release-procedure.test.ts` pins three shapes:
   - the retired commands and claims may not appear anywhere in the handoff;
   - the `发布流程` section must name `docs/PUBLISH.md` and must not carry a second
     command block;
   - every `--flag` the documents pass to `publish_packages.mjs` must be a flag that
     script reads (`--dry-run`, `--otp`), and the boundary section may cite no
     `.tmp/` path and no `latest` other than the shipped version.
4. Each rule has an injected negative control in the same file, so a rule that stops
   matching fails instead of passing quietly: a made-up `--otp2`, an injected
   `--no-git-checks`, and the boundary rules' own examples.

## Judgement (red first)

All three tests were written before the sections were rewritten and all three failed
against the recorded text:

```
the publish flags the documents name are the flags the script reads
the handoff points at the one publish procedure instead of restating it
  → 'pnpm --filter publish …', '--no-git-checks …', 'a claim that the token cannot bypass 2FA …'
the boundary section cites no scratch path and no stale latest
  → '.tmp/pack17/dsh-remedy-0.3.5.tgz', '.tmp/switch-profiles-035.mjs'
```

## What this does not do

- It pins the *shape* of the sections, not the truth of every step: a `PUBLISH.md`
  step can still be wrong while the flags it names are real.
- The retired commands are refused by pattern; a differently worded wrong command is
  not caught.
- The boundary rule looks for `.tmp/` paths and a `latest` version. A stale statement
  phrased without either is still unread.
- No live artifact is possible: this is documentation plus a governance test.

## Reproduction

```
node --test tests/governance/release-procedure.test.ts
node --test tests/governance/handoff-truth.test.ts
git -C .. log --oneline -1 -- dsh-remedy/docs/PUBLISH.md   # R35 rewrote it
npm view dsh-remedy version                                # 0.4.1, not 0.3.5
```
