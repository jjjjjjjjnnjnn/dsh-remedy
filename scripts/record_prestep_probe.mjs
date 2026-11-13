import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const plugin = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)
const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)

const root = '.tmp/prestep-home/sessions'
const candidates = []
for (const ws of readdirSync(root, { withFileTypes: true })) {
  if (!ws.isDirectory()) continue
  for (const s of readdirSync(join(root, ws.name), { withFileTypes: true })) {
    if (!s.isDirectory()) continue
    const file = join(root, ws.name, s.name, 'session.v4.jsonl.zstd')
    try {
      candidates.push({ file, mtime: statSync(file).mtimeMs })
    } catch {
      // no log
    }
  }
}
candidates.sort((a, b) => b.mtime - a.mtime)
const sessionFile = candidates[0]?.file
if (sessionFile === undefined) throw new Error('no session log')
const sessionBytes = readFileSync(sessionFile)
const text = plugin.decompressSessionLog(sessionBytes)

const events = []
for (const line of text.split(/\r?\n/)) {
  if (line.trim() === '') continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    events.push({ seq: null, type: 'unreadable', data: null })
    continue
  }
  events.push({ seq: event.seq ?? null, type: String(event.type ?? ''), data: event.data ?? null })
}

const turnStarts = events.filter((e) => e.type === 'turn/start')
const stepStarts = events.filter((e) => e.type === 'step/start')
const turnEnds = events.filter((e) => e.type === 'turn/end')
const inboxSplices = events.filter((e) => e.type === 'agent/inbox/spliced')
const claims = inboxSplices.filter((e) => (e.data?.removedCount ?? 0) > 0 && (e.data?.inserted ?? []).length === 0)
const assistantEvents = events.filter((e) => e.type.startsWith('assistant/'))
const userMessages = events.filter((e) => e.type === 'user/message')
const toolCalls = events.filter((e) => e.type === 'tool/call')

const endReason = turnEnds[0]?.data?.reason ?? null

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_prestep_probe.mjs',
  generated_at: '2026-11-13T07:45:00.000Z',
  question:
    'What does a user see when an agent/pre-step listener returns {kind:"reject"}? Written down as a measurement instead of an assumption.',
  probe: {
    home: '.tmp/prestep-home (DSH_HOME, isolated: nothing under ~/.dsh is written)',
    profile: 'probe',
    bundle: '.tmp/prestep-probe (one inserted row, id probe-pre-step, name prestep-probe)',
    listener: "ctx.on('agent/pre-step', async (payload, next) => ({ kind: 'reject', reason })) — it owns the decision, so it does not chain next()",
    command: '"Reply with exactly: OK" | dsh --profile probe',
    exit_code: 1,
  },
  session: {
    file: core.redact(sessionFile).text,
    sha256: createHash('sha256').update(sessionBytes).digest('hex'),
    events: events.length,
    turn_starts: turnStarts.length,
    step_starts: stepStarts.length,
    user_messages: userMessages.length,
    assistant_events: assistantEvents.length,
    tool_calls: toolCalls.length,
    inbox_splices: inboxSplices.length,
    claimed_then_discarded: claims.length,
    turn_end_reason: endReason,
    event_types: [...new Set(events.map((e) => e.type))].sort(),
  },
  findings: [
    'A rejection opens the durable turn and then closes it as reason.kind = "blocked". There is no step/start, no user/message re-append, no assistant/* and no tool/call in the whole session.',
    'The claimed batch is removed (removedCount 1, no inserted, no outcome: "canceled") — that is the claim being consumed, not a user cancellation. dsh-agent lanesForClaim treats "blocked" as an ending that accounts for the input, unlike "completed".',
    'The typed message is therefore lost: a user who wants to retry has to type it again. That is the measured cost of a rejection.',
    'The CLI exits 1, so a scripted caller can tell a refused turn from a completed one.',
  ],
  not_proven: [
    'The desktop UI render of reason.kind = "blocked" was not measured: the conversation definitions in this install contain no match on that reason, so what the window draws is unknown.',
    'A rejection inside a multi-step turn (next-step steering) was not exercised; only the first proposed step of turn 1.',
    'One profile, one provider route, one prompt.',
  ],
  verdict: {
    seam_usable: true,
    reason: 'it neither pretends to succeed nor leaves a half-opened step; the turn ends in a named reason',
    safe_to_present: false,
    because: 'the desktop rendering of "blocked" is unmeasured, and the input is discarded on rejection',
  },
}

const redacted = core.redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const sha = createHash('sha256').update(artifact).digest('hex')
const out = `data/results/prestep-probe-${payload.generated_at.replaceAll(':', '-')}.json`
const { writeFileSync, mkdirSync, existsSync } = await import('node:fs')
if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`)
mkdirSync('data/results', { recursive: true })
writeFileSync(out, artifact, 'utf8')
writeFileSync(`${out}.sha256`, `${sha}\n`, 'utf8')
console.log(out, sha.slice(0, 12))
console.log(JSON.stringify(payload.session))
