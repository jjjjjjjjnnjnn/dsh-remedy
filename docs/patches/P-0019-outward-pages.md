# P-0019 — The page strangers read first described a project that stopped existing at R20

**Status**: `tested`  **Severity**: major  **Surface**: `scripts`  **Depends on**: P-0014, P-0017

## Symptom

`README.md` and `README.zh-CN.md` still opened with:

> "dsh-remedy is a resident repair layer … It mounts on `llm/stream` …"

and described the project as **one seam with one wrapper**. Since R20 the project
is a patch set: eighteen registered defects, each with its own evidence, guards,
limits and declared seam. Four of them are not even on `llm/stream`.

Worse than staleness, one sentence had become **false**:

| README (before) | What R23 measured |
|---|---|
| "`agent/pre-step` is deliberately **not** mounted. The upstream contract is that a rejected `PreStepDecision` opens no step, but **nobody has measured** what a user sees when a plugin rejects one, so mounting a refusal would be guessing." | P-0015 measured it: the turn closes as `reason.kind "blocked"` with no `step/start`, the claimed input is discarded, and the CLI exits `1` (`data/results/prestep-probe-2026-11-13T07-45-00.000Z.json`) |

The unmeasured claim was the *reason* the seam stayed unmounted. Once measured,
the honest sentence is a different one: the seam is usable, the input cost is
known, and the remaining unknown is how the desktop renders `blocked` (`BS-17`).

## Why it lasted

The copy channel guards numbers, not shape. `gate_copy` checks that every prose
number exists in the fact pack; it has no opinion on whether the page still
describes the product. P-0014 pinned the fact pack's own claims, P-0017 pinned the
package pages' digits and fenced commands — and the two root READMEs, the pages a
stranger reads first, could still say the project was a single wrapper.

Also drifting, and all three fixed here:

| claim | README | measured |
|---|---|---|
| tests | 242 | 251 |
| CLI half of the byte budget | 40665 | 40845 (P-0016 moved coverage into the registry) |
| total | 81808 | 81988 |
| patches described | P-0001…P-0013 | 18, of which P-0014…P-0018 are merged and **unreleased** |

## What changed

1. **The fact pack first**, because `copy_record` refuses any digit it does not
   carry: a new `## The patch set, by seam` section (18 patches classified across
   `llm/stream`, `agent/request-error`, CLI, build side and one measured-not-
   mounted seam), plus the three corrected numbers.
2. **Both READMEs**, rewritten from the pack: they open as a patch set, carry the
   seam table, replace the pre-step sentence with P-0015's measurement and its
   remaining blind spot, and state the release status truthfully — `0.3.8` serves
   thirteen patches; the five after it are merged, tested, unreleased.
3. **The two package READMEs** (the pages npm renders) explain the split for the
   first time: installing the plugin installs the engine because the pin is exact,
   and the engine is its own package because it does no I/O and can be embedded
   and tested alone. Their `description` fields were re-registered through the copy
   channel and now match `repo-metadata.json` byte for byte.

## Guards

- `tests/unit/cli-usage.test.ts` — the packaged README usage block equals `USAGE`
  line for line, and every dispatched command has a line.
- `tests/governance/package-readme-prose.test.ts` — no prose digits on either
  package page; every fenced `dsh-remedy <cmd>` is dispatchable.
- `tests/governance/facts-truth.test.ts` — the pack's Version, pins,
  previous-release and patch-id statements must hold.
- `gate_copy` — every registered artifact's bytes and fact-pack hash.

## What this does not do

- It does not put the root README under a structural guard. The mechanism is
  "numbers must exist in the pack"; a page could still describe behaviour the code
  does not have, and only a reviewer would notice. That gap is `BS-13`'s sibling.
- It does not change npm's rendered pages: those come from the tarball, and the
  published tarball is `0.3.8`. Until a release carries P-0014…P-0019, npm still
  shows the old descriptions and the old package READMEs.
- It does not release anything. Every patch from P-0014 on is merged, tested and
  unpublished.

## Reproduction

```
node --test tests/governance/public-copy.test.ts
node --test tests/governance/package-readme-prose.test.ts
node --test tests/unit/cli-usage.test.ts
node scripts/gate_copy.mjs
pnpm run verify
```
