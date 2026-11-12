import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describePreflight, EFFORT_ORDER, preflightEffort, supportedEfforts } from 'dsh-remedy-core'

/**
 * P-0013 judgment first: these cases are copied from the host's own sessions,
 * not invented. The 37 dead turns on this machine all said
 *
 *   provider "opendesign" model "deepseek-v4.1-flash-eco"
 *   does not support reasoning effort "xhigh"
 *
 * and both local profiles declare that model with `off/high/xhigh/max`.
 */

/** The declared block for `deepseek-v4.1-flash-eco` as `remedy-live` writes it. */
const remedyLiveModel = {
  reasoning: {
    efforts: ['off', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
  },
}

/** The same model as the `desktop` profile writes it: no `xhigh` at all. */
const desktopModel = {
  reasoning: {
    efforts: ['off', 'medium', 'high', 'max'],
    defaultEffort: 'high',
  },
}

test('the adapter order is the one its own source escalates through', () => {
  assert.deepEqual([...EFFORT_ORDER], ['off', 'low', 'high', 'xhigh', 'max'])
})

test('a declared effort that the profile lists is accepted', () => {
  for (const level of ['off', 'high', 'xhigh', 'max']) {
    const decision = preflightEffort(level, remedyLiveModel)
    assert.equal(decision.verdict, 'ok', `${level} is declared, so it must be accepted`)
    assert.equal(decision.effective, level)
  }
})

test('the desktop profile cannot request xhigh, and preflight says so before a token is spent', () => {
  const decision = preflightEffort('xhigh', desktopModel)
  assert.equal(decision.verdict, 'refuse')
  assert.equal(decision.effective, 'xhigh')
  assert.deepEqual([...decision.supported], ['off', 'medium', 'high', 'max'])
  assert.equal(decision.suggestion, 'high', 'the nearest accepted level at or below xhigh is high')
  assert.match(String(decision.reason), /off\/medium\/high\/max/)
})

test('a model with no reasoning metadata accepts only off, which the adapter itself says', () => {
  assert.deepEqual([...supportedEfforts({})], ['off'], 'getSupportedThinkingLevels returns ["off"] for a model without reasoning')
  assert.equal(preflightEffort('off', {}).verdict, 'ok')
  const decision = preflightEffort('high', {})
  assert.equal(decision.verdict, 'refuse')
  assert.equal(decision.suggestion, 'off')
  assert.match(String(decision.reason), /no reasoning metadata/)
})

test('omitting the effort is always safe and reports the adapter default', () => {
  const decision = preflightEffort(undefined, remedyLiveModel)
  assert.equal(decision.verdict, 'ok')
  assert.equal(decision.effective, 'high', 'the profile names a default, so that is what the request carries')
  const bare = preflightEffort(undefined, {})
  assert.equal(bare.verdict, 'ok')
  assert.equal(bare.effective, undefined, 'no default is reported rather than invented')
})

test('a thinking-level map beats the efforts list, because the map is what refuses at request time', () => {
  // The two can disagree: the cosmetic list says xhigh, the wire map does not
  // carry it, and `resolveReasoningLevel` reads the map.
  const decision = preflightEffort('xhigh', {
    reasoning: { efforts: ['off', 'high', 'xhigh', 'max'], thinkingLevelMap: { off: null, high: 'high', max: 'max' } },
  })
  assert.equal(decision.verdict, 'refuse', 'the map has no xhigh entry, so the request would be refused')
  // The adapter's filter is `mapped === null → false`, then `xhigh|max → mapped !== undefined`,
  // then `true`. So a level absent from the map (`undefined`) is still accepted for
  // off/low/high while an explicit `null` removes it. That quirk is the adapter's,
  // and preflight mirrors it instead of inventing a tidier rule.
  assert.deepEqual([...decision.supported], ['low', 'high', 'max'])
})

test('an unknown level is refused, not guessed at', () => {
  // A profile that writes a level the adapter does not know must not be silently
  // downgraded: the adapter throws, so preflight refuses.
  const decision = preflightEffort('ultra', remedyLiveModel)
  assert.equal(decision.verdict, 'refuse')
  assert.match(String(decision.reason), /"ultra"/)
})

test('the description names the provider, the model and the fixable suggestion', () => {
  const decision = preflightEffort('xhigh', desktopModel)
  assert.match(describePreflight('opendesign', 'deepseek-v4.1-flash-eco', decision), /nearest accepted level is "high"/)
  assert.match(describePreflight('opendesign', 'deepseek-v4.1-flash-eco', preflightEffort('max', remedyLiveModel)), /is accepted/)
})

test('preflight never mutates the decision it reports', () => {
  // A preflight that silently returns a corrected level would be the automatic
  // downgrade this patch refuses to do by default.
  const decision = preflightEffort('xhigh', desktopModel)
  assert.equal(decision.effective, 'xhigh', 'the effective level stays what was asked for; the suggestion is separate')
})
