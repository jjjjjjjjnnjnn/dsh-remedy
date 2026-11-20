# P-0055 — "newest" was a window key, not a published version

**Status:** `verified` · **Surface:** `scripts` (reach pipeline) · **Artifact:** `data/results/live-reach-2026-11-20T09-10-00.000Z.json`

## Symptom

The 2026-11-19 reach file said `newest 0.4.18, 0.4.17` although 0.4.19 had been
published the previous day; the 2026-11-20 file said `newest 0.4.19, 0.4.18`
although 0.4.20 had been published the previous day. The playbook calls
`latestShare` the one comparable number, yet the two days compared different
pairs of versions. The same wrong label reached the knowledge-base bus snapshot
(`reach/intraday/2026-11-20-0900.yaml`).

## Mechanism

`scripts/traffic-report.mjs` computed `newest` from `Object.keys(versions)`,
where `versions` is the npm per-version download payload for a rolling window.
`GET /downloads/point/last-week/dsh-remedy` on 2026-11-20 returned
`start 2026-11-12, end 2026-11-18`; 0.4.20 was published `2026-11-19T07:22Z`,
so it had no row in that window. "No row in the window" was read as "not one of
the newest two", which is a different claim. The window endpoint gives the end
day, but the old report never carried it, so a reader could not tell why.

A second half of the same defect: `tests/governance/promotion.test.ts` imported
the whole reporter to reach the pure `latestShare` function. The module performs
four network requests at import time and calls `process.exit(2)` when every
source fails, so a unit test could kill the test process and was slow even when
the network was healthy.

## What changed

- `scripts/lib/reach.mjs` is pure: `versionRank` and `latestShare(versions,
  published, windowEnd, publishedAt)` take all inputs as arguments. `newest`
  comes from the registry packument; a newest version with no row is listed in
  `missing` with `published_after_window_end` or `no_row_in_window`, and
  `comparable` is false while anything is missing.
- `scripts/traffic-report.mjs` reads the packument once per package, carries
  `window.start` / `window.end`, and prints the missing versions in its human
  line. The test imports the pure module instead.
- `scripts/daily-reach.mjs` carries `missing`, `comparable`, `newest_source` and
  the window days into the markdown ledger and the `promotion-snapshot/v1`
  snapshot. These are additive fields; the bus contract only requires `schema`.
- `docs/PROMOTION-PLAYBOOK.md` now states the cross-project rule the bus was
  already warning about: one account, one subreddit, seven days, regardless of
  which project the post was for.

## Counter-evidence

- The share numerator is unchanged for a window with no missing rows: the
  existing crawler-vs-human test still passes, and `comparable` is true only
  when both newest versions have rows.
- With no registry reachable, the reporter names `newestSource: 'downloads'`
  and marks the share non-comparable instead of guessing. A missing row is
  never written as zero downloads.
- The 0.4.20 share moves from 8.3% to 3.0% because the pair is now 0.4.20 /
  0.4.19 and 0.4.20 has no row yet. This is a lower bound, explicitly labeled
  `not comparable`, not a claim that 0.4.20 was downloaded zero times.
- The promotion test's `latestShare` case dropped from about 9 seconds to a few
  milliseconds; the rest of the suite and all six gates stayed green.

## Limits

- A share with `missing` entries is a lower bound; do not compare it with a
  previous day whose `missing` was empty.
- The registry says what is published; the per-version endpoint says what was
  downloaded in a rolled window. Neither is a user count.
- The live artifact is one reading of npm at one stamp. A version that is
  missing today may get a row tomorrow; the fixture test, not the live stamp,
  is what proves the rule.

## Reproduction

```powershell
pnpm run build
node --test tests/governance/promotion.test.ts
node scripts/traffic-report.mjs
node scripts/record_reach_truth.mjs --stamp <ISO>
```

The recorder refuses to write unless `newest` is the top two registry versions,
every absent row is named with a reason, and `comparable` follows `missing`.
The before/after human lines are in `docs/reach/2026-11-19.md`,
`docs/reach/2026-11-20.md` and `docs/reach/latest.md`.

## R81 witness

`data/results/live-reach-2026-11-20T09-10-00.000Z.json` is a build/host witness
at one stamp: it reads the live npm registry and download endpoints and asserts
the claim before writing. It is not a resident-journal repair; its `not_proven`
section says what one live reading cannot establish.
