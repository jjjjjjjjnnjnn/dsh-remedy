import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * P-0051 — `scan` can count a tool a resumed session stopped declaring (P-0050),
 * and `explain` is the command a person runs to ask what this profile is doing.
 * Until this patch the count existed in one command and the other one printed a
 * table about turn endings only, so the shape #12348 reports was invisible in the
 * place where a decision gets made.
 *
 * What the line may say is narrower than what the log holds: the request set lost
 * a tool this session had called, and the next call to it is answered
 * `UNKNOWN_TOOL` by the host. It may not say the model remembered anything, and it
 * may not name a number it did not read. The cases below are the two negative
 * shapes the core rule already refuses, plus the two ways this command could
 * invent a finding: no `--sessions` at all, and a resume that dropped a tool
 * nobody had used.
 */

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))

function run(args: readonly string[]): { status: number; out: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

type Line = Record<string, unknown>

/** A profile layer shaped like the one DSH writes, so `enabled here` is readable. */
function profileFile(dir: string): string {
  const path = join(dir, 'cordis.patch.yml')
  writeFileSync(path, '# remedy-live\n- id: remedy-stream\n  name: dsh-remedy\n  config:\n    repair: true\n', 'utf8')
  return path
}

/**
 * One session, written as plain JSONL (the scanner sniffs it by the first byte),
 * whose headers and calls are given so each test states its own shape.
 */
function sessionDir(parent: string, lines: readonly Line[]): string {
  const dir = join(parent, 'sessions')
  mkdirSync(join(dir, 'ws', 's1'), { recursive: true })
  const body = [JSON.stringify({ type: 'session', createdAt: '2026-11-17T00:00:00.000Z' }), ...lines.map((line) => JSON.stringify(line))]
  writeFileSync(join(dir, 'ws', 's1', 'session.v4.jsonl.jsonl'), body.join('\n'), 'utf8')
  return dir
}

const header = (seq: number, reason: string, tools: readonly string[]): Line => ({
  type: 'request/header',
  seq,
  data: { reason, header: { tools: tools.map((name) => ({ name })) } },
})
const call = (seq: number, name: string): Line => ({ type: 'tool/call', seq, data: { name } })
const end = (seq: number, kind: string): Line => ({ type: 'turn/end', seq, data: { turn: 1, reason: { kind } } })

/** The measured shape: `ops_stat` used at seq 2, dropped by the resume at seq 9. */
const DROPS_A_USED_TOOL: readonly Line[] = [
  header(1, 'initial', ['read', 'ops_stat']),
  call(2, 'ops_stat'),
  header(9, 'resume', ['read']),
  end(10, 'completed'),
]

test('a resume that dropped a tool this session used is a finding, and it says how many', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-drift-'))
  const { status, out } = run(['explain', '--sessions', sessionDir(dir, DROPS_A_USED_TOOL)])
  assert.match(out, /DROPPED/, `the dropped tool must be named:\n${out}`)
  assert.match(out, /\b1 tool/, 'the count is read from the census, not written as prose')
  assert.equal(status, 1, 'a measured drop is a finding')
})

test('the finding does not need a profile, because the drop is a property of the session', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-drift-'))
  const { status, out } = run([
    'explain',
    '--sessions',
    sessionDir(dir, DROPS_A_USED_TOOL),
    '--profile-file',
    profileFile(dir),
  ])
  assert.match(out, /DROPPED/, `a readable profile must not hide the drop:\n${out}`)
  assert.equal(status, 1, out)
})

test('a resume that dropped a tool nobody called is not a finding', () => {
  // Measured: 120 of the 129 drops on this machine were tools nobody had used.
  const dir = mkdtempSync(join(tmpdir(), 'remedy-drift-'))
  const { status, out } = run([
    'explain',
    '--sessions',
    sessionDir(dir, [header(1, 'initial', ['read', 'mcp_connector_connect']), header(9, 'change', ['read']), end(10, 'completed')]),
  ])
  assert.doesNotMatch(out, /DROPPED/, `a drop nobody used is not a finding:\n${out}`)
  assert.equal(status, 0, out)
})

test('a call made only after the drop is not a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-drift-'))
  const { status, out } = run([
    'explain',
    '--sessions',
    sessionDir(dir, [header(1, 'initial', ['read']), header(9, 'resume', []), call(11, 'read'), end(12, 'completed')]),
  ])
  assert.doesNotMatch(out, /DROPPED/, `the model saw a set without the tool, so the call is not evidence:\n${out}`)
  assert.equal(status, 0, out)
})

test('with no session directory nothing is counted and nothing is a finding', () => {
  // The same rule `explain` already lives by: no input is `unknown`, never `0`.
  const { status, out } = run(['explain'])
  assert.doesNotMatch(out, /DROPPED/, `an unmeasured session cannot be a drop:\n${out}`)
  assert.match(out, /counts are unknown/, out)
  assert.equal(status, 0, out)
})

test('a quiet session stays quiet, so the line is not printed unconditionally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-drift-'))
  const { status, out } = run([
    'explain',
    '--sessions',
    sessionDir(dir, [header(1, 'initial', ['read']), call(2, 'read'), header(9, 'resume', ['read']), end(10, 'completed')]),
  ])
  assert.doesNotMatch(out, /DROPPED/, `a set that kept its tool has nothing to name:\n${out}`)
  assert.equal(status, 0, out)
})
