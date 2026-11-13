import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * `explain` is the command that turns the registry into an answer a user can act
 * on: which failure class this profile hits, which patch covers it, and whether
 * that patch is switched on *here*. Four things have to be true for it to be
 * worth anything, and each of them is a way it could lie:
 *
 *   1. it must never invent a count (no `--sessions` → no numbers, not zeros);
 *   2. it must read the profile, not assume the defaults;
 *   3. it must exit 3, never 0, when an input it was given cannot be read;
 *   4. it must never turn "no profile was given" into "the patch is off" (P-0025).
 *
 * (4) is the subtle one. `enabled here` has three states — on, off, and unknown —
 * and until P-0025 the middle and the last were the same value: `config === null`
 * made every coverer read as off, so the row printed `(no)` and the exit code
 * said `1` (a finding: this host is covered by a patch that is switched off)
 * while the same output printed `enabled-here is unknown`. A user with no
 * profile argument got a finding about a profile nobody had read.
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

/**
 * One session whose single turn died on `MALFORMED_RESPONSE`, so the census has
 * a class five patches claim to cover. Written without a BOM: `scanSessions`
 * sniffs plain JSONL by its first byte, and a BOM makes the file unreadable.
 */
function sessionDir(parent: string): string {
  const dir = join(parent, 'sessions')
  mkdirSync(join(dir, 'ws', 's1'), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', createdAt: '2026-11-13T00:00:00.000Z' }),
    JSON.stringify({ type: 'turn/start', seq: 1, data: { turn: 1 } }),
    JSON.stringify({
      type: 'turn/end',
      seq: 12,
      data: { turn: 1, reason: { kind: 'error', error: { code: 'MALFORMED_RESPONSE', message: 'x' } } },
    }),
  ].join('\n')
  writeFileSync(join(dir, 'ws', 's1', 'session.v4.jsonl.jsonl'), lines, 'utf8')
  return dir
}

/** The one printed row for a class, so a test can read its `enabled here` cell. */
function rowFor(out: string, failure: string): string {
  const row = out.split(/\r?\n/).find((line) => line.startsWith(`${failure} `) || line.startsWith(failure.padEnd(23)))
  assert.ok(row !== undefined, `no row printed for ${failure}:\n${out}`)
  return row
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

test('without a profile the covered column says unknown, and nothing is a finding', () => {
  // P-0025, the measured defect: `--sessions` alone printed `(no)` for every
  // covered class and exited 1, which reads as "the plugin is installed and
  // switched off" — while the same screen said `enabled-here is unknown`.
  const dir = mkdtempSync(join(tmpdir(), 'remedy-explain-'))
  const { status, out } = run(['explain', '--sessions', sessionDir(dir)])
  const row = rowFor(out, 'MALFORMED_RESPONSE')
  assert.match(row, /unknown/, `an unread profile is unknown, not "off":\n${row}`)
  assert.doesNotMatch(row, /\(no\)/, `"(no)" claims a measurement nobody made:\n${row}`)
  assert.equal(status, 0, `an unmeasured profile is not a finding:\n${out}`)
})

test('a covered class whose patch is switched off is still a finding', () => {
  // The other half: after P-0025, exit 1 must keep meaning exactly what it says.
  // If the fix simply stopped counting, this test would stop failing too.
  const dir = mkdtempSync(join(tmpdir(), 'remedy-explain-'))
  const profile = profileFile(dir, '    repair: false')
  const { status, out } = run(['explain', '--sessions', sessionDir(dir), '--profile-file', profile])
  const row = rowFor(out, 'MALFORMED_RESPONSE')
  assert.match(row, /\(no\)/, `a read profile that switches repair off must print (no):\n${row}`)
  assert.equal(status, 1, `a covered class switched off here is a finding:\n${out}`)
})

test('a covered class whose patch is on is not a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-explain-'))
  const profile = profileFile(dir, '    repair: true')
  const { status, out } = run(['explain', '--sessions', sessionDir(dir), '--profile-file', profile])
  const row = rowFor(out, 'MALFORMED_RESPONSE')
  assert.match(row, /P-0001/, `a switched-on coverer must be named:\n${row}`)
  assert.doesNotMatch(row, /unknown|\(no\)/, `a read profile is neither unknown nor off:\n${row}`)
  assert.equal(status, 0, out)
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

