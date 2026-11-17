import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  messageOnToolCall,
  noteAssistantMessage,
  turnAnswered,
  turnOnToolCall,
  type LastAnswer,
} from 'dsh-remedy-core'
import { scanSessions } from 'dsh-remedy/session-scan'

/**
 * P-0052 — upstream #12741: a long tool loop can finish a turn with no visible
 * reply. The host's loop ends a step with tool calls only when a tool result
 * carries `concludesTurn` (`dsh-agent-loop/src/agent.ts` `toolCalls.length === 0`
 * / `result.concluded ? { kind: 'completed' } : null`), so a `completed` turn can
 * end on a step that still has a tool call. The UI's `latestAnswer` refuses a
 * final step that contains any tool-call block (`turn-process.ts:160-161`), even
 * when the same step also has text. This project counts a tool call as visible
 * work (P-0044), so `turnAnswered` stays as it is; P-0052 adds a second count
 * that names the gap instead of redefining the first one.
 *
 * One rule, five negative controls: the last step decides, a text-only control
 * after a tool step is not the shape, `max_tokens` is not `completed`, and a
 * missing assistant message is not a tool call.
 */

const text = (value: string): Record<string, unknown> => ({ type: 'text', text: value })
const reasoning = (value: string): Record<string, unknown> => ({ type: 'reasoning', text: value })
const toolCall = (name = 'probe'): Record<string, unknown> => ({
  type: 'tool-call',
  id: 'call_1',
  name,
  arguments: '{}',
})

function last(...steps: Array<readonly Record<string, unknown>[]>): ReadonlyMap<string, LastAnswer> {
  const map = new Map<string, LastAnswer>()
  for (const [index, content] of steps.entries()) noteAssistantMessage(map, 1, index + 1, content)
  return map
}

test('a tool call in the last assistant message is the shape, with or without text', () => {
  assert.equal(messageOnToolCall([text('Done.'), toolCall()]), true)
  assert.equal(messageOnToolCall([toolCall()]), true)
  assert.equal(messageOnToolCall([text('Done.')]), false)
  assert.equal(messageOnToolCall([reasoning('planning')]), false)
  assert.equal(messageOnToolCall(null), false)
})

test('only the last step decides, and the existing answer rule stays as it was', () => {
  const endsOnTool = last([toolCall()])
  assert.equal(turnOnToolCall(endsOnTool, 1), true)
  assert.equal(turnAnswered(endsOnTool, 1), true, 'P-0044 still counts the tool call as work')

  const control = last([text('Done.'), toolCall()], [text('OK')])
  assert.equal(turnOnToolCall(control, 1), false, 'a text-only final step is the control, not the shape')
  assert.equal(turnAnswered(control, 1), true)

  const viaText = last([text('Done.')], [text('Done.'), toolCall()])
  assert.equal(turnOnToolCall(viaText, 1), true, 'the later step wins')
  assert.equal(turnOnToolCall(last([text('Done.')]), 1), false)
})

function scan(lines: readonly Record<string, unknown>[]) {
  const body = [
    JSON.stringify({ type: 'session', createdAt: '2026-11-17T00:00:00.000Z' }),
    ...lines.map((line) => JSON.stringify(line)),
  ].join('\n')
  return scanSessions([{ label: 'fixture.jsonl', text: body }], 'fixture.jsonl')
}

const message = (turn: number, step: number, content: readonly Record<string, unknown>[]) => ({
  type: 'assistant/message',
  seq: turn * 10 + step,
  data: { turn, step, message: { content } },
})
const end = (turn: number, kind: string) => ({
  type: 'turn/end',
  seq: turn * 10 + 9,
  data: { turn, reason: { kind } },
})

test('scan counts completed turns on a tool call without stealing the no-answer count', () => {
  const { report, rows } = scan([
    message(1, 1, [text('Done.'), toolCall()]),
    end(1, 'completed'),
    message(2, 1, [text('OK')]),
    end(2, 'completed'),
    message(3, 1, [reasoning('planning')]),
    end(3, 'completed'),
    message(4, 1, [toolCall()]),
    end(4, 'max-tokens'),
  ])

  assert.equal(report.turns.completed, 3)
  assert.equal(report.completed_on_tool_call, 1, 'exactly the completed turn whose last step is a tool call')
  assert.equal(report.completed_without_answer, 1, 'the reasoning-only turn keeps P-0047')
  assert.equal(report.truncated_without_answer, 0, 'a max-tokens turn with a tool call answered with work')
  assert.equal(rows[0]?.completed_on_tool_call, 1, 'the per-file row is the same number')
})

test('a text-only control after a tool step is not counted', () => {
  const { report } = scan([
    message(1, 1, [text('Done.'), toolCall()]),
    message(1, 2, [text('OK')]),
    end(1, 'completed'),
  ])
  assert.equal(report.completed_on_tool_call, 0)
  assert.equal(report.completed_without_answer, 0)
})

test('a completed turn with no assistant message is not counted as a tool call', () => {
  const { report } = scan([end(1, 'completed')])
  assert.equal(report.completed_on_tool_call, 0)
  assert.equal(report.completed_without_answer, 1)
})
