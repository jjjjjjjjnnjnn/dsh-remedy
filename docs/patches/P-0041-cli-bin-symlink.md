# P-0041 — `npx dsh-remedy verify` was silent on Linux, and exited 0

**Status**: `verified`  **Severity**: `critical`  **Surface**: `cli`  **Depends on**: P-0010

## Symptom

On Linux (and, by the same code path, on macOS) the **installed** CLI did nothing:

```
$ npm install dsh-remedy@0.4.11     # in a cold directory
$ ./node_modules/.bin/dsh-remedy verify
$ echo $?
0                                    # and not one byte of output
```

The same file run through `node` printed the full result:

```
$ node node_modules/dsh-remedy/dist/cli.js verify
PASS  ambiguous-closer.json — rejected
...
OK  8 fixture(s)
```

So `verify` — the command every install-acceptance and every README quotes —
**verified nothing and reported success**. That is the exact failure shape this
project exists to refuse: green because nothing ran.

`npx dsh-remedy verify` behaved the same way (it resolves to the same bin), and the
published `0.4.11` tarball carries the defect.

## Root cause — a symlink makes two paths that name one file

```ts
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
```

- `import.meta.url` is the **resolved** module URL.
- `process.argv[1]` is **what the caller named**.

npm installs a POSIX package's `bin` as a **symlink**:
`node_modules/.bin/dsh-remedy` → `../dsh-remedy/dist/cli.js`. So on Linux and macOS
`argv[1]` is the link path and the two strings differ, the guard is `false`,
`main()` never runs, and a module with no side effects exits **0**.

Windows installs a `.cmd` shim whose last line is `node "%~dp0\\..\\dsh-remedy\\dist\\cli.js" %*`,
i.e. the **real** path — which is why this survived every release from 0.1.0 to
0.4.11: the maintainer's platform could not see it.

## What changed

`packages/plugin/src/cli.ts` exports `isEntryPoint(metaUrl, argv1)`:

```ts
export function isEntryPoint(metaUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined || argv1 === '') return false
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argv1)
  } catch {
    return false
  }
}
```

Both sides are resolved to the file they finally name, so a one-hop (or n-hop)
link cannot silence the CLI; an unreachable path answers `false` rather than
throwing. The guard keeps its second property: a plain `import` still does not run
a command, because a bare import never sets `argv[1]` to this file.

## Judgement (red first)

`tests/unit/cli-entry.test.ts`, four tests:

| test | before |
|---|---|
| the old equality guard answers `false` for a bin path that differs by a link hop | **green** — this is the defect, asserted as a function |
| the shipped guard realpaths both sides, and an empty `argv[1]` is not this module | **red** — no `realpathSync`, no empty check |
| the direct path still runs | green before and after (no regression) |
| a real link is exercised where the platform allows it (skipped on Windows) | **red on Linux** — silent exit 0 before the fix |

The first test is deliberately "green before": it is the negative control that
fails the day somebody reverts the fix, not a red that the fix turns green.

## Live evidence

Linux (WSL2), final tree, the installed shape created as a link:

```
ln -s .../packages/plugin/dist/cli.js ~/r51-bin/dsh-remedy
~/r51-bin/dsh-remedy verify
PASS  ambiguous-closer.json — rejected
...
OK  8 fixture(s)          # exit 0, and it actually ran
```

`.tmp/linux-evidence/cli-symlink.log` (hashed into
`data/results/live-linux-2026-11-15T10-00-00.000Z.json`).

## What this does not do

- **It does not fix the published 0.4.11 tarball.** That version carries the old
  guard; the fix ships in 0.4.12. The install acceptance for 0.4.11 is real
  (`record_install_acceptance` counts the fixtures and the run printed 8 PASS
  lines), because it invokes `npm exec`, which passes the resolved path.
- **It does not add a startup banner.** A silent successful command is still
  silent; what changed is that it now *is* a command.
- **It does not cover the Windows `.cmd` shim beyond the existing path.** The
  shim passes a real path, and the direct path test pins that shape.

## Payment

The guard is +831 bytes of `cli.js` (`-282` net after compacting two doc blocks),
paid inside the **cli** subtotal: CLI 41 362 → 41 425 of 42 000, total 82 856 →
82 919 of 83 000. No cap moved.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/cli-entry.test.ts          # 4 tests
node packages/plugin/dist/cli.js verify           # the direct path
# On a POSIX host, the installed shape:
#   ln -s $(pwd)/packages/plugin/dist/cli.js /tmp/dsh-remedy && /tmp/dsh-remedy verify
```
