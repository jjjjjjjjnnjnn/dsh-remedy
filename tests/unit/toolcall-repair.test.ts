import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { repairToolCallArguments, type ToolCallInput } from 'dsh-remedy-core'

const call = (args: string, id = 'call_1', name = 'ops_bash'): ToolCallInput => ({ id, name, arguments: args })
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../data/fixtures/toolcall-fusion/${name}`, import.meta.url), 'utf8')) as {
    tool: string
    call_id: string
    arguments: string
    expect: { status: string; fragments?: number }
  }

test('a valid value is never rewritten', () => {
  const result = repairToolCallArguments(call('{"command":"ls"}'))
  assert.equal(result.status, 'unchanged')
  assert.equal(result.calls.length, 1)
  assert.equal(result.calls[0]?.arguments, '{"command":"ls"}')
})

test('empty arguments are left alone, not invented', () => {
  const result = repairToolCallArguments(call('   '))
  assert.equal(result.status, 'unchanged')
  if (result.status !== 'unchanged') return
  assert.equal(result.code, 'empty-arguments')
})

test('two glued objects become two calls with a traceable id', () => {
  const result = repairToolCallArguments(call('{"command":"ls"}{"path":"a.ts"}'))
  assert.equal(result.status, 'repaired')
  if (result.status !== 'repaired') return
  assert.equal(result.fragments, 2)
  assert.deepEqual(
    result.calls.map((item) => item.id),
    ['call_1', 'call_1#remedy-1'],
  )
  assert.deepEqual(JSON.parse(result.calls[0]!.arguments), { command: 'ls' })
  assert.deepEqual(JSON.parse(result.calls[1]!.arguments), { path: 'a.ts' })
  assert.equal(result.calls[0]!.name, 'ops_bash')
})

test('a synthetic id never collides with an id already in the stream', () => {
  const result = repairToolCallArguments(call('{"a":1}{"b":2}'), {
    existingIds: ['call_1#remedy-1'],
  })
  assert.equal(result.status, 'repaired')
  if (result.status !== 'repaired') return
  assert.deepEqual(
    result.calls.map((item) => item.id),
    ['call_1', 'call_1#remedy-1-2'],
  )
})

test('max-tokens truncation is rejected, never repaired', () => {
  const result = repairToolCallArguments(call('{"a":1}{"b":2}'), { truncated: true })
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'truncated')
})

test('one broken object is a different defect and is rejected', () => {
  const result = repairToolCallArguments(call('{"a":1'))
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'not-an-object-sequence')
})

test('a single parseable prefix followed by garbage is not split', () => {
  const result = repairToolCallArguments(call('{"a":1} 42'))
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'not-an-object-sequence')
})

test('too many fragments are rejected instead of dispatched', () => {
  const text = Array.from({ length: 9 }, (_, index) => `{"i":${index}}`).join('')
  const result = repairToolCallArguments(call(text), { maxCalls: 8 })
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'too-many-calls')
})

test('a call without an id cannot be traced and is rejected', () => {
  const result = repairToolCallArguments(call('{"a":1}{"b":2}', ''))
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'missing-id')
})

test('a call without a tool name is rejected, never dispatched to an empty name', () => {
  const result = repairToolCallArguments(call('{"a":1}{"b":2}', 'call_named', ''))
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'missing-name')
})

test('a tool name that is only whitespace is also missing', () => {
  const result = repairToolCallArguments(call('{"a":1}{"b":2}', 'call_blank', '   '))
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'missing-name')
})

test('real fused fixture: ops_bash command + read path', () => {
  const item = fixture('session-9045e2ec-seq-526.json')
  const result = repairToolCallArguments({
    id: item.call_id,
    name: item.tool,
    arguments: item.arguments,
  })
  assert.equal(result.status, item.expect.status)
  if (result.status !== 'repaired') return
  assert.equal(result.fragments, item.expect.fragments)
  const first = JSON.parse(result.calls[0]!.arguments) as Record<string, unknown>
  const second = JSON.parse(result.calls[1]!.arguments) as Record<string, unknown>
  assert.equal(typeof first.command, 'string')
  assert.equal(typeof second.path, 'string')
  assert.equal(result.calls[0]!.id, item.call_id)
})

test('real counter-evidence fixture stays untouched', () => {
  const item = fixture('valid-two-calls.json')
  const result = repairToolCallArguments({ id: item.call_id, name: item.tool, arguments: item.arguments })
  assert.equal(result.status, 'unchanged')
  assert.equal(result.calls.length, 1)
})

test('a }{ inside a string does not become a call boundary', () => {
  const item = fixture('braces-in-string.json')
  const result = repairToolCallArguments({ id: item.call_id, name: item.tool, arguments: item.arguments })
  assert.equal(result.status, 'repaired')
  if (result.status !== 'repaired') return
  assert.equal(result.fragments, 2)
  assert.equal((JSON.parse(result.calls[0]!.arguments) as { text: string }).text, '}{ is not a boundary')
})

test('truncated fixture is rejected', () => {
  const item = fixture('truncated.json')
  const result = repairToolCallArguments(
    { id: item.call_id, name: item.tool, arguments: item.arguments },
    { truncated: true },
  )
  assert.equal(result.status, 'rejected')
})

test('single-broken fixture is rejected', () => {
  const item = fixture('single-broken.json')
  const result = repairToolCallArguments({ id: item.call_id, name: item.tool, arguments: item.arguments })
  assert.equal(result.status, 'rejected')
})
