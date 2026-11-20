import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const conflict = fileURLToPath(new URL('../../tests/fixtures/seams-profile/conflict', import.meta.url))
const clean = fileURLToPath(new URL('../../tests/fixtures/seams-profile/clean', import.meta.url))

const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: repoRoot })

test('seams reports a shared seam as a finding at exit 1', () => {
  const result = run('seams', '--dir', conflict)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /SAME\s+llm\/stream\s+b-plugin@2\.0\.0\(prepend\) -> a-plugin@1\.0\.0/)
  assert.match(result.stdout, /CONFLICT|WARN/, 'the conflict must be named, not only counted')
})

test('seams --json carries the ordered registrants and the profile reading', () => {
  const result = run('seams', '--dir', conflict, '--json')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout) as {
    schema: number
    produced_by: string
    profile: { packages: number; files_read: number; unreadable_dirs: string[] }
    conflicts: Array<{ seam: string; outermost: string; prepend_involved: boolean }>
    seams: Array<{ seam: string; registrants: Array<{ name: string }> }>
  }
  assert.equal(report.schema, 1)
  assert.equal(report.produced_by, 'dsh-remedy seams')
  assert.equal(report.profile.packages, 2)
  assert.ok(report.profile.files_read >= 2)
  assert.deepEqual(report.profile.unreadable_dirs, [])
  assert.deepEqual(report.conflicts.map((row) => row.seam), ['llm/stream'])
  assert.equal(report.conflicts[0]?.outermost, 'b-plugin@2.0.0')
  assert.equal(report.conflicts[0]?.prepend_involved, true)
  assert.deepEqual(report.seams.find((row) => row.seam === 'llm/stream')?.registrants.map((entry) => entry.name), ['b-plugin', 'a-plugin'])
})

test('seams stays quiet when no seam is shared', () => {
  const result = run('seams', '--dir', clean)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0 shared seam\(s\)/)
  assert.doesNotMatch(result.stdout, /SAME/)
})

test('seams refuses a missing profile without pretending it is empty', () => {
  const result = run('seams', '--dir', `${conflict}-does-not-exist`)
  assert.equal(result.status, 3)
  assert.match(result.stderr, /no profile at/)
})
