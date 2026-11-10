import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resealToolCallArguments } from 'dsh-remedy-core'

/**
 * The real `run_code` echo, byte for byte, as the adapter assembled it. The model
 * wrote a JS program after `"code": ` and omitted the quotes; `Received arguments:`
 * printed it verbatim and the error was `Unexpected token 'c'`.
 */
const PROGRAM = [
  'const fs = await import("node:fs");',
  'const fork = "C:\\\\Users\\\\rongj\\\\AppData\\\\Local\\\\Temp\\\\awesome-fork";',
  'const p = fork + "\\\\data\\\\plugins\\\\jjjjjjjjnnjnn__ai-terminal-pet--packages-dsh-ai-terminal-pet.yml";',
  'console.log(fs.existsSync(p));',
  'console.log(fs.readFileSync(p, "utf8"));',
].join('\n')

const BARE_CODE_ECHO = `{"code": \n${PROGRAM}\n, "description": "Read the registry entry YAML in the fork"}`

/** The segment between `"code": ` and the comma: nothing is trimmed, so the
 * formatting newlines the model wrote stay in the value verbatim. */
const BARE_SEGMENT = `\n${PROGRAM}\n`

test('a bare multi-line value is resealed and every byte of it survives', () => {
  const result = resealToolCallArguments(BARE_CODE_ECHO)
  assert.equal(result.status, 'resealed')
  if (result.status !== 'resealed') return
  assert.equal(result.key, 'code')
  assert.equal(result.value, BARE_SEGMENT)
  const parsed = JSON.parse(result.text) as Record<string, string>
  assert.equal(parsed.code, BARE_SEGMENT)
  assert.equal(parsed.description, 'Read the registry entry YAML in the fork')
})

test('the resealed text is a one-line JSON value, so no raw newline leaks into it', () => {
  const result = resealToolCallArguments(BARE_CODE_ECHO)
  assert.equal(result.status, 'resealed')
  if (result.status !== 'resealed') return
  assert.equal(result.text.includes('\n'), false)
})

test('a value that already parses is never resealed', () => {
  // The caller checks parseability first; this pins the module's own refusal too.
  const result = resealToolCallArguments('{"code": "const x = 1;"}')
  assert.notEqual(result.status, 'resealed')
})

test('a truncated text is never resealed, whatever it looks like', () => {
  // `{"code": "false", "code": ` — the tail is cut mid-string, not a bare value.
  const cut = resealToolCallArguments('{"code": "false", "code": ', { truncated: true })
  assert.notEqual(cut.status, 'resealed')
  if (cut.status === 'refused') assert.equal(cut.code, 'bare-value-unproven')
})

test('a dangling key with a cut value is refused, not quoted', () => {
  // `{"pattern": …, "context":: ` — no closing brace, nothing to quote into.
  const dangling = resealToolCallArguments(
    '{"pattern": "fixture|checksums|verify", "path": "packages/plugin/src/cli.ts", "outputMode": "content", "context":: ',
  )
  assert.notEqual(dangling.status, 'resealed')
})

test('an object that is merely missing its closing brace is refused', () => {
  // A single-line legal object whose `}` never arrived: this is truncation shape,
  // and quoting a segment of it would fabricate a value the model never wrote.
  const unclosed = resealToolCallArguments('{"command": "grep -n x y", "description": "Check all references"')
  assert.notEqual(unclosed.status, 'resealed')
})

test('a single-line bare token is refused, because it is a typo not a blob', () => {
  const result = resealToolCallArguments('{"mode": fast, "path": "a.ts"}')
  assert.notEqual(result.status, 'resealed')
})

test('two possible resealings is a refusal, not a guess', () => {
  // Both commas here reseal into a valid object, so the shape is ambiguous: the
  // module must refuse instead of picking one and silently inventing a boundary.
  const ambiguous = '{"a": \nx "y", "b": "z", "c": 3}'
  const result = resealToolCallArguments(ambiguous)
  assert.equal(result.status, 'refused')
  if (result.status !== 'refused') return
  assert.equal(result.code, 'ambiguous-bare-value')
})

test('a bare value inside an already-valid object is not reachable', () => {
  // If the whole text parses, the model meant what it wrote; resealing must not
  // fire on a legal boolean/number/null in the same position.
  for (const legal of ['{"a": true}', '{"a": null}', '{"a": 12}', '{"a": [1, 2]}']) {
    assert.notEqual(resealToolCallArguments(legal).status, 'resealed')
  }
})

test('an unbalanced-but-short fragment is refused rather than repaired', () => {
  const result = resealToolCallArguments('{"code": ')
  assert.notEqual(result.status, 'resealed')
})

test('the search window refuses a text with too many member heads', () => {
  const many = `{${Array.from({ length: 12 }, (_, index) => `"k${index}": \nvalue${index}\n`).join(', ')}}`
  const result = resealToolCallArguments(many)
  assert.equal(result.status, 'refused')
  if (result.status !== 'refused') return
  assert.match(result.detail, /member heads/)
})
