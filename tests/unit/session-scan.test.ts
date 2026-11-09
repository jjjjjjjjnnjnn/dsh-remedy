import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redactReport, scanSessionText } from 'dsh-remedy/session-scan'

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
