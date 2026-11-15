import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * P-0042 — the conflict has to be visible from the command a person runs, and
 * it must not appear when either half is missing.
 *
 * The four cases below are the ones that decide whether the line means
 * anything: a matching pair is a finding (exit 1); a profile that already
 * dropped the level is not; a session with no refusals is not; and a profile
 * with no `reasoningEffort` is not, because the level lives in the UI's
 * selection rather than in the layer and this command may not invent it.
 */

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))

function run(args: readonly string[]): { status: number; out: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** A profile layer with the remedy row and a fixed selection. */
function profile(dir: string, effort: string | null): string {
  const path = join(dir, 'cordis.patch.yml')
  writeFileSync(
    path,
    [
      '- id: remedy-stream',
      '  name: dsh-remedy',
      '  config:',
      '    repair: true',
      '- id: agent-default-model',
      '  name: "@deepseek-ai/dsh-agent-default-model"',
      '  config:',
      '    provider: opendesign',
      '    model: deepseek-v4.1-flash-eco',
      ...(effort === null ? [] : [`    reasoningEffort: ${effort}`]),
      '',
    ].join('\n'),
    'utf8',
  )
  return path
}

/** One session whose only turn died on the refusal the host itself named. */
function sessions(dir: string, message: string): string {
  const root = join(dir, 'sessions')
  mkdirSync(join(root, 'ws', 's1'), { recursive: true })
  writeFileSync(
    join(root, 'ws', 's1', 'session.v4.jsonl.jsonl'),
    [
      JSON.stringify({ type: 'session', createdAt: '2026-11-13T00:00:00.000Z' }),
      JSON.stringify({ type: 'turn/start', seq: 1, data: { turn: 1 } }),
      JSON.stringify({
        type: 'turn/end',
        seq: 2,
        data: { turn: 1, reason: { kind: 'error', error: { code: 'UNSUPPORTED_REASONING_EFFORT', message } } },
      }),
    ].join('\n'),
    'utf8',
  )
  return root
}

const NAMED =
  'provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"'

test('a profile that still fixes the refused level is a finding, and the line names both halves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-conflict-'))
  const { status, out } = run(['explain', '--sessions', sessions(dir, NAMED), '--profile-file', profile(dir, 'xhigh')])
  assert.match(out, /CONFLICT/, `the conflict must be printed:\n${out}`)
  assert.match(out, /opendesign\/deepseek-v4.1-flash-eco/, 'the route must be named, not implied')
  assert.match(out, /xhigh/, 'the level must be named')
  assert.match(out, /1 time\(s\)/, 'the count comes from the census, not from prose')
  assert.equal(status, 1, 'a live conflict is a finding')
})

test('a profile that already dropped the level is not a finding', () => {
  // The other half of the rule: if this test were skipped, deleting the check
  // would leave only the positive case and read as green forever.
  const dir = mkdtempSync(join(tmpdir(), 'remedy-conflict-'))
  const { status, out } = run(['explain', '--sessions', sessions(dir, NAMED), '--profile-file', profile(dir, 'high')])
  assert.doesNotMatch(out, /CONFLICT/, `a profile on "high" has no conflict:\n${out}`)
  assert.equal(status, 0, out)
})

test('a session with no refusal is not a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-conflict-'))
  const quiet = mkdtempSync(join(tmpdir(), 'remedy-quiet-'))
  mkdirSync(join(quiet, 'sessions', 'ws', 's1'), { recursive: true })
  writeFileSync(
    join(quiet, 'sessions', 'ws', 's1', 'session.v4.jsonl.jsonl'),
    [
      JSON.stringify({ type: 'session', createdAt: '2026-11-13T00:00:00.000Z' }),
      JSON.stringify({ type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } }),
    ].join('\n'),
    'utf8',
  )
  const { status, out } = run(['explain', '--sessions', join(quiet, 'sessions'), '--profile-file', profile(dir, 'xhigh')])
  assert.doesNotMatch(out, /CONFLICT/, `no refusal, no conflict:\n${out}`)
  assert.equal(status, 0, out)
})

test('a profile that names no level is not a finding, even with refusals counted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-conflict-'))
  const { status, out } = run(['explain', '--sessions', sessions(dir, NAMED), '--profile-file', profile(dir, null)])
  assert.doesNotMatch(out, /CONFLICT/, `the layer names no level, so nothing is fixed:\n${out}`)
  assert.equal(status, 0, out)
})

test('a refusal for another route never matches this profile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-conflict-'))
  const other = 'provider "someoneelse" model "gpt-4" does not support reasoning effort "xhigh"'
  const { status, out } = run(['explain', '--sessions', sessions(dir, other), '--profile-file', profile(dir, 'xhigh')])
  assert.doesNotMatch(out, /CONFLICT/, `a different route is a different question:\n${out}`)
  assert.equal(status, 0, out)
})
