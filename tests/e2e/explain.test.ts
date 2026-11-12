import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * `explain` is the command that turns the registry into an answer a user can act
 * on: which failure class this profile hits, which patch covers it, and whether
 * that patch is switched on *here*. Three things have to be true for it to be
 * worth anything, and each of them is a way it could lie:
 *
 *   1. it must never invent a count (no `--sessions` → no numbers, not zeros);
 *   2. it must read the profile, not assume the defaults;
 *   3. it must exit 3, never 0, when an input it was given cannot be read.
 */

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))

function run(args: readonly string[]): { status: number; out: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** A profile layer shaped like the one DSH actually writes. */
function profileFile(dir: string, config: string): string {
  const path = join(dir, 'cordis.patch.yml')
  writeFileSync(path, `# remedy-live\n- id: remedy-stream\n  name: dsh-remedy\n  config:\n${config}\n`, 'utf8')
  return path
}

test('with no inputs it reports unknowns rather than zeros', () => {
  const { status, out } = run(['explain'])
  assert.equal(status, 0, out)
  assert.match(out, /counts are unknown/, 'a missing scan must not become a row of zeros')
  assert.match(out, /enabled-here is unknown/, 'a missing profile must not become "disabled"')
  assert.doesNotMatch(out, /MALFORMED_RESPONSE\s+0\s/, 'no invented rows')
})

test('a readable profile is accepted and both settings parse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-explain-'))
  for (const config of ['    repair: true\n    retryOnMalformed: 2', '    repair: true\n    retryOnMalformed: 0']) {
    const { status, out } = run(['explain', '--profile-file', profileFile(dir, config)])
    assert.equal(status, 0, out)
    assert.doesNotMatch(out, /no remedy row found/)
  }
})

test('an unreadable profile path is unavailable, not silently "disabled"', () => {
  const { status, out } = run(['explain', '--profile-file', join(tmpdir(), 'not-a-profile.yml')])
  assert.equal(status, 3, out)
})

test('a missing session directory is unavailable, not an empty measurement', () => {
  const { status, out } = run(['explain', '--sessions', join(tmpdir(), 'no-sessions-here')])
  assert.equal(status, 3, out)
  assert.match(out, /no session directory/, out)
})

test('the usage text and the CLI name the same five commands', () => {
  const usage = run(['--help']).out
  const declared = usage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('dsh-remedy ') && !line.startsWith('dsh-remedy —'))
    .map((line) => line.split(' ')[1] ?? '')
  assert.deepEqual(
    [...new Set(declared)].sort(),
    ['explain', 'repair', 'scan', 'status', 'verify'],
    'a command that exists in the switch but not in the usage text is invisible to a user',
  )
})

