import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const repo = fileURLToPath(root)
const source = new URL('data/fixtures/toolcall-fusion/', root)
const target = new URL('packages/plugin/fixtures/toolcall-fusion/', root)

test('the packed fixtures are byte-identical to the canonical ones', () => {
  const run = spawnSync(process.execPath, ['scripts/sync_fixtures.mjs'], { cwd: repo, encoding: 'utf8' })
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

test('the fixture checksums match the canonical bytes', () => {
  const run = spawnSync(process.execPath, ['scripts/sync_fixtures.mjs'], { cwd: repo, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const checksums = JSON.parse(readFileSync(new URL('packages/plugin/fixtures/checksums.json', root), 'utf8')) as {
    files: Record<string, string>
  }
  for (const [name, digest] of Object.entries(checksums.files)) {
    const actual = createHash('sha256').update(readFileSync(new URL(name, source))).digest('hex')
    assert.equal(digest, actual, `${name} checksum`)
  }
})
