import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanSessions, scanSessionText } from 'dsh-remedy/session-scan'

/**
 * R57 / P-0047 — a turn that finished without answering anyone.
 *
 * P-0044 asked the question of a truncated turn. The same question has a second
 * ending: upstream #13169 reports a turn whose last assistant message carries one
 * `reasoning` block and `turn/end` still says `completed`. This machine produced
 * zero of them until `.tmp/r57-fake-openai.mjs` replayed the shape —
 * `reasoning_content` deltas, then `finish_reason: "stop"` — which the adapter's
 * empty-response guard lets through because it counts *blocks*, not usable content.
 *
 * The rules below are the ones that must hold on that evidence:
 *   1. a `completed` turn whose last step is reasoning-only is counted;
 *   2. a `completed` turn with text is not;
 *   3. a `completed` turn with a tool call is not (the turn continued);
 *   4. `max_tokens` keeps its own counter, so the two endings never merge;
 *   5. only the last step decides, and a missing message counts as no answer.
 */

const event = (turn: number, step: number, content: readonly Record<string, unknown>[]) =>
  JSON.stringify({ type: 'assistant/message', seq: 0, time: 1_760_000_000_000, data: { turn, step, message: { content } } })

const end = (turn: number, kind: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'turn/end', seq: 0, time: 1_760_000_000_000, data: { turn, reason: { kind, ...extra } } })

const report = (lines: readonly string[]) => scanSessionText(lines.join('\n'), 'memory.jsonl')

test('a completed turn whose only block is reasoning answered nobody', () => {
  // The measured shape: one reasoning block, then `completed`.
  const result = report([event(1, 1, [{ type: 'reasoning', text: 'thinking it over' }]), end(1, 'completed')])
  assert.equal(result.turns.completed, 1)
  assert.equal(result.completed_without_answer, 1)
  assert.equal(result.truncated_without_answer, 0, 'this was not a truncation')
})

test('a completed turn with text answered its user', () => {
  const result = report([event(1, 1, [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'OK' }]), end(1, 'completed')])
  assert.equal(result.completed_without_answer, 0)
})

test('a completed turn whose last step ran a tool call is not counted', () => {
  const result = report([
    event(1, 1, [{ type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' }]),
    end(1, 'completed'),
  ])
  assert.equal(result.completed_without_answer, 0, 'the tool call is visible in the transcript')
})

test('the two endings keep separate counters', () => {
  const result = report([
    event(1, 1, [{ type: 'reasoning', text: 'think' }]),
    end(1, 'max-tokens'),
    event(2, 1, [{ type: 'reasoning', text: 'think' }]),
    end(2, 'completed'),
  ])
  assert.equal(result.truncated_without_answer, 1)
  assert.equal(result.completed_without_answer, 1)
})

test('only the last step decides, and a missing message answered nothing', () => {
  const answerThenReason = report([
    event(1, 1, [{ type: 'text', text: 'OK' }]),
    event(1, 2, [{ type: 'reasoning', text: 'more thinking' }]),
    end(1, 'completed'),
  ])
  assert.equal(answerThenReason.completed_without_answer, 1, 'the last step said nothing')

  const reasonThenAnswer = report([
    event(2, 1, [{ type: 'reasoning', text: 'think' }]),
    event(2, 2, [{ type: 'text', text: 'OK' }]),
    end(2, 'completed'),
  ])
  assert.equal(reasonThenAnswer.completed_without_answer, 0, 'the last step answered')

  const noMessage = report([end(3, 'completed')])
  assert.equal(noMessage.completed_without_answer, 1, 'no assistant message is no answer')
})

test('every row carries its own count, so a total audits backwards', () => {
  const batch = scanSessions(
    [
      { label: 'a.jsonl', text: [event(1, 1, [{ type: 'reasoning', text: 'think' }]), end(1, 'completed')].join('\n') },
      { label: 'b.jsonl', text: [event(1, 1, [{ type: 'text', text: 'OK' }]), end(1, 'completed')].join('\n') },
    ],
    'memory',
  )
  assert.equal(batch.report.completed_without_answer, 1)
  assert.deepEqual(
    batch.rows.map((row) => row.completed_without_answer),
    [1, 0],
    'the file that answered and the file that did not are not the same row',
  )
  assert.equal(
    batch.rows.reduce((sum, row) => sum + row.completed_without_answer, 0),
    batch.report.completed_without_answer,
    'rows sum to the report',
  )
})
