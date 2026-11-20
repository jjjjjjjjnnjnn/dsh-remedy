import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const adr = read('docs/adr/0002-fail-open-on-foreign-chunks.md')
const artifactPath = 'data/results/live-neighbours-contract-2026-11-20T10-00-00.000Z.json'

test('ADR 0002 names the measured downstream half instead of asserting it from code', () => {
  assert.ok(adr.includes('R82 实测'), 'the ADR must carry the measured section')
  assert.ok(adr.includes(artifactPath), 'the ADR must name its outer-observer artifact')
  assert.ok(adr.includes('remedy（load_index 16，最外层）→ dsh-ops（20，内层）'), 'the topology must be stated in the right order')
  assert.ok(adr.includes('read-dedup.js:104-108'), 'the inner neighbour read surface must be cited')
  assert.ok(adr.includes('reason: null'), 'the no-invention shape must be named')
})

test('the outer-observer artifact carries both claims and their per-scenario readings', () => {
  assert.ok(existsSync(new URL(artifactPath, root)), `${artifactPath} is missing`)
  const artifact = JSON.parse(read(artifactPath)) as {
    schema_version: number
    produced_by: string
    claim: { pass_through: string; repair: string }
    scenarios: Record<string, { identical: boolean }>
    not_proven: string[]
  }
  assert.equal(artifact.schema_version, 1)
  assert.equal(artifact.produced_by, 'scripts/record_neighbour_contract.mjs')
  assert.ok(artifact.claim.pass_through.includes('chunk-identical'))
  assert.ok(artifact.claim.repair.includes('parse'))
  assert.deepEqual(Object.keys(artifact.scenarios).sort(), [
    'bare-value', 'finish-no-reason', 'healthy', 'object-arguments',
  ])
  for (const name of ['healthy', 'object-arguments', 'finish-no-reason']) {
    assert.equal(artifact.scenarios[name]?.identical, true, `${name} must equal the control`)
  }
  assert.equal(artifact.scenarios['bare-value']?.identical, false, 'a repair must be visible downstream')
  assert.ok(artifact.not_proven.some((line) => line.includes('dsh-ops is not mounted')))
})

test('the ADR rule fails on a document that only quotes the old decision', () => {
  const old = 'remedy 对一条流只允许三种结局：原样放行、修复已证实的粘连、原样抛回原来的失败。'
  assert.ok(old.length > 0)
  assert.equal(old.includes('R82'), false, 'the old decision alone must not satisfy the new rule')
})
