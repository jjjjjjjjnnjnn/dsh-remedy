import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endingOf, messageAnswers, noteAssistantMessage, turnAnswered, type LastAnswer } from 'dsh-remedy-core'

test('a text block answers, a tool call answers, and reasoning alone does not', () => {
  assert.equal(messageAnswers([{ type: 'text', text: 'done' }]), true)
  assert.equal(messageAnswers([{ type: 'tool-call', id: 'c', name: 'read', arguments: '{}' }]), true)
  assert.equal(messageAnswers([{ type: 'reasoning', text: '...' }]), false)
  // Whitespace is not an answer, and neither is a block this rule does not know.
  assert.equal(messageAnswers([{ type: 'text', text: '   \n ' }]), false)
  assert.equal(messageAnswers([{ type: 'summary' }]), false)
  assert.equal(messageAnswers([]), false)
  assert.equal(messageAnswers(undefined), false)
})

test('the last step of a turn decides, not the step that ran a tool call', () => {
  // Step 1 ran a tool, step 2 answered with only reasoning: the user saw nothing.
  const last = new Map<string, LastAnswer>()
  noteAssistantMessage(last, 1, 1, [{ type: 'tool-call', id: 'c', name: 'talk', arguments: '{}' }])
  noteAssistantMessage(last, 1, 2, [{ type: 'reasoning', text: '....' }])
  assert.equal(turnAnswered(last, 1), false)
})

test('the census spelling of an ending is the one the report uses', () => {
  assert.equal(endingOf('max-tokens'), 'max_tokens')
  assert.equal(endingOf('completed'), 'completed')
  assert.equal(endingOf(undefined), 'undefined')
})

test('a turn with no assistant message at all answered nothing', () => {
  assert.equal(turnAnswered(new Map<string, LastAnswer>(), 7), false)
})

test('an earlier step that answered is not overwritten by a later silent one', () => {
  const last = new Map<string, LastAnswer>()
  noteAssistantMessage(last, 1, 2, [{ type: 'text', text: 'answer' }])
  noteAssistantMessage(last, 1, 1, [{ type: 'reasoning', text: '...' }])
  assert.equal(turnAnswered(last, 1), true, 'the later step wins; an out-of-order earlier step must not')
})

test('a redacted or empty content array never counts as an answer', () => {
  const last = new Map<string, LastAnswer>()
  noteAssistantMessage(last, 1, 1, [])
  assert.equal(turnAnswered(last, 1), false)
})
