import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPatch, PATCHES, patchRegistrySnapshot, registryProblems, type PatchRecord } from '@dsh-remedy/core'

test('the shipped registry has no structural problems', () => {
  assert.deepEqual(registryProblems(), [])
})

test('duplicate ids are caught', () => {
  const problems = registryProblems([...PATCHES, { ...PATCHES[0]! }])
  assert.ok(problems.some((item) => item.problem === 'duplicate id'))
})

test('a verified patch without live evidence is caught', () => {
  const fake: PatchRecord = {
    ...PATCHES[0]!,
    id: 'P-9999',
    status: 'verified',
    evidence: ['data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json'],
  }
  const problems = registryProblems([fake])
  assert.ok(problems.some((item) => /live data\/results\/live-/.test(item.problem)))
})

test('an unknown surface is caught', () => {
  const problems = registryProblems([{ ...PATCHES[0]!, surface: 'somewhere-else' }])
  assert.ok(problems.some((item) => /unknown surface/.test(item.problem)))
})

test('the snapshot is deterministic and names the patch', () => {
  const first = JSON.stringify(patchRegistrySnapshot())
  const second = JSON.stringify(patchRegistrySnapshot())
  assert.equal(first, second)
  assert.match(first, /P-0001/)
})

test('findPatch resolves by id', () => {
  assert.equal(findPatch('P-0001')?.id, 'P-0001')
  assert.equal(findPatch('P-404'), undefined)
})
