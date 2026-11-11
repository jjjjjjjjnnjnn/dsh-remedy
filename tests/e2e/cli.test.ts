import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

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

/** A session whose one attempt carries a fused tool call and whose turn died. */
function fusedSession(time: number): string {
  const fused = '{"command":"ls"}{"path":"a.ts"}'
  return [
    JSON.stringify({
      type: 'assistant/attempt',
      seq: 2,
      time,
      data: { stream: [{ type: 'tool-call-chunks', index: 0, id: 'call_x', name: 'ops_bash', args: [fused] }] },
    }),
    JSON.stringify({
      type: 'turn/end',
      seq: 3,
      time: time + 10,
      data: {
        reason: {
          kind: 'error',
          error: { code: 'MALFORMED_RESPONSE', message: `Tool call "ops_bash": bad\n\nReceived arguments:\n${fused}` },
        },
      },
    }),
  ].join('\n') + '\n'
}

test('scan reads a concatenated-frame zstd session instead of treating it as text', () => {
  const file = join(work, 'session.v4.jsonl.zstd')
  const text = fusedSession(1_760_000_000_000)
  const frame = text.indexOf('{"type":"turn/end"')
  const buffer = Buffer.concat([
    zstdCompressSync(Buffer.from(text.slice(0, frame), 'utf8')),
    zstdCompressSync(Buffer.from(text.slice(frame), 'utf8')),
  ])
  writeFileSync(file, buffer)

  const result = run('scan', file, '--json')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout) as {
    files: number
    attempts: number
    unreadable_lines: number
    fused_calls: number
    window: { oldest: number | null; newest: number | null }
  }
  // Before this fix the whole file was one unreadable line: the compressed
  // bytes were split on newlines and none of them parsed.
  assert.equal(report.attempts, 1)
  assert.equal(report.unreadable_lines, 0)
  assert.equal(report.fused_calls, 1)
  assert.equal(report.files, 1)
  assert.deepEqual(report.window, { oldest: 1_760_000_000_000, newest: 1_760_000_000_010 })
})

test('scan of a directory merges every session and keeps one row per file', () => {
  const dir = join(work, 'sessions')
  mkdirSync(join(dir, 'one'), { recursive: true })
  mkdirSync(join(dir, 'two'), { recursive: true })
  writeFileSync(join(dir, 'one', 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(fusedSession(1_760_000_000_000), 'utf8')))
  writeFileSync(
    join(dir, 'two', 'session.v4.jsonl.zstd'),
    zstdCompressSync(Buffer.from(JSON.stringify({ type: 'step/end', seq: 1, time: 1_760_000_100_000, data: {} }), 'utf8')),
  )

  const result = run('scan', dir, '--json')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout) as {
    files: number
    attempts: number
    fused_calls: number
    rows: { files: number; fused_calls: number }[]
    source: string
  }
  assert.equal(report.files, 2)
  assert.equal(report.attempts, 1)
  assert.equal(report.fused_calls, 1)
  assert.equal(report.rows.length, 2, 'one row per file, so the total can be audited')
  assert.equal(report.rows.reduce((sum, row) => sum + row.files, 0), 2)
})

test('scan --since drops older events but reports how many it dropped', () => {
  const dir = join(work, 'windowed')
  mkdirSync(dir, { recursive: true })
  const session = join(dir, 'session.v4.jsonl.zstd')
  writeFileSync(
    session,
    Buffer.concat([
      zstdCompressSync(Buffer.from(fusedSession(1_700_000_000_000), 'utf8')),
      zstdCompressSync(
        Buffer.from(`${JSON.stringify({ type: 'step/end', seq: 9, time: 1_760_000_000_000, data: {} })}\n`, 'utf8'),
      ),
    ]),
  )

  const cut = new Date(1_750_000_000_000).toISOString()
  const result = run('scan', session, '--since', cut, '--json')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout) as { attempts: number; before_since: number; window: { oldest: number } }
  assert.equal(report.attempts, 0, 'the two old events are outside the window')
  assert.equal(report.before_since, 2, 'a filtered scan must say what it did not look at')
  assert.equal(report.window.oldest, 1_760_000_000_000)
})

test('scan rejects a --since that is not an instant', () => {
  const session = join(work, 'bad-since.jsonl')
  writeFileSync(session, '{"type":"step/end","seq":1,"data":{}}', 'utf8')
  assert.equal(run('scan', session, '--since', 'yesterday').status, 2)
})

test('a windowed directory scan does not spend one unreadable line per session header', () => {
  // P-0009: every real session begins with a `session` header whose instant is
  // `createdAt`. A window that cannot see that instant reported 78 unreadable
  // lines for 78 files, which is a zero that lies in the other direction.
  const dir = join(work, 'headers')
  for (const name of ['one', 'two']) {
    mkdirSync(join(dir, name), { recursive: true })
    const header = JSON.stringify({ type: 'session', version: 4, id: `session-${name}`, createdAt: 1_700_000_000_000 })
    const event = JSON.stringify({ type: 'step/end', seq: 1, time: 1_760_000_000_000, data: {} })
    writeFileSync(
      join(dir, name, 'session.v4.jsonl.zstd'),
      zstdCompressSync(Buffer.from(`${header}\n${event}\n`, 'utf8')),
    )
  }

  const result = run('scan', dir, '--since', new Date(1_750_000_000_000).toISOString(), '--json')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout) as { files: number; unreadable_lines: number; before_since: number }
  assert.equal(report.files, 2)
  assert.equal(report.unreadable_lines, 0, 'a header that parsed is not an unreadable line')
  assert.equal(report.before_since, 2, 'both headers are dated and both are outside the window')
})

test('scan reports every way a turn ended, and exit stays quiet for a census', () => {
  // P-0006: this session has no fusion at all, so it is not a finding for the
  // repair layer, but the truncation inside it is exactly the class a fault
  // map exists to name.
  const session = join(work, 'census.jsonl')
  writeFileSync(
    session,
    [
      JSON.stringify({ type: 'turn/end', seq: 1, time: 1_760_000_000_000, data: { turn: 1, reason: { kind: 'completed' } } }),
      JSON.stringify({ type: 'turn/end', seq: 2, time: 1_760_000_000_100, data: { turn: 2, reason: { kind: 'max-tokens' } } }),
      JSON.stringify({
        type: 'turn/end',
        seq: 3,
        time: 1_760_000_000_200,
        data: { turn: 3, reason: { kind: 'error', error: { code: 'SERVER', message: '503' } } },
      }),
    ].join('\n'),
    'utf8',
  )

  const json = run('scan', session, '--json')
  assert.equal(json.status, 0, 'a census without a fusion is not a finding')
  const report = JSON.parse(json.stdout) as {
    turns: { completed: number; max_tokens: number; aborted: number; error: number }
    error_codes: Record<string, number>
    fusion_failures: number
  }
  assert.deepEqual(report.turns, { completed: 1, max_tokens: 1, aborted: 0, error: 1 })
  assert.deepEqual(report.error_codes, { SERVER: 1 })
  assert.equal(report.fusion_failures, 0)

  const human = run('scan', session)
  assert.equal(human.status, 0, human.stderr)
  assert.match(human.stdout, /turns=3 completed=1 max_tokens=1 aborted=0 error=1/)
  assert.match(human.stdout, /error codes: SERVER=1/)
})
