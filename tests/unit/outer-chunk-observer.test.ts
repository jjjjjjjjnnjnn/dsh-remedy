import assert from 'node:assert/strict'
import { test } from 'node:test'

const url = new URL('../../tests/fixtures/outer-chunk-observer/index.js', import.meta.url)
const mod = await import(url.href) as {
  summarizeChunk: (chunk: unknown) => Record<string, unknown>
}

test('the outer observer records shape without copying chunk text', () => {
  assert.deepEqual(mod.summarizeChunk(null), { type: null })
  assert.deepEqual(mod.summarizeChunk('x'), { type: 'string' })
  const chunk = {
    type: 'block-end',
    index: 0,
    id: 'call_1',
    name: 'capture',
    arguments: '{"code":"secret"}',
  }
  const row = mod.summarizeChunk(chunk)
  assert.equal(row.type, 'block-end')
  assert.equal(row.id, 'call_1')
  assert.equal(row.arguments, '{"code":"secret"}', 'arguments must be comparable across arms')
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'text'), false, 'no text is copied into the log')
})

test('a finish with no reason is recorded as null, not invented', () => {
  assert.deepEqual(mod.summarizeChunk({ type: 'finish' }), { type: 'finish', reason: null })
  assert.deepEqual(
    mod.summarizeChunk({ type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE' } } }),
    { type: 'finish', reason: { kind: 'error', code: 'MALFORMED_RESPONSE' } },
  )
})

test('an object arguments chunk keeps its kind so a pass-through is visible', () => {
  const row = mod.summarizeChunk({ type: 'block-end', index: 0, arguments: { code: 'x' } })
  assert.equal(row.arguments_kind, 'object')
  assert.equal(row.arguments, '{"code":"x"}')
})

test('a repaired block-end exposes the id, name and parseable arguments a consumer needs', () => {
  const row = mod.summarizeChunk({
    type: 'block-end',
    index: 0,
    block: { type: 'tool-call', id: 'call_r82_1', name: 'capture', arguments: '{"code":"x"}' },
  })
  const block = row.block as Record<string, unknown>
  assert.equal(block.type, 'tool-call')
  assert.equal(block.id, 'call_r82_1')
  assert.equal(block.name, 'capture')
  assert.equal(block.arguments_kind, 'string')
  assert.deepEqual(JSON.parse(String(block.arguments)), { code: 'x' })
})
