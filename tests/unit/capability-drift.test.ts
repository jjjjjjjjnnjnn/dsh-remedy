import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lostTools, type HeaderTools } from 'dsh-remedy-core'

/**
 * R59 / P-0050 — upstream #12348: a resumed session keeps memory of a tool the
 * current request set no longer declares.
 *
 * What a log can prove offline is narrower than what the report describes, and the
 * rule is written to that narrower claim: a tool this session **called before** the
 * header that stopped declaring it. Measured on this host: 114 session files, 293
 * headers (109 initial, 50 resume, 43 change, 91 series), 9 such pairs in 5 sessions,
 * and one of them (ops_stat in 8e75991d) was called four times after the drop and
 * answered `UNKNOWN_TOOL` by the host.
 *
 * The cases below are the measured shapes, plus the negative controls that keep the
 * rule from counting something it did not see.
 */

const header = (seq: number, reason: string, tools: readonly string[]): HeaderTools => ({ seq, reason, tools })
const call = (seq: number, name: string) => ({ seq, name })

test('a tool called before a resume that dropped it is a loss', () => {
  const losses = lostTools(
    [header(1, 'initial', ['read', 'ops_stat']), header(20, 'resume', ['read'])],
    [call(5, 'ops_stat'), call(6, 'ops_stat')],
  )
  assert.deepEqual(losses, [{ tool: 'ops_stat', atSeq: 20, reason: 'resume', callsBefore: 2 }])
})

test('a tool that was dropped but never called is not a loss', () => {
  // Measured shape: 121 of the 129 drops on this host were tools nobody had used,
  // and counting them would report a session as broken that never asked for them.
  const losses = lostTools(
    [header(1, 'initial', ['read', 'mcp_connector_connect']), header(9, 'change', ['read'])],
    [call(2, 'read')],
  )
  assert.deepEqual(losses, [])
})

test('a call made only after the drop is not evidence of a loss', () => {
  // The request the model saw had already lost the tool, so the call was made
  // against a set that lacked it; what it did with that set is a different question.
  const losses = lostTools([header(1, 'initial', ['read']), header(10, 'resume', [])], [call(11, 'read')])
  assert.deepEqual(losses, [])
})

test('a series header neither loses nor restores anything', () => {
  // Measured: 91 series headers on this host, 0 tools added and 0 dropped by them.
  const losses = lostTools(
    [header(1, 'initial', ['read', 'ops_stat']), header(2, 'series', ['read']), header(30, 'resume', ['read'])],
    [call(3, 'ops_stat')],
  )
  assert.equal(losses.length, 1, 'the drop is booked at the resume, not at the series frame')
  assert.equal(losses[0]?.atSeq, 30)
  assert.equal(losses[0]?.reason, 'resume')
})

test('a change header counts the same way a resume does', () => {
  // Measured: 43 change headers, 108 tools dropped by them; one was called first.
  const losses = lostTools([header(1, 'initial', ['ops_remove']), header(40, 'change', [])], [call(2, 'ops_remove')])
  assert.equal(losses.length, 1)
  assert.equal(losses[0]?.reason, 'change')
})

test('one tool is booked once, however often the set changes', () => {
  // Dropped, restored, dropped again: the session lost it once, at the first drop.
  const losses = lostTools(
    [
      header(1, 'initial', ['read', 'ops_stat']),
      header(10, 'change', ['read']),
      header(20, 'change', ['read', 'ops_stat']),
      header(30, 'resume', ['read']),
    ],
    [call(5, 'ops_stat')],
  )
  assert.equal(losses.length, 1, 'a re-declared tool is not a second loss')
  assert.equal(losses[0]?.atSeq, 10, 'the first header that stopped declaring it is the one booked')
})

test('a tool a later header still declines is not a loss while it was never called', () => {
  const losses = lostTools(
    [header(1, 'initial', ['a', 'b']), header(2, 'resume', ['a']), header(3, 'resume', ['a'])],
    [call(1, 'a')],
  )
  assert.deepEqual(losses, [])
})

test('an unknown reason is never treated as a re-description of the session', () => {
  // A reason this rule does not know is not evidence that the set moved: the host
  // may add one, and guessing would invent a finding.
  const losses = lostTools([header(1, 'initial', ['read']), header(5, 'unknown', [])], [call(2, 'read')])
  assert.deepEqual(losses, [])
})

test('the rule sees the measured shape and does not inflate it', () => {
  // Reconstructed from 8e75991d: five tools dropped at seq 945 after use, then two
  // more at seq 1382, and `ops_stat` called four times after the drop.
  const headers = [
    header(1, 'initial', ['ops_stat', 'ops_write_file', 'ops_remove', 'ops_copy', 'ops_move', 'ops_glob']),
    header(945, 'resume', ['ops_glob']),
    header(1382, 'resume', ['ops_glob']),
  ]
  const calls = [call(260, 'ops_stat'), call(544, 'ops_write_file'), call(1010, 'ops_stat')]
  const losses = lostTools(headers, calls)
  assert.deepEqual(
    losses.map((loss) => loss.tool).sort(),
    ['ops_stat', 'ops_write_file'],
    'the tools that were merely declared are not losses',
  )
  assert.equal(losses.find((loss) => loss.tool === 'ops_stat')?.callsBefore, 1)
})
