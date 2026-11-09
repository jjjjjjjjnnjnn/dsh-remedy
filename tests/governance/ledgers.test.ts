import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { PATCHES } from '@dsh-remedy/core'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T
const exists = (path: string) => existsSync(new URL(path, root))

test('gate ledger and scripts/ stay in sync', () => {
  const ledger = readJson<{ gates: { id: string; script: string; negative_control: string }[] }>('audit/gate_ledger.json')
  const onDisk = readdirSync(new URL('scripts/', root))
    .filter((name) => /^gate_.*\.mjs$/.test(name))
    .map((name) => `scripts/${name}`)
    .sort()
  const registered = ledger.gates.map((gate) => gate.script).sort()
  assert.deepEqual(registered, onDisk, 'every gate file must be registered, and vice versa')
})

test('every gate declares a negative control', () => {
  const ledger = readJson<{ gates: { id: string; negative_control: string }[] }>('audit/gate_ledger.json')
  for (const gate of ledger.gates) {
    assert.ok(gate.negative_control.trim().length > 10, `${gate.id} must say what --mutate injects`)
  }
})

test('the patch ledger names the same patches with the same status', () => {
  const ledger = readJson<{ patches: { id: string; status: string }[] }>('audit/patch_ledger.json')
  assert.deepEqual(
    ledger.patches.map((item) => `${item.id}:${item.status}`).sort(),
    PATCHES.map((item) => `${item.id}:${item.status}`).sort(),
  )
})

test('every patch evidence and guard path resolves', () => {
  for (const patch of PATCHES) {
    for (const path of [...patch.evidence, ...patch.guards]) {
      assert.ok(exists(path), `${patch.id} cites a missing path: ${path}`)
    }
  }
})

test('the recorded registry snapshot matches the built registry and its hash', () => {
  const dir = new URL('data/results/', root)
  const names = readdirSync(dir)
    .filter((name) => /^patch-registry-.*\.json$/.test(name))
    .sort()
  const latest = names.at(-1)
  assert.ok(latest !== undefined, 'no registry snapshot recorded')
  const text = readFileSync(new URL(latest, dir), 'utf8')
  const payload = JSON.parse(text) as { schema_version: number; patches: unknown }
  assert.equal(payload.schema_version, 1)
  assert.deepEqual(payload.patches, JSON.parse(JSON.stringify(PATCHES)))
  const sidecar = readFileSync(new URL(`${latest}.sha256`, dir), 'utf8').trim().split(/\s+/)[0]
  assert.equal(sidecar, createHash('sha256').update(text).digest('hex'))
})

test('every gate step is reviewed on five axes with resolvable evidence', () => {
  const ledger = readJson<{ gates: { id: string }[] }>('audit/gate_ledger.json')
  const reviews = readJson<{
    steps: { id: string; gate: string; axes: Record<string, string>; evidence: string[] }[]
  }>('audit/step_reviews.json')
  const axes = ['correctness', 'reproducibility', 'compliance', 'ssot', 'adversarial']

  const gateIds = ledger.gates.map((gate) => gate.id).sort()
  const reviewed = [...new Set(reviews.steps.map((step) => step.gate))].sort()
  assert.deepEqual(reviewed, gateIds, 'every gate must have at least one reviewed step')

  for (const step of reviews.steps) {
    for (const axis of axes) {
      assert.ok((step.axes[axis] ?? '').trim() !== '', `${step.id} is missing the ${axis} axis`)
    }
    assert.ok(step.evidence.length > 0, `${step.id} cites no evidence`)
    for (const path of step.evidence) assert.ok(exists(path), `${step.id} cites a missing path: ${path}`)
  }
})

test('blind spots are unique and carry a status', () => {
  const ledger = readJson<{ blind_spots: { id: string; status: string; note: string }[] }>('audit/blind_spots.json')
  const ids = ledger.blind_spots.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const item of ledger.blind_spots) {
    assert.match(item.id, /^BS-\d{2}$/)
    assert.ok(['open', 'closed', 'accepted'].includes(item.status), `${item.id} has status ${item.status}`)
    assert.ok(item.note.trim().length > 10, `${item.id} has no note`)
  }
})

test('the AI disclosure log names a session and the first patch', () => {
  const text = read('audit/AI_DISCLOSURE_LOG.md')
  assert.match(text, /SessionID/)
  assert.match(text, /`[^`]+`/)
  assert.match(text, /P-0001/)
})

test('the handoff keeps the two sections a new agent needs', () => {
  const text = read('docs/HANDOFF.md')
  assert.match(text, /当前批次/)
  assert.match(text, /第一件事/)
})

test('the profile patch layer only claims remedy- rows', () => {
  const text = read('packages/plugin/cordis.patch.yml')
  const ids = [...text.matchAll(/^\s*- id:\s*(\S+)/gm)].map((match) => match[1] ?? '')
  assert.ok(ids.length > 0)
  for (const id of ids) assert.match(id, /^remedy-/)
})
