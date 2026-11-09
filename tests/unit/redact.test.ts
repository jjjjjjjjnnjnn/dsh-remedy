import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redact, redactValue } from 'dsh-remedy-core'

test('API keys and bearer tokens are removed', () => {
  const result = redact('key=sk-abcdefghijklmnopqrstuvwxyz012345 Authorization: Bearer abcdefghijklmnop')
  assert.doesNotMatch(result.text, /sk-abcdef/)
  assert.doesNotMatch(result.text, /Bearer abcdefghijklmnop/)
  assert.ok(result.summary.replacements >= 2)
  assert.deepEqual(result.summary.kinds, ['api-key', 'bearer'])
})

test('assigned secrets are removed but the key name survives', () => {
  const result = redact('api_key = "supersecretvalue" and password: hunter2hunter2')
  assert.match(result.text, /api_key = "\*\*\*"/)
  assert.match(result.text, /password: \*\*\*/)
  assert.doesNotMatch(result.text, /supersecretvalue/)
})

test('emails and home paths are removed', () => {
  const result = redact('mail rongjiajun2025@outlook.com from C:\\Users\\rongj\\Desktop\\x and /home/alice/y')
  assert.doesNotMatch(result.text, /rongjiajun2025@outlook\.com/)
  assert.doesNotMatch(result.text, /rongj/)
  assert.doesNotMatch(result.text, /alice/)
  assert.match(result.text, /<home>/)
})

test('redactValue walks arrays and nested objects', () => {
  const result = redactValue({ a: ['sk-abcdefghijklmnopqrstuvwxyz', { b: 'C:\\Users\\bob\\x' }] })
  const text = JSON.stringify(result.value)
  assert.doesNotMatch(text, /sk-abcdef/)
  assert.doesNotMatch(text, /bob/)
  assert.ok(result.summary.replacements >= 2)
})

test('redaction is counted even when nothing matches', () => {
  const result = redact('plain text')
  assert.equal(result.text, 'plain text')
  assert.equal(result.summary.replacements, 0)
  assert.deepEqual(result.summary.kinds, [])
})
