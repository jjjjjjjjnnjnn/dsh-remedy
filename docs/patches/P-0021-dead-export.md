# P-0021 — The package advertised a subpath that never had a module

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0017

## Symptom

`packages/plugin/package.json` declared:

```json
"./retry-listener": {
  "types": "./dist/retry-listener.d.ts",
  "default": "./dist/retry-listener.js"
}
```

No `packages/plugin/src/retry-listener.ts` has ever existed. The second seam's
module is `failure-listener.ts`, and it is already re-exported from the main entry
(`packages/plugin/src/index.ts:23`). So `import 'dsh-remedy/retry-listener'` fails
with `ERR_MODULE_NOT_FOUND` while the package's own manifest says it is supported.

The dead subpath has been published twice:

- `npm view dsh-remedy@0.3.8 exports` lists `./retry-listener`;
- `npm view dsh-remedy@0.4.0 exports` still lists it;
- `tar -tzf .tmp/pack20/dsh-remedy-0.3.8.tgz` contains `package/dist/failure-listener.js`
  and no `retry-listener.js`;
- `git log -S "retry-listener" -- packages/plugin/package.json` shows the entry was
  added by the 0.3.8 commit, and `git log --all -- packages/plugin/src/retry-listener.ts`
  is empty.

## Why nothing caught it

`tests/unit/package-files.test.ts:46-47` checked the target string against
`/^\.\/dist\/[a-z-]+\.js$/` and `/^\.\/dist\/[a-z-]+\.d\.ts$/`. That is a check on
the **shape** of the promise, not on whether the promise can be kept: `./dist/retry-listener.js`
matches the regex exactly as well as `./dist/repair-stream.js` does.

This is the sixth instance of the family the handoff names in P-0010, P-0014,
P-0016 and P-0020: **a fact with a second home, and a mechanism that only reads the
form**. Here the second home is the exports map, and the missing mechanism is a
filesystem check.

## What changed

1. `tests/unit/package-files.test.ts` gained a pure `deadExports(exportsMap, exists)`
   helper and two tests:
   - every exported subpath must have `packages/plugin/src/<module>.ts`, where
     `<module>` is the `default` target with `./dist/` and `.js` removed;
   - a negative control: a ghost map must be reported, and a real map must not, so
     a checker that always returns `[]` cannot pass.
2. `packages/plugin/package.json` no longer declares `./retry-listener`. The
   listener is still reachable through the main entry, so nothing is lost; the
   dead name is not kept as an alias because no page, test or document ever
   referred to it, and an alias would preserve a name that was never true.

## What this does not do

- It checks the **source tree**, not the packed tarball. A module that exists in
  `src/` but is excluded by `files` would still pass; `tests/unit/package-files.test.ts`
  and `scripts/gate_size.mjs` cover the shipped `dist` from other angles, but the
  two checks are not joined.
- It does not check `main` and `bin` targets against `src/`; both are pinned to
  `./dist/index.js` and `./dist/cli.js` by the same test file and have existed
  since 0.1.0.
- It does not verify that an exported subpath is documented, or that a documented
  subpath is exported. Only `packages/*/README.md` prose is guarded (P-0017), and
  it mentions no subpath.
- No live artifact is possible: this is a manifest, not a resident seam.

## Reproduction

```
node --test tests/unit/package-files.test.ts        # green, including the negative control
npm view dsh-remedy@0.4.0 exports --json            # before this release: ./retry-listener present
tar -tzf .tmp/pack20/dsh-remedy-0.3.8.tgz | grep -c retry-listener   # 0
```
