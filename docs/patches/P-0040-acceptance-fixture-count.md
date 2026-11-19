# P-0040 — The acceptance recorder owned a fixture count the package owns

**Status**: `verified`  **Severity**: `major`  **Surface**: `scripts`  **Depends on**: P-0004

## Symptom

A **green published package** was recorded as a **failed install**.

Measured on the 0.4.11 release (2026-11-15):

```
$ node scripts/record_install_acceptance.mjs --version 0.4.11 --stamp ...12:15...
record_install_acceptance: failed (verify did not print OK 6 fixture(s)) · 0.4.11

$ # the same cold directory, same binary, one minute later:
$ dsh-remedy verify
PASS  ambiguous-closer.json — rejected
...
OK  8 fixture(s)            # exit 0
```

The three steps of the acceptance had all exited **0** (`init` / `install` /
`verify`), the registry copy resolved, and `verify` printed every fixture as
`PASS` — and the recorder still wrote `ok: false`, because it looked for the
literal string `OK 6 fixture(s)`.

## Root cause — a number with two homes

R49 added two canonical fixtures (`missing-array-closer.json`,
`ambiguous-closer.json`), so the engine's own count became **8**. The number lived
in four places and only one of them learned the news:

| where | what it said |
|---|---|
| `data/fixtures/toolcall-fusion/` | 8 files (the truth) |
| `packages/plugin/fixtures/checksums.json` | 8 entries (synced by `sync_fixtures`) |
| `dsh-remedy verify` output | `OK  8 fixture(s)` (correct) |
| `scripts/record_install_acceptance.mjs` | `/OK\\s+6 fixture\\(s\\)/` **and** `claimed.expected: 'OK 6 fixture(s)'` (stale) |

This is the family P-0008 / P-0029 already named: a number written in prose (or
in a regex) that no script compared with the thing it describes. `tests/e2e/cli.test.ts`
had already been fixed the right way once (`passes.length >= 5` plus a data-driven
count), which is what made it visible that the recorder had not.

## What changed

`scripts/lib/acceptance.mjs` — the criterion as two pure functions:

1. `acceptanceProblem(output, fixtureCount)` refuses:
   - no `OK <n> fixture(s)` line at all (silence is not success),
   - a printed count that disagrees with the repository's canonical fixture count
     (the tarball and the fixtures drifted),
   - any `FAIL` line,
   - a printed count that disagrees with the number of per-fixture lines (a
     skipped fixture is not a verified one).
2. `acceptanceExpectation(fixtureCount)` derives the string the artifact claims.

`record_install_acceptance.mjs` now counts `data/fixtures/toolcall-fusion/*.json`
itself, judges with that function, and records `canonical_fixtures: 8` beside
`expected: "OK 8 fixture(s)"` — so the artifact can be re-checked, not just
re-believed. **No literal count remains in the script.**

## Judgement (red first)

`tests/unit/acceptance.test.ts`, six tests, written before the fix:

| test | before |
|---|---|
| a clean run with the repository fixture count is accepted | **red** — no such function |
| the old literal six would have failed a correct eight | **red** — this is the measured defect |
| a count that disagrees with the canonical fixtures is refused | **red** |
| a `FAIL` line is refused whatever the count says | **red** |
| an output with no fixture line at all is refused | **red** |
| the count and the per-fixture lines must agree | **red** |

The second one is the release-day incident as a test: `OK  8` against a
six-fixture repository is refused, and that refusal is exactly what the old
recorder produced.

## What this does not do

- **It does not make `verify` authoritative.** The fixture **contents** are still
  checked by `verify` (every case has an expected status in the fixture), and the
  count check only says the tarball ships what the repository ships.
- **It does not accept "exit 0 with no output".** The `npm exec` path can exit 0
  while printing nothing useful; that shape stays a failure here.
- **It cannot tell a wrong fixture from a missing one.** Both show up as a count
  disagreement; which file drifted is `sync_fixtures --check`'s job (P-0022).

## Payment

`scripts/` is not packed, so the tarballs and both byte caps are unchanged by this
patch. The registry record is paid the usual way (P-0032 compaction).

## Reproduction

```powershell
pnpm run build
node --test tests/unit/acceptance.test.ts          # 6 tests
node scripts/record_install_acceptance.mjs --version 0.4.11 --stamp <ISO>
# and the negative control: the same judgment against a six-fixture claim
```
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

