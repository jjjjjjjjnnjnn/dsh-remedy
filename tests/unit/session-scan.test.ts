import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redactReport, scanSessions, scanSessionText } from 'dsh-remedy/session-scan'

const FUSED = '{"command":"ls"}{"path":"a.ts"}'
const MESSAGE = `Tool call "ops_bash": Unexpected non-whitespace character after JSON at position 20\n\nReceived arguments:\n${FUSED}`

const lines = [
  JSON.stringify({
    type: 'assistant/attempt',
    seq: 10,
    data: {
      turn: 1,
      step: 2,
      stream: [
        { type: 'chunk', chunk: { type: 'block-start', index: 0, blockType: 'tool-call' } },
        {
          type: 'chunk',
          chunk: { type: 'tool-call-delta', index: 0, id: 'call_x', name: 'ops_bash', argumentsDelta: FUSED },
        },
      ],
    },
  }),
  JSON.stringify({
    type: 'turn/end',
    seq: 12,
    data: {
      turn: 1,
      reason: {
        kind: 'error',
        error: { code: 'MALFORMED_RESPONSE', message: MESSAGE },
      },
    },
  }),
  JSON.stringify({ type: 'step/end', seq: 13, data: { turn: 1, step: 2 } }),
  'not json at all',
]

test('the scanner counts attempts, fused calls, failures and unreadable lines separately', () => {
  const report = scanSessionText(lines.join('\n'), 'C:\\Users\\alice\\session.jsonl')
  assert.equal(report.attempts, 1)
  assert.equal(report.fused_calls, 1)
  assert.equal(report.fusion_failures, 1)
  assert.equal(report.repairable_failures, 1)
  assert.equal(report.unreadable_lines, 1)
  assert.deepEqual(report.by_tool, { ops_bash: 1 })
  assert.equal(report.source, '<home>\\session.jsonl')
  assert.equal(report.schema_version, 1)
  assert.equal(report.produced_by, 'dsh-remedy scan')
})

test('examples are redacted before they leave the scanner', () => {
  const report = scanSessionText(lines.join('\n'), '/home/alice/session.jsonl')
  const text = JSON.stringify(report)
  assert.doesNotMatch(text, /alice/)
  assert.match(text, /<home>/)
})

test('redactReport keeps the schema intact', () => {
  const report = redactReport(scanSessionText(lines.join('\n'), 'plain'))
  assert.equal(report.schema_version, 1)
  assert.equal(report.fused_calls, 1)
})

test('a clean session is a zero report, not a missing one', () => {
  const report = scanSessionText(JSON.stringify({ type: 'step/end', seq: 1, data: {} }), 'clean.jsonl')
  assert.equal(report.fused_calls, 0)
  assert.equal(report.fusion_failures, 0)
  assert.equal(report.unreadable_lines, 0)
})

test('a single-file report says it read one file and when', () => {
  const stamped = [
    JSON.stringify({ type: 'step/end', seq: 1, time: 1_760_000_000_000, data: {} }),
    JSON.stringify({ type: 'step/end', seq: 2, time: 1_760_000_000_500, data: {} }),
  ].join('\n')
  const report = scanSessionText(stamped, 'one.jsonl')
  assert.equal(report.files, 1)
  assert.equal(report.before_since, 0)
  assert.deepEqual(report.window, { oldest: 1_760_000_000_000, newest: 1_760_000_000_500 })
})

test('since drops old events and counts them instead of hiding them', () => {
  const stamped = [
    JSON.stringify({ type: 'step/end', seq: 1, time: 1_700_000_000_000, data: {} }),
    JSON.stringify({ type: 'step/end', seq: 2, time: 1_760_000_000_000, data: {} }),
  ].join('\n')
  const report = scanSessionText(stamped, 'one.jsonl', { since: 1_750_000_000_000 })
  assert.equal(report.before_since, 1)
  assert.deepEqual(report.window, { oldest: 1_760_000_000_000, newest: 1_760_000_000_000 })
})

test('an event with no time is unreadable in a windowed scan, not silently kept', () => {
  const unstamped = JSON.stringify({ type: 'step/end', seq: 1, data: {} })
  const report = scanSessionText(unstamped, 'one.jsonl', { since: 1_750_000_000_000 })
  assert.equal(report.unreadable_lines, 1)
  assert.equal(report.before_since, 0)
  assert.deepEqual(report.window, { oldest: null, newest: null })
})

test('a multi-file scan sums the files and keeps one auditable row each', () => {
  const fused = '{"command":"ls"}{"path":"a.ts"}'
  const one = JSON.stringify({
    type: 'assistant/attempt',
    seq: 2,
    time: 1_760_000_000_000,
    data: { stream: [{ type: 'tool-call-chunks', index: 0, id: 'call_x', name: 'ops_bash', args: [fused] }] },
  })
  const batch = scanSessions(
    [
      { label: 'a/session.jsonl', text: one },
      { label: 'b/session.jsonl', text: JSON.stringify({ type: 'step/end', seq: 1, time: 1_760_000_001_000, data: {} }) },
    ],
    'sessions',
  )
  assert.equal(batch.report.files, 2)
  assert.equal(batch.report.attempts, 1)
  assert.equal(batch.report.fused_calls, 1)
  assert.equal(batch.rows.length, 2)
  assert.equal(batch.rows[0]?.fused_calls, 1)
  assert.equal(batch.rows[1]?.fused_calls, 0)
  assert.deepEqual(batch.report.window, { oldest: 1_760_000_000_000, newest: 1_760_000_001_000 })
  // The merged report must not pretend it came from one file.
  assert.equal(batch.report.source, 'sessions')
})

test('an empty batch is a zero report, not a missing one', () => {
  const batch = scanSessions([], 'sessions')
  assert.equal(batch.report.files, 0)
  assert.equal(batch.report.attempts, 0)
  assert.equal(batch.rows.length, 0)
  assert.deepEqual(batch.report.window, { oldest: null, newest: null })
})
