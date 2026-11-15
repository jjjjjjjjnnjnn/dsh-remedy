import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanSessionText } from '../../packages/plugin/dist/session-scan.js'

/**
 * P-0042 — the scanner must carry the one fact that makes the refused effort
 * actionable: which level was refused, for which route.
 *
 * The 37 dead turns on this host were all one sentence, and the scan that
 * counted them threw that sentence away: it counted `UNSUPPORTED_REASONING_EFFORT`
 * by code and kept nothing about the level. So `explain` could name the class but
 * never say "your profile asks for xhigh and the host refuses xhigh" — the two
 * halves never met. The negative control is below: a code without a sentence is
 * counted as a code and must NOT become a refused_efforts key.
 */

const turnEnd = (seq: number, reason: unknown): string =>
  JSON.stringify({ type: 'turn/end', seq, data: { turn: 1, reason } })

const refusal = (message: string): string =>
  turnEnd(1, { kind: 'error', error: { code: 'UNSUPPORTED_REASONING_EFFORT', message } })

test('a refusal that names provider, model and level becomes one counted key', () => {
  const message =
    'provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"'
  const report = scanSessionText(refusal(message), 'one.jsonl')
  assert.deepEqual(report.refused_efforts, { 'opendesign/deepseek-v4.1-flash-eco xhigh': 1 })
  // The class itself is still counted the P-0006 way; this addition duplicates
  // nothing and moves no existing field.
  assert.deepEqual(report.error_codes, { UNSUPPORTED_REASONING_EFFORT: 1 })
})

test('the same route and level refused twice counts twice', () => {
  const message =
    'provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"'
  const text = [turnEnd(1, { kind: 'error', error: { code: 'UNSUPPORTED_REASONING_EFFORT', message } }), turnEnd(2, { kind: 'error', error: { code: 'UNSUPPORTED_REASONING_EFFORT', message } })].join('\n')
  assert.deepEqual(scanSessionText(text, 'two.jsonl').refused_efforts, {
    'opendesign/deepseek-v4.1-flash-eco xhigh': 2,
  })
})

test('a different level on the same route is its own key, never merged', () => {
  const text = [
    refusal('provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"'),
    turnEnd(2, {
      kind: 'error',
      error: {
        code: 'UNSUPPORTED_REASONING_EFFORT',
        message: 'provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "max"',
      },
    }),
  ].join('\n')
  assert.deepEqual(scanSessionText(text, 'levels.jsonl').refused_efforts, {
    'opendesign/deepseek-v4.1-flash-eco max': 1,
    'opendesign/deepseek-v4.1-flash-eco xhigh': 1,
  })
})

test('a code with no sentence stays a code and invents no key (negative control)', () => {
  // The exact shape a localized host message would produce, and the reason this
  // field may not be derived from the code alone: `xhigh` would be a guess.
  for (const message of ['', 'model does not support reasoning effort "xhigh"', 'provider "opendesign"']) {
    const report = scanSessionText(refusal(message), 'vague.jsonl')
    assert.deepEqual(report.refused_efforts, {}, `invented a key from ${JSON.stringify(message)}`)
    assert.deepEqual(report.error_codes, { UNSUPPORTED_REASONING_EFFORT: 1 })
  }
})

test('an accepted effort produces no key at all', () => {
  const text = JSON.stringify({ type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.deepEqual(scanSessionText(text, 'ok.jsonl').refused_efforts, {})
})

test('a report that never saw a refusal still carries the field, empty', () => {
  // A missing field would make every reader guess between "no refusals" and
  // "this build cannot tell"; an empty map states the measurement.
  const report = scanSessionText('', 'empty.jsonl')
  assert.deepEqual(report.refused_efforts, {})
})
