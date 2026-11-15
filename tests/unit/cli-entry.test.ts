/**
 * P-0041 — `npx dsh-remedy verify` printed nothing and exited 0 on Linux.
 *
 * The CLI guards itself with `import.meta.url === pathToFileURL(process.argv[1])`.
 * `import.meta.url` is the resolved file, `argv[1]` is what the caller named, and
 * npm installs a POSIX package's bin as a **symlink**
 * (`node_modules/.bin/dsh-remedy` -> `../dsh-remedy/dist/cli.js`). The two therefore
 * differ on Linux and macOS, `main()` never ran, and the process exited 0 with no
 * output — a green `verify` that verified nothing. Windows installs a `.cmd` shim
 * that passes the real path, which is why no release caught it.
 *
 * This machine cannot create symlinks without elevation, so the link is created
 * where it can be (a POSIX checkout) and the guard is also tested as a pure
 * function against the two strings that differ. Both assertions describe the same
 * defect from the two sides that are available here.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'dsh-remedy-bin-'))
after(() => rmSync(work, { recursive: true, force: true }))

/** The guard that shipped before P-0041: string equality, no resolution. */
const oldGuard = (metaUrl: string, argv1: string | undefined): boolean =>
  argv1 !== undefined && metaUrl === pathToFileURL(argv1).href

test('the old equality guard answers false for a bin path that differs by a link hop', () => {
  // On POSIX the installed bin is `.../node_modules/.bin/dsh-remedy`, which
  // realpath-resolves to `.../dist/cli.js` while `import.meta.url` is already the
  // latter. This reproduces that pair without needing a link on Windows.
  const installed = join(work, '.bin', 'dsh-remedy')
  assert.equal(oldGuard(pathToFileURL(cli).href, installed), false, 'the old guard must miss it')
})

test('the shipped guard realpaths both sides, so a link hop cannot silence it', () => {
  const source = readFileSync(fileURLToPath(new URL('../../packages/plugin/src/cli.ts', import.meta.url)), 'utf8')
  const shipped = readFileSync(cli, 'utf8')
  assert.match(source, /realpathSync\(fileURLToPath\(metaUrl\)\)/, 'the guard must realpath both sides')
  assert.match(shipped, /realpathSync/, 'the built CLI carries the realpath guard')
  assert.match(source, /argv1 === undefined \|\| argv1 === ''/, 'an empty argv[1] is not this module')
  assert.doesNotMatch(source, /process\.exit\(main\(/)
})

test('the direct path still runs, so the fix is not a widening that breaks the guard', () => {
  const result = spawnSync(process.execPath, [cli, 'verify'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /OK\s+\d+ fixture\(s\)/)
})

test('a real link is exercised where the platform allows it', () => {
  // POSIX checkouts (CI ubuntu, WSL) create the link and run the binary through
  // it; on a Windows box without the symlink privilege this is skipped, and the
  // string-level tests above still cover the guard.
  const link = join(work, 'dsh-remedy-bin')
  try {
    symlinkSync(cli, link)
  } catch {
    console.log('skip: this platform does not allow symlinks without elevation')
    return
  }
  const result = spawnSync(process.execPath, [link, 'verify'], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../packages/plugin/', import.meta.url)) })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /OK\s+\d+ fixture\(s\)/, 'the installed shape must run')
})
