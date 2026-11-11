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

test('a home path is redacted in every shape a session writes it', () => {
  // MEASURED: the first rule only matched single backslashes. A path quoted
  // inside a JSON argument arrives escaped (`C:\\Users\\...`) and a file URL
  // arrives with slashes (`C:/Users/...`); both used to survive untouched and
  // leaked the account name into a scan artifact.
  const shapes = [
    'C:\\Users\\alice\\project\\x.ts',
    'C:\\\\Users\\\\alice\\\\project\\\\x.ts',
    'C:/Users/alice/project/x.ts',
    'file:///C:/Users/alice/project/x.ts',
    'c:\\users\\alice\\project\\x.ts',
  ]
  for (const shape of shapes) {
    const result = redact(shape)
    assert.doesNotMatch(result.text, /alice/, `leaked in ${shape}`)
    assert.match(result.text, /<home>/)
  }
})

test('a session directory that encodes the home path is redacted too', () => {
  // MEASURED: DSH names a session directory after the workspace path with `-`
  // separators, so no path separator survives to match. The account name still
  // reached every artifact that cited a session file.
  const dir = '--C-Users-alice-Desktop-~9879~76EE~5F00~53D1-dsh-remedy--'
  const result = redact(`C:/Users/x/.dsh/sessions/${dir}/session.v4.jsonl.zstd`)
  assert.doesNotMatch(result.text, /alice/)
  assert.match(result.text, /<home-encoded>-Desktop-~9879~76EE~5F00~53D1-dsh-remedy--/)
})

test('redacting an escaped home path does not eat the following members', () => {
  const quoted = JSON.stringify({ code: 'cd C:\\Users\\alice\\x && ls' }).slice(1, -1)
  const result = redact(quoted)
  assert.doesNotMatch(result.text, /alice/)
  // The rest of the quoted text must survive exactly: the redactor drops the
  // account name, not the JSON escaping around it, otherwise a redacted
  // excerpt no longer reads as the text that actually failed.
  assert.equal(result.text, '"code":"cd <home>\\\\x && ls"')
})
