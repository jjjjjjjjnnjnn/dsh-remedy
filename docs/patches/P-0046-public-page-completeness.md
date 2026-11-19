# P-0046 — The first screens can be one patch short and one release behind

**Status**: `verified`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0019, P-0023

## Symptom

Measured while taking over the 0.4.15 tree:

- `README.md` and `README.zh-CN.md` both claim **forty-four** patches and both
  enumerate the `verified` ones by id. **P-0043 appears in neither page** — 43 of
  44 ids are named — so the enumeration is one short of its own count.
- Both pages put "Package sizes:" directly under a release-status sentence that
  calls **0.4.15** the published release, and then list **0.4.14** first. The
  0.4.15 plugin and core rows exist in the fact pack
  (`plugin 38600 / 38 / 124248`, `core 40675 / 27 / 134256`); they were simply
  never copied into the page.

Both pages are registered live entries, `gate_copy` is green on them, and the
full suite passes. The defect is not a wrong number: it is a page that omits a
row a reader needs, which no rule asked about.

## Mechanism

`gate_copy` checks three things about an outward file: every prose number exists
in the fact pack, no placeholder survives, and the bytes equal what the manifest
recorded. `tests/governance/public-copy.test.ts` extends that to the manifest
itself. None of them has an opinion about **completeness**:

- no rule reads the registry and asks whether the page that advertises the
  patch count names every patch;
- no rule compares the version in the status sentence with the first size row
  that follows it.

That is the same shape as BS-15's residue: the pack is checked against other
repository files, so a sentence nothing else records stays unverified prose. A
page can be perfectly consistent with the fact pack and still be one row short.

## What changed

1. **Two rules, in `tests/governance/public-pages-complete.test.ts`**:
   - every id in `PATCHES` must appear in each of `README.md` and
     `README.zh-CN.md`;
   - the version the status sentence calls published must be the **first**
     package-size row, and its engine row must be present too.
   Each rule carries its own negative control: a page missing one id and a page
     whose status version has no size rows.
2. **The two pages were fixed through the copy channel**, not by hand:
   the missing 0.4.15 rows were added, P-0043 was named in both enumerations, and
   the status/enumeration sentences were brought to the 0.4.16 tree (nine
   `verified`, thirty-seven `verified`).
3. **The same pass closed four drift rows found in the takeover audit**:
   `INDEX.md` said the lead ledger held 38 rows (it held 40: 34 DSH + 4 Reddit +
   2 market/code); `audit/blind_spots.json` BS-17 still called
   `{kind:'enter'}` unmeasured after R53 measured it; `docs/research/README.md`
   repeated the P-0043 parenthetical twice.

## What this does not fix

- **The rule reads ids, not sentences.** A page that names `P-0043` in a broken
  table row satisfies it, and a page that names a patch in the wrong seam row
  still passes. It proves presence, not placement.
- **It does not check the reverse direction.** A page may carry a number for an
  unpublished release; the rule only pins the published one. The fact pack and
  `copy_record` still own "no number outside the pack".
- **The status sentence is parsed with two fixed shapes** (English `Release
  status: \`x.y.z\` is published` and Chinese `发布状态：\`x.y.z\` 已发布`). A rewrite
  of that sentence must keep one of them, which is a constraint on prose rather
  than a truth about the product.
- **It cannot see the two npm package pages.** They are shorter and carry no
  patch enumeration, so the rule would be vacuous there.

## Reproduction

```bash
node --test tests/governance/public-pages-complete.test.ts
# before the fix, on the 0.4.15 tree:
#   README.md never names P-0043
#   README.md calls 0.4.15 the published release but its package-size list starts at 0.4.14
```

## Numbers this page quotes

- 44 ids in the registry on the 0.4.15 tree, 43 named on each page.
- 0.4.15 tarballs: 38600 / 38 / 124248 and 40675 / 27 / 134256.
- The takeover audit row: 38 claimed ledger rows vs 40 actual.
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

