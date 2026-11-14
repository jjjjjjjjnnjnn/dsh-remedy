import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidatesFromDiscussions, knownNumbers, okSource, summarize, unreadableSource } from '../../scripts/lib/intake.mjs'

test('a source that answered keeps its counts and carries no reason', () => {
  const source = okSource('S-NPM', { downloads: 2720 })
  assert.equal(source.ok, true)
  assert.deepEqual(source.counts, { downloads: 2720 })
  assert.equal(source.unreadable_reason, null)
})

test('a source that did not answer has null counts, never zero', () => {
  const source = unreadableSource('S-REDDIT', 'ECONNRESET')
  assert.equal(source.ok, false)
  assert.equal(source.counts, null, 'zero would read as "nothing there"')
  assert.equal(source.unreadable_reason, 'ECONNRESET')
})

test('the summary names every source that could not be read', () => {
  const summary = summarize([
    okSource('S-DSH', { unique: 93 }),
    unreadableSource('S-REDDIT', 'ECONNRESET'),
    unreadableSource('S-SELF', 'no gh login'),
  ])
  assert.equal(summary.answered, 1)
  assert.deepEqual(summary.unreadable, ['S-REDDIT', 'S-SELF'])
  assert.equal(summary.complete, false)
  assert.match(summary.note, /null, not zero/)
})

test('a complete run says so without pretending every source is healthy', () => {
  const summary = summarize([okSource('S-DSH', {}), okSource('S-NPM', {})])
  assert.equal(summary.complete, true)
  assert.match(summary.note, /every registered source answered/)
})

test('candidates keep the discussion number and drop malformed nodes', () => {
  const nodes = [
    { number: 12901, title: 'a', url: 'https://example.com/12901', updatedAt: '2026-11-10T00:00:00Z' },
    { number: 'x', title: 'b', url: 'https://example.com/x' },
    { title: 'no number', url: 'https://example.com/y' },
  ]
  const candidates = candidatesFromDiscussions(nodes)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.number, 12901)
})

test('the ledger lookup is by discussion number, not by title', () => {
  const known = knownNumbers('| <https://github.com/deepseek-ai/deepseek-harness/discussions/12901> |')
  assert.ok(known.has(12901))
  assert.equal(known.has(13211), false)
})
