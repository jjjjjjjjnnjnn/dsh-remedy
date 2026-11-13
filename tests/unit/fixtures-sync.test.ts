import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const repo = fileURLToPath(root)
const source = new URL('data/fixtures/toolcall-fusion/', root)
const target = new URL('packages/plugin/fixtures/toolcall-fusion/', root)

const sync = (args: string[]) =>
  spawnSync(process.execPath, ['scripts/sync_fixtures.mjs', ...args], { cwd: repo, encoding: 'utf8' })

/**
 * `--check` is the read-only half. A test that runs the write mode first and then
 * compares bytes can never see drift: it has just repaired it (P-0022). The only
 * write this file performs is the one a clean checkout needs, and it is taken only
 * when every reported problem is "missing" — never when bytes have drifted.
 */
test('the packed fixtures are in sync with the canonical ones', () => {
  let run = sync(['--check'])
  if (run.status !== 0) {
    const problems = String(run.stderr ?? '')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('sync_fixtures --check:') && !line.includes('problem(s)'))
    const onlyMissing = problems.length > 0 && problems.every((line) => line.includes('missing'))
    assert.ok(onlyMissing, `the generated fixtures drifted instead of being absent:\n${run.stderr}`)
    const seeded = sync([])
    assert.equal(seeded.status, 0, seeded.stderr)
    run = sync(['--check'])
  }
  assert.equal(run.status, 0, run.stderr)

  const names = readdirSync(source).filter((name) => name.endsWith('.json')).sort()
  assert.ok(names.length > 0, 'canonical fixtures must exist')
  for (const name of names) {
    assert.deepEqual(
      readFileSync(new URL(name, target)),
      readFileSync(new URL(name, source)),
      `${name} drifted from the canonical fixture`,
    )
  }
})

test('a drifted copy is reported, not repaired (negative control)', () => {
  // The guard above is only worth something if `--check` can fail. This builds a
  // copy under `.tmp` (the three path flags exist for this), changes one byte, and
  // requires exit 1 with the file named. The real generated copy is never touched.
  const dir = `.tmp/fixture-drift-${String(process.pid)}`
  const scratch = new URL(`${dir}/`, root)
  const args = [
    '--source',
    'data/fixtures/toolcall-fusion',
    '--target',
    `${dir}/fixtures/toolcall-fusion`,
    '--checksums',
    `${dir}/fixtures/checksums.json`,
  ]
  rmSync(scratch, { recursive: true, force: true })
  const seeded = sync(args)
  assert.equal(seeded.status, 0, seeded.stderr)

  const victim = new URL(`${dir}/fixtures/toolcall-fusion/valid-two-calls.json`, root)
  writeFileSync(victim, Buffer.concat([readFileSync(victim), Buffer.from(' ')]))

  const run = sync(['--check', ...args])
  assert.equal(run.status, 1, `--check stayed green on a drifted copy:\n${run.stdout}`)
  assert.match(String(run.stderr), /bytes drifted: valid-two-calls\.json/)
  rmSync(scratch, { recursive: true, force: true })
})

test('the fixture checksums match the canonical bytes', () => {
  const check = sync(['--check'])
  assert.equal(check.status, 0, check.stderr)
  const checksums = JSON.parse(readFileSync(new URL('packages/plugin/fixtures/checksums.json', root), 'utf8')) as {
    files: Record<string, string>
  }
  for (const [name, digest] of Object.entries(checksums.files)) {
    const actual = createHash('sha256').update(readFileSync(new URL(name, source))).digest('hex')
    assert.equal(digest, actual, `${name} checksum`)
  }
})
