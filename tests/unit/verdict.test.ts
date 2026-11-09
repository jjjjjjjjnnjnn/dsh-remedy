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
