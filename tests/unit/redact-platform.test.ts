/**
 * What an outward file may never carry, measured on this machine.
 *
 * The home-path rules were written against the shape this machine produces
 * (`C:\Users\<name>` and its JSON-escaped/slashed variants). A macOS or Linux
 * user gets a different shape from the *same* host code, and the encoded
 * session-directory key is different on each of the three:
 *
 *   projectKey('/home/alice/x')          -> --home-alice-x--
 *   projectKey('/Users/alice/x')         -> --Users-alice-x--
 *   projectKey('C:\\Users\\alice\\x')    -> --C-Users-alice-x--
 *
 * `projectKey` is read out of `dsh-session-persistence-jsonl/src/format.ts`
 * (app.asar, 0.2.2-rc.3): every `/`, `\` and `:` becomes one `-` and the whole
 * key is wrapped in `--…--`, so no separator survives to match a path rule.
 * The account name is the sensitive part on all three platforms.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { redact } from 'dsh-remedy-core'

const leaks = (text: string, name: string): boolean => redact(text).text.includes(name)

const SHAPES: readonly (readonly [string, string])[] = [
  // POSIX (Linux) — already covered before P-0038.
  ['/home/alice/project/x.ts', 'alice'],
  ['file:///home/alice/project/x.ts', 'alice'],
  // macOS — the same shape with a different root.
  ['/Users/alice/project/x.ts', 'alice'],
  ['file:///Users/alice/project/x.ts', 'alice'],
  ['cd /Users/alice/project && ls', 'alice'],
  // Encoded session keys: one per platform, and the drive letter is optional.
  ['--C-Users-alice-Desktop-x--', 'alice'],
  ['--Users-alice-Desktop-x--', 'alice'],
  ['--home-alice-Desktop-x--', 'alice'],
  ['C:/Users/x/.dsh/sessions/--Users-alice-Desktop-x--/session.v4.jsonl.zstd', 'alice'],
  ['C:/Users/x/.dsh/sessions/--home-alice-Desktop-x--/session.v4.jsonl.zstd', 'alice'],
  // Escaped code units after the account name: the key is still one already seen.
  ['--Users-alice-Desktop-~9879~76EE~5F00~53D1-dsh-remedy--', 'alice'],
]

test('a home path produced on any of the three platforms is redacted', () => {
  for (const [text, name] of SHAPES) {
    assert.ok(!leaks(text, name), `leaked "${name}" in: ${text}`)
  }
})

test('the redaction keeps the shape readable instead of deleting the path', () => {
  // Deleting the whole path makes a redacted excerpt stop being the text that
  // failed. The account name goes; the rest of the segment stays.
  const encoded = redact('--Users-alice-Desktop-x--').text
  assert.match(encoded, /Desktop-x/)
  assert.match(encoded, /<home-encoded>/)
  const posix = redact('/Users/alice/project/x.ts').text
  assert.match(posix, /project\/x\.ts/)
  assert.match(posix, /<home>/)
})

test('the three encoded keys do not collapse into one another', () => {
  // A rule that dropped the whole `--…--` segment would make three different
  // projects indistinguishable, which is the same mistake the export this
  // rule protects against makes in the other direction.
  const windows = redact('--C-Users-alice-Desktop-x--').text
  const mac = redact('--Users-alice-Desktop-x--').text
  const linux = redact('--home-alice-Desktop-x--').text
  assert.ok(windows.includes('<home-encoded>'))
  assert.ok(mac.includes('<home-encoded>'))
  assert.ok(linux.includes('<home-encoded>'))
})

test('a healthy string that merely looks similar is left exactly as it was', () => {
  // The negative control for over-redaction: `/user/alice` is not `/home/` or
  // `/Users/`, a sentence that contains the word "Users" is not a path, and an
  // encoded-looking string without the `--…--` wrapper is not a session key.
  for (const text of ['/user/alice/x.ts', 'the Users table has 3 rows', 'a-Users-alice-b', '--Users--', 'Users/alice']) {
    const result = redact(text)
    assert.equal(result.text, text, `over-redacted: ${text} -> ${result.text}`)
    assert.equal(result.summary.replacements, 0)
  }
  // And the positive control beside it: a bare macOS home with a one-letter
  // account is still a home path, so it is redacted.
  assert.equal(redact('/Users/x').summary.replacements, 1)
})

test('the shipped evidence carries no home path of any platform', () => {
  // The rule is not only about a live scan: the repository itself publishes
  // fixtures and artifacts, and those are what a reader downloads.
  const files = [
    'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
    'data/fixtures/toolcall-fusion/bare-code-value.json',
    'data/fixtures/toolcall-fusion/missing-array-closer.json',
  ]
  const forbidden = [/\b[A-Za-z]:\\\\?Users/i, /\/home\/[^\s"']+/, /\/Users\/[^\s"']+/]
  for (const name of files) {
    const text = readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${name} still carries a home path (${pattern})`)
    }
  }
})
