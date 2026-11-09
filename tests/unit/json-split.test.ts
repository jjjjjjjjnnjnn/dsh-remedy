import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFusedJsonObjectText, splitTopLevelJsonObjects } from 'dsh-remedy-core'

const ACCEPTED: Array<{ name: string; text: string; slices: string[] }> = [
  { name: 'one object', text: '{"a":1}', slices: ['{"a":1}'] },
  { name: 'two objects, no separator', text: '{"a":1}{"b":2}', slices: ['{"a":1}', '{"b":2}'] },
  { name: 'three objects with whitespace', text: '  {"a":1}\n {"b":2}\t{"c":3} ', slices: ['{"a":1}', '{"b":2}', '{"c":3}'] },
  { name: 'nested objects', text: '{"a":{"b":{"c":1}}}{"d":[1,2]}', slices: ['{"a":{"b":{"c":1}}}', '{"d":[1,2]}'] },
  { name: '}{ inside a string is not a boundary', text: '{"text":"}{"}{"b":2}', slices: ['{"text":"}{"}', '{"b":2}'] },
  { name: 'escaped quote before }{', text: '{"text":"\\"}{\\""}{"b":2}', slices: ['{"text":"\\"}{\\""}', '{"b":2}'] },
  { name: 'escaped backslash then close', text: '{"text":"a\\\\"}{"b":2}', slices: ['{"text":"a\\\\"}', '{"b":2}'] },
  { name: 'braces inside array inside object', text: '{"a":[{"x":1},{"y":2}]}{"b":3}', slices: ['{"a":[{"x":1},{"y":2}]}', '{"b":3}'] },
]

for (const item of ACCEPTED) {
  test(`split accepts: ${item.name}`, () => {
    const result = splitTopLevelJsonObjects(item.text)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.slices, item.slices)
  })
}

const REJECTED: Array<{ name: string; text: string; code: string }> = [
  { name: 'empty', text: '   ', code: 'empty' },
  { name: 'top-level array', text: '[{"a":1}]', code: 'not-an-object' },
  { name: 'top-level number', text: '42', code: 'not-an-object' },
  { name: 'trailing garbage', text: '{"a":1} x', code: 'not-an-object' },
  { name: 'unterminated string', text: '{"a":"x}', code: 'unterminated-string' },
  { name: 'unbalanced open', text: '{"a":{"b":1}', code: 'unbalanced' },
  { name: 'unbalanced close', text: '{"a":1}}', code: 'unbalanced' },
]

for (const item of REJECTED) {
  test(`split rejects: ${item.name}`, () => {
    const result = splitTopLevelJsonObjects(item.text)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.code, item.code)
  })
}

test('isFusedJsonObjectText only accepts proven, parseable fusions', () => {
  assert.equal(isFusedJsonObjectText('{"a":1}{"b":2}'), true)
  assert.equal(isFusedJsonObjectText('{"a":1}'), false)
  assert.equal(isFusedJsonObjectText('{"a":1}{"b":'), false)
  assert.equal(isFusedJsonObjectText('[1]{"b":2}'), false)
  assert.equal(isFusedJsonObjectText(''), false)
})
