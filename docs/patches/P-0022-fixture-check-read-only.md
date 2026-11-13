# P-0022 — The drift test repaired the drift before it looked for it

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0021

## Symptom

`tests/unit/fixtures-sync.test.ts` called `scripts/sync_fixtures.mjs` in **write
mode** and then asserted that the generated copy was byte-identical to the
canonical fixtures:

```ts
const run = spawnSync(process.execPath, ['scripts/sync_fixtures.mjs'], …)
assert.equal(run.status, 0, run.stderr)
// then compare packages/plugin/fixtures/... with data/fixtures/...
```

`sync_fixtures.mjs` copies `data/fixtures/toolcall-fusion/*` over
`packages/plugin/fixtures/toolcall-fusion/*`. So the comparison could only fail if
the copy step itself failed; a copy that had drifted was overwritten with the
canonical bytes a few milliseconds before the test looked at it. The test's name
promised a drift check; its mechanism was "repair, then compare".

`--check` already existed (`scripts/sync_fixtures.mjs:37-90`) and was already
read-only, but neither consumer used it: the test called write mode, and
`packages/plugin/package.json`'s `prepack` also calls write mode (which is correct
there — packing has to create the copy).

## What changed

1. `scripts/sync_fixtures.mjs` accepts `--source`, `--target` and `--checksums`
   (all relative to the repository root, defaults unchanged). They exist so a test
   can build a copy in `.tmp` and corrupt it without touching the generated copy
   that `prepack` owns. The defaults are what `prepack` still uses.
2. `tests/unit/fixtures-sync.test.ts`:
   - the first test runs `--check` **first**. If it fails, the only accepted reason
     is that every problem is `missing` (a clean checkout has no generated copy);
     then it seeds once with write mode and re-runs `--check`. A `drifted` line is
     a failure, not a reason to regenerate.
   - the second test is the negative control: it seeds a copy under
     `.tmp/fixture-drift-<pid>`, appends one byte to `valid-two-calls.json`, and
     requires `--check` to exit 1 and name `bytes drifted: valid-two-calls.json`.
   - the third test keeps the checksum comparison against the canonical bytes.

The negative control was proven red before the fix was accepted: setting
`process.exit(1)` to `process.exit(0)` in the `--check` branch made the second test
fail, and restoring it made the file green again.

## What this does not do

- It does not make `prepack` read-only. Packing must create the copy; the point of
  this patch is that the **test** no longer writes before it looks.
- It tests the checker with one corrupted fixture. A drift that changes the
  **set** of files (an extra or a missing fixture) is covered by the `--check`
  implementation but not exercised by the negative control.
- The `--source/--target/--checksums` flags are a test seam in a build script; a
  future refactor that removes them would break the negative control, and no test
  pins the flags themselves beyond this file.
- No live artifact is possible: this is a build-side test, not a resident seam.

## Reproduction

```
node --test tests/unit/fixtures-sync.test.ts        # green, 3 tests
# negative control, manually:
#   edit scripts/sync_fixtures.mjs so the --check branch exits 0
#   node --test tests/unit/fixtures-sync.test.ts     # the second test fails
```
