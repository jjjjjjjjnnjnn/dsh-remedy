# P-0029 — The pointers a successor acts on were prose nobody compared

**Status**: `verified`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0014, P-0026

## Symptom

Three lines in the live part of the handoff — the part a new session starts from — named
versions that had already moved:

| where | what it said | what the packages ship |
|---|---|---|
| `docs/HANDOFF.md` status table, 公开仓库 row | `**v0.4.2**` is the newest release | `v0.4.5` (`v0.4.3`, `v0.4.4`, `v0.4.5` all published) |
| `docs/HANDOFF.md` five-minute check | `npm view dsh-remedy version      # 0.4.1` | `0.4.5` |
| `docs/PUBLISH.md` repository status | `both packages are published (currently 0.4.2)` | `0.4.5` |

The same live section told the next agent how to pay for a new patch: *「先按加载路径拆
模块（P-0012 的办法）」*. That cannot work while the total cap is the binding one. The
total is the sum of both subtotals, so a split moves bytes between residency and CLI and
leaves the total unchanged. R40 ended with `total 82 985 / 83 000` — 15 bytes.

## Root cause

Each rule looked at a different part of the map and none looked at the version claims:

- `handoff-truth.test.ts` checks that the evidence index resolves and that three **0.3.x**
  stale shapes do not appear. A row that calls `v0.4.2` newest after `v0.4.5` shipped
  matches none of those shapes.
- `release-procedure.test.ts` checks the shape of the publish commands — retired commands,
  flags the script really reads, `.tmp/` paths, `latest <x.y.z>`. It never read the
  `currently <x.y.z>` sentence.
- `gate_size.mjs` measured the emitted bytes every run and compared them with the caps, but
  never with the numbers the handoff quotes; the handoff copied them by hand each round.

In one sentence: these are version claims with no sibling file to compare against, which is
the same family as P-0014 / P-0020 / P-0026 — a claim with no reader.

## What changed

1. `tests/governance/handoff-truth.test.ts`
   - `releaseClaim(text)` reads the live release row: the bolded tag must equal
     `v<plugin.version>`, and the notes file it compares must be that release's notes.
   - `npmViewClaims(text)` reads every `npm view … version  # x.y.z` in the live section;
     each must equal `plugin.version`.
2. `tests/governance/release-procedure.test.ts`
   - `currentlyClaim(text)` must equal `plugin.version`.
3. `scripts/gate_size.mjs`
   - new check `handoff-bytes`: the `emit 总量 …（常驻 …，CLI …）` row must equal the
     measured total / residency / CLI and the three caps. `--mutate` compares it with a
     number one byte off the measurement, so the check is not vacuously green.
4. The three lines above are corrected, and the "split modules to pay" advice is replaced
   with "the total is the sum of both halves; a new patch is paid by deleting or
   de-duplicating, or by a signed cap change".

## Judgement (red first)

Run before the text was fixed, the three rules failed on the real files:

```
the live row calls v0.4.2 the newest release; the packages ship 0.4.5
the five-minute check expects 0.4.1; the packages ship 0.4.5
docs/PUBLISH.md says npm is at another version than the packages ship  (0.4.2 !== 0.4.5)
```

Each rule also carries an injected negative control (the old value), so a rule that agreed
with anything would be caught. `gate_size` is proven by `--mutate`:

```
FAIL size/handoff-bytes — total: handoff 82985 vs measured 82986; …
```

The `v0.4.5` release body was checked against `docs/copy/release-notes/v0.4.5.md` by hand
on 2026-11-14 (equal after the known trailing-LF difference) before the row claimed it.

## What this does not do

- The rules are offline: they compare the row with `packages/plugin/package.json`, not with
  GitHub or npm. A row can name the right version and describe a tag nobody published.
- The release-body comparison is quoted, not fetched: the R41 check was manual and is not a
  mechanism.
- The channel rows in `docs/distribution/README.md` are dated readings. No test reads them,
  so they can go stale between rounds (dsh.so still served `0.4.1` when this was written).
- This changes no runtime behaviour. It ships as a registry entry, so the core tarball
  carries it; the plugin tarball does not change.

## Reproduction

```
node --test tests/governance/handoff-truth.test.ts
node --test tests/governance/release-procedure.test.ts
node scripts/gate_size.mjs
node scripts/gate_size.mjs --mutate
```
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

