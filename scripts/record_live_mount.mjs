#!/usr/bin/env node
/**
 * Record one real Host mount of dsh-remedy as SSOT.
 *
 *   node scripts/record_live_mount.mjs --stamp <ISO> [--session <file>]
 *
 * Inputs (all local, all read-only):
 *   --journal   the plugin journal written by the live run
 *   --attempts  the runner's per-attempt record
 *   --session   a `session.v4.jsonl.zstd` (default: newest under a *dsh-remedy*
 *               workspace)
 *
 * Output: `data/results/live-<stamp>.json` + `.sha256`, produced_by this script.
 * A quiet run is still evidence: it says the seam ran and the defect did not
 * appear. An unmeasured run (no stream at all) is refused, because it says
 * nothing about the plugin.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('record_live_mount: --stamp must be ISO-8601\n')
  process.exit(2)
}

const profileName = flag('profile', 'remedy-live')
const journalPath = flag('journal', '.tmp/live/journal.jsonl')
const attemptsPath = flag('attempts', '.tmp/live/attempts.json')
const tarballPath = flag('tarball', '.tmp/pack/live3/dsh-remedy-0.1.0.tgz')

if (!existsSync(abs(journalPath)) || !existsSync(abs(attemptsPath))) {
  process.stderr.write(`record_live_mount: missing ${journalPath} or ${attemptsPath}\n`)
  process.exit(3)
}

const plugin = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)
const scanner = await import(new URL('../packages/plugin/dist/session-scan.js', import.meta.url).href)
const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)

const pluginPkg = JSON.parse(readFileSync(abs('packages/plugin/package.json'), 'utf8'))
const tarballDigest = existsSync(abs(tarballPath))
  ? createHash('sha256').update(readFileSync(abs(tarballPath))).digest('hex')
  : null

const journalLines = readFileSync(abs(journalPath), 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '')
const journalEvents = journalLines.map((line) => {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}).filter(Boolean)

const attemptsDoc = JSON.parse(readFileSync(abs(attemptsPath), 'utf8'))
const attempts = Array.isArray(attemptsDoc.attempts) ? attemptsDoc.attempts : []

const counterKeys = ['streams', 'fused', 'repaired', 'unrepaired', 'truncated', 'errors']
const emptyCounters = () => Object.fromEntries(counterKeys.map((key) => [key, 0]))

// Per-attempt counters are the final cumulative snapshot of one process, so
// summing them is exact. The journal is grouped the same way for a cross-check:
// a new process starts when `streams` does not increase.
const sumAttempts = emptyCounters()
for (const attempt of attempts) {
  for (const key of counterKeys) sumAttempts[key] += attempt.counters?.[key] ?? 0
}

const journalTotals = emptyCounters()
const journalGroups = []
let group = null
for (const event of journalEvents) {
  if (event.kind !== 'stream') continue
  const streams = event.counters?.streams ?? 0
  // Concurrent streams can end out of order, so equal `streams` values belong
  // to the same process; only a decrease means a new process started.
  if (group === null || streams < group.streams) {
    group = emptyCounters()
    journalGroups.push(group)
  }
  group.streams = Math.max(group.streams, event.counters?.streams ?? 0)
  group.fused = Math.max(group.fused, event.counters?.fused ?? 0)
  group.repaired = Math.max(group.repaired, event.counters?.repaired ?? 0)
  group.unrepaired = Math.max(group.unrepaired, event.counters?.unrepaired ?? 0)
  group.truncated = Math.max(group.truncated, event.counters?.truncated ?? 0)
  group.errors = Math.max(group.errors, event.counters?.errors ?? 0)
}
for (const groupCounters of journalGroups) {
  for (const key of counterKeys) journalTotals[key] += groupCounters[key]
}

const counters = sumAttempts.streams > 0 ? sumAttempts : journalTotals
const crossCheck = {
  match: counterKeys.every((key) => journalTotals[key] === counters[key]),
  from: sumAttempts.streams > 0 ? 'attempts' : 'journal',
  journal_totals: journalTotals,
  journal_groups: journalGroups.length,
}

function newestSession() {
  const sessionsRoot = join(homedir(), '.dsh', 'sessions')
  const candidates = []
  for (const workspace of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!workspace.isDirectory() || !workspace.name.includes('dsh-remedy')) continue
    const wsDir = join(sessionsRoot, workspace.name)
    for (const session of readdirSync(wsDir, { withFileTypes: true })) {
      if (!session.isDirectory()) continue
      const file = join(wsDir, session.name, 'session.v4.jsonl.zstd')
      try {
        candidates.push({ file, mtime: statSync(file).mtimeMs })
      } catch {
        // no log for this session
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.file ?? null
}

const sessionFile = flag('session', null) ?? newestSession()
if (sessionFile === null || !existsSync(sessionFile)) {
  process.stderr.write('record_live_mount: no session log found; pass --session\n')
  process.exit(3)
}

const sessionBytes = readFileSync(sessionFile)
const sessionText = plugin.decompressSessionLog(sessionBytes)
const scan = scanner.scanSessionText(sessionText, sessionFile)

const toolCalls = []
const toolResults = []
let turnEnd = null
let assistantTail = ''
let attemptEvents = 0
for (const line of sessionText.split(/\r?\n/)) {
  if (line.trim() === '') continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  if (event.type === 'tool/call') {
    toolCalls.push({
      turn: event.data?.turn ?? null,
      step: event.data?.step ?? null,
      callId: event.data?.callId ?? null,
      name: event.data?.name ?? null,
    })
  }
  if (event.type === 'tool/result') toolResults.push(event.seq ?? null)
  if (event.type === 'turn/end') turnEnd = event.data?.reason?.kind ?? null
  if (event.type === 'assistant/attempt') attemptEvents += 1
  if (event.type === 'assistant/message') {
    const blocks = Array.isArray(event.data?.message?.content) ? event.data.message.content : []
    const text = blocks.filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
    if (text.trim() !== '') assistantTail = text
  }
}

const syntheticIds = [...new Set(toolCalls.map((call) => call.callId).filter((id) => typeof id === 'string' && id.includes('#remedy-')))]

const repairedCall = toolCalls.find((call) => typeof call.callId === 'string' && call.callId.includes('#remedy-'))
const repairedStep =
  repairedCall === undefined
    ? null
    : {
        turn: repairedCall.turn,
        step: repairedCall.step,
        calls: toolCalls
          .filter((call) => call.turn === repairedCall.turn && call.step === repairedCall.step)
          .map((call) => ({ callId: call.callId, name: call.name })),
      }

const verdict = core.judgeRemedy(counters)
if (verdict.state === 'unmeasured') {
  process.stderr.write('record_live_mount: no stream passed through the wrapper; refusing to write an artifact that measures nothing\n')
  process.exit(4)
}

const redactions = { replacements: 0, kinds: new Set() }
const redactText = (text) => {
  const result = core.redact(String(text ?? ''))
  redactions.replacements += result.summary.replacements
  for (const kind of result.summary.kinds) redactions.kinds.add(kind)
  return result.text
}
const redactedSession = redactText(sessionFile)
const redactedTarball = redactText(tarballPath)
const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_live_mount.mjs',
  generated_at: stamp,
  profile: {
    name: profileName,
    dsh_version: '0.2.2-rc.1',
    install: 'dsh plugin --profile remedy-live add <tarball>',
    package: `${pluginPkg.name}@${pluginPkg.version}`,
    tarball: redactedTarball,
    tarball_sha256: tarballDigest,
    bundle_row: 'remedy-stream',
    surface: 'llm/stream',
  },
  journal: {
    file: redactText(journalPath),
    events: journalEvents.length,
    stream_events: journalEvents.filter((event) => event.kind === 'stream').length,
    repaired_events: journalEvents.filter((event) => event.kind === 'repaired').length,
    rejected_events: journalEvents.filter((event) => event.kind === 'rejected').length,
  },
  counters,
  cross_check: crossCheck,
  verdict,
  attempts: attempts.map((attempt) => ({
    attempt: attempt.attempt,
    exit_code: attempt.exit_code,
    timed_out: attempt.timed_out === true,
    stream_events: attempt.stream_events ?? 0,
    repaired_events: attempt.repaired_events ?? 0,
    rejected_events: attempt.rejected_events ?? 0,
    counters: attempt.counters ?? null,
    stdout_tail: redactText(attempt.stdout_tail ?? '').slice(-400),
  })),
  session: {
    file: redactedSession,
    sha256: createHash('sha256').update(sessionBytes).digest('hex'),
    events: sessionText.split(/\r?\n/).filter((line) => line.trim() !== '').length,
    turn_end: turnEnd,
    tool_calls: toolCalls.length,
    tool_results: toolResults.length,
    fused_calls: scan.fused_calls,
    fusion_failures: scan.fusion_failures,
    repairable_failures: scan.repairable_failures,
    attempt_events: attemptEvents,
    attempt_logs: attemptEvents > 0,
    note:
      attemptEvents > 0
        ? 'fused_calls is read from assistant/attempt deltas'
        : 'this profile does not persist assistant/attempt streams; the fusion is evidenced by the journal and the synthetic id',
    synthetic_ids: syntheticIds,
    repaired_step: repairedStep,
    assistant_tail: redactText(assistantTail).slice(-400),
  },
  task:
    'Two independent reads requested in one message; the model emitted them as parallel tool calls, which is the shape that fuses at the relay.',
  limits: [
    'one machine, one provider route, one profile; not a population estimate',
    'the live profile is a headless profile with the desktop provider block copied; the desktop UI was not restarted',
    'the plugin build is the tarball named above; its sha256 is recorded, not inferred',
  ],
}

const redacted = core.redactValue(payload)
const redaction = {
  replacements: redactions.replacements + redacted.summary.replacements,
  kinds: [...new Set([...redactions.kinds, ...redacted.summary.kinds])].sort(),
}
const artifact = `${JSON.stringify({ ...redacted.value, redaction }, null, 2)}\n`
const out = flag('out', `data/results/live-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(abs(out))) {
  process.stderr.write(`record_live_mount: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nverdict ${verdict.state} · counters ${JSON.stringify(counters)}\nredactions ${redaction.replacements}\n`)
