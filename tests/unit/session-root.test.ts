import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionRoot } from '../../scripts/lib/session-root.mjs'

/** The separator is whatever this platform uses; the shape is what is asserted. */
const normalise = (path: string): string => path.replaceAll('\\', '/')
/** Type annotation rather than inference: this file is compiled with `--noEmit`. */

test('an explicit DSH_SESSIONS wins, because a probe profile writes elsewhere', () => {
  const env = { HOME: '/home/alice', DSH_SESSIONS: '/tmp/probe/sessions' }
  assert.equal(sessionRoot(env), '/tmp/probe/sessions')
})

test('an empty DSH_SESSIONS is ignored instead of becoming the root', () => {
  // `DSH_SESSIONS=` in a shell exports an empty string. Treating it as a path
  // would make every recorder scan the current directory and "find" nothing.
  for (const empty of ['', '   ']) {
    assert.equal(normalise(sessionRoot({ HOME: '/home/alice', DSH_SESSIONS: empty })), '/home/alice/.dsh/sessions')
  }
})

test('the root is the home directory on every platform', () => {
  // Measured on WSL2 (2026-11-15): USERPROFILE is unset on Linux and macOS, so the
  // old `USERPROFILE ?? ''` produced the relative `.dsh/sessions` and the recorder
  // exited 3 without saying why. HOME is what POSIX sets; USERPROFILE is Windows.
  assert.equal(normalise(sessionRoot({ HOME: '/home/alice' })), '/home/alice/.dsh/sessions')
  assert.equal(normalise(sessionRoot({ USERPROFILE: 'C:\\Users\\alice' })), 'C:/Users/alice/.dsh/sessions')
})

test('HOME wins over USERPROFILE when both are set, so a Windows shell under WSL does not leak', () => {
  // A WSL session can inherit USERPROFILE from the Windows side; HOME is the
  // Linux answer and the one the running process actually lives in.
  assert.equal(
    normalise(sessionRoot({ HOME: '/home/alice', USERPROFILE: 'C:\\Users\\alice' })),
    '/home/alice/.dsh/sessions',
  )
})

test('with no environment at all the answer is still a path, not an empty join', () => {
  // The old expression produced `.dsh/sessions` here — a relative path that
  // resolves against whatever directory the script happens to run in.
  const result = sessionRoot({})
  assert.ok(result.length > '.dsh/sessions'.length, `got ${result}`)
  assert.ok(result.includes('.dsh'), result)
  assert.ok(!result.startsWith('.dsh'), result)
})
