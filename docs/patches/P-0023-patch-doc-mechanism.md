# P-0023 — The workflow's first step was a sentence nobody read

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0016

## Symptom

`AGENTS.md`'s "加一个补丁的固定顺序" starts with:

> 1. 先在 `docs/patches/` 写清症状、机制（文件/行）、反证、边界；

`gate_registry` resolved every `evidence` and `guards` path and had no opinion
about `docs/patches/`. A doc was not in either list, so a patch could ship
without one while every check stayed green.

It had already happened: at the start of R31 the registry held **21 patches** and
`docs/patches/` held **19** files. **P-0016** shipped in R24 with no doc at all.
`INDEX.md` also described the range as `P-0001…P-0009` and `P-0010…P-0015`, five
docs behind the directory.

## What was measured

The gate was given the check before the missing doc was written, and it failed on
the real state rather than on a fixture:

```
$ node scripts/gate_registry.mjs
FAIL  registry/doc:P-0016 — docs/patches/P-0016-*.md is missing
```

That is the red half. Writing the doc turned the same check green; the patch doc
you are reading is P-0023's own, and `docs/patches/P-0016-coverage-single-source.md`
is the one this patch recovered.

## What changed

1. `scripts/gate_registry.mjs` lists `docs/patches/P-NNNN-*.md` once and requires
   a doc for every patch in the registry. The check is per patch id, so a missing
   doc names the patch it belongs to.
2. `docs/patches/P-0016-coverage-single-source.md` was written from the R24 record
   and checked against the code that shipped (the two governance tests, the
   optional `failureClasses` / `switchKey`, the identical `explain` output).
3. `INDEX.md`'s patch-doc row now names the real range instead of stopping at
   P-0015.

## What this does not do

- It checks that a doc **exists**, not that it is **true**. A doc can still
  describe behaviour the code does not have; P-0014's `facts-truth` tests read the
  fact pack, not the patch docs.
- It matches by id prefix (`P-0016-`), so the four-digit id keeps `P-0016` from
  matching `P-00160`; ids are `P-NNNN` by `registryProblems`, so this is a
  property of the id format rather than a separate guard.
- An **orphan** doc with no registry entry is not reported: the gate iterates the
  registry, not the directory. Deleting a patch would leave its doc behind and
  nothing would say so.
- No live artifact is possible: this is a governance gate.

## Reproduction

```
node scripts/gate_registry.mjs          # green; remove the P-0016 doc and it goes red
node --test tests/governance/ledgers.test.ts
```
