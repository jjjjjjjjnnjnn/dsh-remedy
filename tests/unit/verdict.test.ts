import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatRemedyVerdict, judgeRemedy, type RemedyCounters } from 'dsh-remedy-core'

const counters = (overrides: Partial<RemedyCounters> = {}): RemedyCounters => ({
  streams: 1,
  fused: 0,
  repaired: 0,
  unrepaired: 0,
  truncated: 0,
  errors: 0,
  refused: 0,
  withdrawn: 0,
  ...overrides,
})

test('no stream is unmeasured, not quiet', () => {
  const verdict = judgeRemedy(counters({ streams: 0 }))
  assert.equal(verdict.state, 'unmeasured')
  assert.match(verdict.reasons[0] ?? '', /not mounted/)
})

test('a live seam with no defect is quiet', () => {
  const verdict = judgeRemedy(counters({ streams: 4 }))
  assert.equal(verdict.state, 'quiet')
  assert.match(verdict.headline, /not seen/)
})

test('every fused call repaired is repaired', () => {
  const verdict = judgeRemedy(counters({ fused: 3, repaired: 3 }))
  assert.equal(verdict.state, 'repaired')
  assert.match(verdict.reasons[0] ?? '', /3\/3/)
})

test('one unrepaired call makes the state degraded', () => {
  const verdict = judgeRemedy(counters({ fused: 3, repaired: 2, unrepaired: 1 }))
  assert.equal(verdict.state, 'degraded')
  assert.match(verdict.reasons.join(' '), /re-thrown/)
})

test('the formatted line carries every counter', () => {
  const value = counters({ fused: 2, repaired: 2, truncated: 1 })
  const line = formatRemedyVerdict(judgeRemedy(value), value)
  assert.match(line, /remedy: repaired/)
  assert.match(line, /fused=2/)
  assert.match(line, /truncated=1/)
})

// --- P-0003 negative controls -------------------------------------------------

test('the formatted line carries all eight counter names on one line', () => {
  const value = counters({ fused: 1, repaired: 1, refused: 2, withdrawn: 3, truncated: 1, errors: 4 })
  const line = formatRemedyVerdict(judgeRemedy(value), value)
  assert.equal(line.split('\n').length, 1, 'the counter row must stay a single line')
  for (const name of ['streams', 'fused', 'repaired', 'unrepaired', 'truncated', 'errors', 'refused', 'withdrawn']) {
    assert.match(line, new RegExp(`${name}=\\d+`), `missing ${name}=`)
  }
  assert.match(line, /refused=2/)
  assert.match(line, /withdrawn=3/)
})

test('refused and withdrawn do not move the four states', () => {
  // The same numbers as the P-0002 expectations, with the new counters added:
  // the judgement must be byte-identical, because the vocabulary is frozen.
  const quiet = judgeRemedy(counters({ streams: 4, refused: 9, withdrawn: 5 }))
  assert.equal(quiet.state, 'quiet', 'a refusal is not evidence of fusion')
  assert.deepEqual(quiet.reasons, ['4 stream(s) observed, no fused tool call'])
  assert.equal(quiet.headline, 'seam live, defect not seen')

  const degraded = judgeRemedy(counters({ fused: 3, repaired: 2, unrepaired: 1, refused: 1, withdrawn: 1 }))
  assert.equal(degraded.state, 'degraded')
  assert.deepEqual(degraded.reasons, [
    '3 fused call(s), 1 could not be repaired',
    'the original failure was re-thrown, not swallowed',
  ])

  const repaired = judgeRemedy(counters({ fused: 3, repaired: 3, refused: 2, withdrawn: 0 }))
  assert.equal(repaired.state, 'repaired')
  assert.equal(repaired.headline, 'defect seen and repaired')

  const unmeasured = judgeRemedy(counters({ streams: 0, refused: 4, withdrawn: 4 }))
  assert.equal(unmeasured.state, 'unmeasured')
  assert.equal(unmeasured.headline, 'no measurement')
})
