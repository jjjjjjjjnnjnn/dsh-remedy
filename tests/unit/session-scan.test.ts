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

// ---- P-0009: the first line of every session is a `session` header whose
// time lives in `createdAt`, not `time`. A window that calls that unreadable
// reports a readable file as broken data and inflates the unreadable count by
// exactly one per session.

test('a session header is dated by createdAt, so a windowed scan reads it', () => {
  const header = JSON.stringify({ type: 'session', version: 4, id: 'session-x', createdAt: 1_760_000_000_000 })
  const report = scanSessionText(header, 'one.jsonl', { since: 1_750_000_000_000 })
  assert.equal(report.unreadable_lines, 0, 'the header has a time, it is just called createdAt')
  assert.deepEqual(report.window, { oldest: 1_760_000_000_000, newest: 1_760_000_000_000 })
})

test('a session header older than the window is counted as before_since', () => {
  const header = JSON.stringify({ type: 'session', version: 4, id: 'session-x', createdAt: 1_700_000_000_000 })
  const report = scanSessionText(header, 'one.jsonl', { since: 1_750_000_000_000 })
  assert.equal(report.unreadable_lines, 0)
  assert.equal(report.before_since, 1, 'it was looked at and left outside, which is not the same as unreadable')
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

// ---- P-0006: the scan is a fault map, so it must count every way a turn ends.
// The repairable class is one road; a map with one road is not a map.

/** One `turn/end` line with the given reason, so each test states its shape. */
function turnEnd(seq: number, time: number, reason: Record<string, unknown>): string {
  return JSON.stringify({ type: 'turn/end', seq, time, data: { turn: 1, reason } })
}

test('a scan counts every way a turn can end, not only the repairable one', () => {
  const text = [
    turnEnd(1, 1_760_000_000_000, { kind: 'completed' }),
    turnEnd(2, 1_760_000_000_100, { kind: 'max-tokens' }),
    turnEnd(3, 1_760_000_000_200, { kind: 'aborted', reason: { kind: 'user' } }),
    turnEnd(4, 1_760_000_000_300, { kind: 'error', error: { code: 'SERVER', message: '503' } }),
  ].join('\n')
  const report = scanSessionText(text, 'turns.jsonl')
  assert.deepEqual(report.turns, { completed: 1, max_tokens: 1, aborted: 1, error: 1 })
  // Only MALFORMED_RESPONSE is repairable, so only it moves the failure count.
  assert.equal(report.fusion_failures, 0)
})

test('an error code that cannot be repaired is counted and named', () => {
  const text = [
    turnEnd(1, 1_760_000_000_000, {
      kind: 'error',
      error: { code: 'UNSUPPORTED_REASONING_EFFORT', message: 'model does not support reasoning effort "xhigh"' },
    }),
    turnEnd(2, 1_760_000_000_100, { kind: 'error', error: { code: 'SERVER', message: '503' } }),
  ].join('\n')
  const report = scanSessionText(text, 'codes.jsonl')
  assert.deepEqual(report.error_codes, { SERVER: 1, UNSUPPORTED_REASONING_EFFORT: 1 })
  assert.equal(report.fusion_failures, 0, 'a non-repairable error is never a fusion failure')
  assert.equal(report.turns.error, 2)
})

test('a malformed turn is both a fusion failure and a census error', () => {
  const report = scanSessionText(lines.join('\n'), 'mixed.jsonl')
  assert.equal(report.fusion_failures, 1)
  assert.deepEqual(report.error_codes, { MALFORMED_RESPONSE: 1 })
  assert.equal(report.turns.error, 1)
})

test('the census is summed across files and each row keeps its own', () => {
  const one = turnEnd(1, 1_760_000_000_000, { kind: 'max-tokens' })
  const two = turnEnd(1, 1_760_000_000_500, { kind: 'completed' })
  const batch = scanSessions(
    [
      { label: 'a/session.jsonl', text: one },
      { label: 'b/session.jsonl', text: two },
    ],
    'sessions',
  )
  assert.deepEqual(batch.report.turns, { completed: 1, max_tokens: 1, aborted: 0, error: 0 })
  assert.deepEqual(batch.rows[0]?.turns, { completed: 0, max_tokens: 1, aborted: 0, error: 0 })
  assert.deepEqual(batch.rows[1]?.turns, { completed: 1, max_tokens: 0, aborted: 0, error: 0 })
  assert.deepEqual(batch.report.error_codes, {})
})

test('a windowed scan counts only the turns it looked at', () => {
  const text = [
    turnEnd(1, 1_700_000_000_000, { kind: 'max-tokens' }),
    turnEnd(2, 1_760_000_000_000, { kind: 'completed' }),
  ].join('\n')
  const report = scanSessionText(text, 'window.jsonl', { since: 1_750_000_000_000 })
  // The dropped event is reported, not counted: before_since says how much was
  // left outside, and the census only speaks for what was read.
  assert.equal(report.before_since, 1)
  assert.deepEqual(report.turns, { completed: 1, max_tokens: 0, aborted: 0, error: 0 })
})
