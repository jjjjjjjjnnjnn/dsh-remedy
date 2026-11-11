import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGY_TIMEOUT_MS,
  ARGV_LIMIT,
  buildRequest,
  cleanOutput,
  describeSpawnFailure,
  responseOf,
  stdinMessage,
  transportFor,
} from '../../scripts/lib/agy-channel.mjs'

const FACTS = 'facts'
const PATTERNS = 'patterns'
const BRIEF = 'brief'

test('the request carries the brief, the facts, the patterns and the contract in that order', () => {
  const request = buildRequest(BRIEF, FACTS, PATTERNS)
  const briefAt = request.indexOf(BRIEF)
  const factsAt = request.indexOf(FACTS)
  const patternsAt = request.indexOf(PATTERNS)
  const contractAt = request.indexOf('# OUTPUT CONTRACT')
  assert.equal(briefAt, 0)
  assert.ok(factsAt > briefAt)
  assert.ok(patternsAt > factsAt)
  assert.ok(contractAt > patternsAt)
  assert.match(request, /Never invent a number/)
})

test('a request under the command line cap travels on argv', () => {
  assert.equal(transportFor('x'.repeat(ARGV_LIMIT)), 'argv')
})

test('a request over the command line cap travels on stdin', () => {
  assert.equal(transportFor('x'.repeat(ARGV_LIMIT + 1)), 'stdin')
})

test('the stdin message is one ndjson user event', () => {
  const line = stdinMessage('hello')
  assert.ok(line.endsWith('\n'))
  const event = JSON.parse(line.trim())
  assert.equal(event.event, 'user')
  assert.equal(event.message.role, 'user')
  assert.equal(event.message.content[0].type, 'text')
  assert.equal(event.message.content[0].text, 'hello')
})

test('the stdin message survives a payload with newlines and quotes', () => {
  const text = 'a "quoted" line\nsecond line\n'
  const event = JSON.parse(stdinMessage(text).trim())
  assert.equal(event.message.content[0].text, text)
})

test('the last result event wins, not the first', () => {
  const transcript = [
    JSON.stringify({ event: 'init', init: { model: 'm' } }),
    JSON.stringify({ event: 'result', result: { response: 'first' } }),
    JSON.stringify({ event: 'result', result: { response: 'second' } }),
  ].join('\n')
  assert.equal(responseOf(transcript), 'second')
})

test('a transcript with no result event is null, not an empty answer', () => {
  const transcript = JSON.stringify({ event: 'init', init: { model: 'm' } })
  assert.equal(responseOf(transcript), null)
})

test('a transcript with a broken line still yields the result it can read', () => {
  const transcript = ['{"event":"result","result":{"response":"ok"}}', 'not json at all'].join('\n')
  assert.equal(responseOf(transcript), 'ok')
})

test('one wrapping code fence is stripped and the rest is trimmed', () => {
  assert.equal(cleanOutput('```markdown\nbody\n```'), 'body')
  assert.equal(cleanOutput('  body  '), 'body')
})

test('a timeout says it was a timeout, not a null status', () => {
  const line = describeSpawnFailure({ code: 'ETIMEDOUT', message: 'spawn ENAMTIMEDOUT' })
  assert.match(line, /did not finish within/)
  assert.match(line, new RegExp(String(AGY_TIMEOUT_MS / 1000)))
})

test('an over-long command line says so', () => {
  assert.match(describeSpawnFailure({ code: 'ENAMETOOLONG' }), /longer than a command line allows/)
})

test('a missing agy says where to look', () => {
  assert.match(describeSpawnFailure({ code: 'ENOENT' }), /LOCALAPPDATA/)
})

test('an unknown spawn failure still reports the code it was given', () => {
  assert.match(describeSpawnFailure({ code: 'EACCES', message: 'denied' }), /denied/)
})

test('a spawn failure with no error at all is never rendered as null', () => {
  assert.doesNotMatch(describeSpawnFailure(undefined), /null/)
})
