import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * P-0052 — `scan` counts a completed turn whose last step is a tool call; `explain`
 * is where a person reads it. The UI counts only a final text-only step as the
 * answer (`turn-process.ts:160-161`), so the shape is "no visible reply" even when
 * the same step carries text. This command must name it without redefining the
 * turn-endings table, and without inventing a zero when no directory was measured.
 */

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))

function run(args: readonly string[]): { status: number; out: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const text = (value: string) => ({ type: 'text', text: value })
const reasoning = (value: string) => ({ type: 'reasoning', text: value })
const toolCall = () => ({ type: 'tool-call', id: 'call_1', name: 'probe_conclude', arguments: '{}' })

const message = (content: readonly Record<string, unknown>[]) => ({
  type: 'assistant/message',
  seq: 2,
  data: { turn: 1, step: 1, message: { content } },
})
const end = (kind: string) => ({ type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind } } })

function sessionDir(parent: string, lines: readonly Record<string, unknown>[]): string {
  const dir = join(parent, 'sessions')
  mkdirSync(join(dir, 'ws', 's1'), { recursive: true })
  const body = [JSON.stringify({ type: 'session', createdAt: '2026-11-17T00:00:00.000Z' }), ...lines.map((line) => JSON.stringify(line))]
  writeFileSync(join(dir, 'ws', 's1', 'session.v4.jsonl.jsonl'), body.join('\n'), 'utf8')
  return dir
}

test('a completed turn whose last step is a tool call is a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-toolcall-'))
  const { status, out } = run(['explain', '--sessions', sessionDir(dir, [message([text('Done.'), toolCall()]), end('completed')])])
  assert.match(out, /TOOLCALL/, `the shape must be named:\n${out}`)
  assert.match(out, /\b1 completed turn/, 'the count is read from the census, not written as prose')
  assert.equal(status, 1, 'a measured shape is a finding')
})

test('a text-only final step is not a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-toolcall-'))
  const { status, out } = run(['explain', '--sessions', sessionDir(dir, [message([text('OK')]), end('completed')])])
  assert.doesNotMatch(out, /TOOLCALL/, out)
  assert.equal(status, 0, out)
})

test('a reasoning-only completed turn keeps the P-0047 meaning and is not a TOOLCALL finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remedy-toolcall-'))
  const { status, out } = run(['explain', '--sessions', sessionDir(dir, [message([reasoning('planning')]), end('completed')])])
  assert.doesNotMatch(out, /TOOLCALL/, out)
  assert.equal(status, 0, out)
})

test('without --sessions the finding is absent, not zero', () => {
  const { status, out } = run(['explain'])
  assert.doesNotMatch(out, /TOOLCALL/, out)
  assert.equal(status, 0, out)
})
