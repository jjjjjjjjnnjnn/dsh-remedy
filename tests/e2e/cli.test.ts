import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../../packages/plugin/dist/cli.js', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const fusedFixture = fileURLToPath(
  new URL('../../data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json', import.meta.url),
)
const brokenFixture = fileURLToPath(new URL('../../data/fixtures/toolcall-fusion/single-broken.json', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'dsh-remedy-'))

after(() => rmSync(work, { recursive: true, force: true }))

const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: repoRoot })

test('verify runs every bundled fixture through the engine', () => {
  const result = run('verify')
  assert.equal(result.status, 0, result.stderr)
  // The fixture count is data, not a constant: adding a fixture must not need a
  // test edit, yet every fixture still has to be a PASS line.
  const lines = result.stdout.split('\n').filter((line) => line.includes('—'))
  const passes = lines.filter((line) => line.startsWith('PASS'))
  assert.ok(passes.length >= 5, `expected at least 5 fixtures, got ${String(passes.length)}`)
  assert.equal(passes.length, lines.length, 'no fixture may be a FAIL line in a green run')
  assert.match(result.stdout, /OK\s+\d+ fixture\(s\)/)
})

test('repair splits the real fused fixture', () => {
  const result = run('repair', fusedFixture, '--name', 'ops_bash', '--id', 'call_e2e')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /status: repaired \(2 calls\)/)
  assert.match(result.stdout, /call_e2e#remedy-1/)
})

test('repair exits 1 when the text is not a proven fusion', () => {
  const result = run('repair', brokenFixture)
  assert.equal(result.status, 1)
  assert.match(result.stdout, /status: rejected/)
})

test('repair honours --truncated and refuses to split', () => {
  const result = run('repair', fusedFixture, '--truncated')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /truncated/)
})

test('scan counts a synthetic session and exits 1 when it finds fusion', () => {
  const session = join(work, 'session.jsonl')
  const fused = '{"command":"ls"}{"path":"a.ts"}'
  const lines = [
    JSON.stringify({
      type: 'assistant/attempt',
      seq: 2,
      data: {
        stream: [
          { type: 'tool-call-chunks', index: 0, id: 'call_x', name: 'ops_bash', args: [fused] },
        ],
      },
    }),
    JSON.stringify({
      type: 'turn/end',
      seq: 3,
      data: {
        reason: {
          kind: 'error',
          error: {
            code: 'MALFORMED_RESPONSE',
            message: `Tool call "ops_bash": Unexpected non-whitespace character after JSON\n\nReceived arguments:\n${fused}`,
          },
        },
      },
    }),
  ]
  writeFileSync(session, lines.join('\n'), 'utf8')

  const result = run('scan', session, '--json')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout) as { fused_calls: number; fusion_failures: number; repairable_failures: number }
  assert.equal(report.fused_calls, 1)
  assert.equal(report.fusion_failures, 1)
  assert.equal(report.repairable_failures, 1)
})

test('scan writes an artifact with a sha256 sidecar', () => {
  const session = join(work, 'clean.jsonl')
  writeFileSync(session, JSON.stringify({ type: 'step/end', seq: 1, data: {} }), 'utf8')
  const out = join(work, 'scan.json')
  const result = run('scan', session, '--out', out)
  assert.equal(result.status, 0, result.stderr)
  const text = readFileSync(out, 'utf8')
  const report = JSON.parse(text) as { schema_version: number; produced_by: string }
  assert.equal(report.schema_version, 1)
  assert.equal(report.produced_by, 'dsh-remedy scan')
  assert.match(readFileSync(`${out}.sha256`, 'utf8'), /^[a-f0-9]{64}/)
})

test('status --json exposes the registry', () => {
  const result = run('status', '--json')
  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout) as { patches: { id: string }[]; counters: unknown }
  assert.equal(payload.patches[0]?.id, 'P-0001')
  assert.equal(payload.counters, null)
})

test('an unknown command is a usage error, a missing session is unavailable', () => {
  assert.equal(run('nonsense').status, 2)
  assert.equal(run('scan', join(work, 'missing.jsonl')).status, 3)
})
