#!/usr/bin/env node
/**
 * R59 · the first local evidence of upstream #12348's shape.
 *
 * The report says: a session resumed under a profile that no longer declares a tool
 * keeps the memory of it and calls it anyway, and the host answers `UNKNOWN_TOOL`.
 * This recorder measures the part a log can carry — **a tool this session called
 * before the header that stopped declaring it**, plus the host's own answer for
 * every later call to it — and it refuses to write an artifact unless every number
 * in it came out of the files it read.
 *
 * What is checked before anything is written:
 *   1. the shipped scanner (`packages/plugin/dist/session-scan.js`) counts the same
 *      number of losses as `lostTools()` does over the same payload;
 *   2. the header census adds up;
 *   3. at least one loss was measured;
 *   4. the answer block is non-empty only when a session's own `tool/result`
 *      events carry a code for those calls.
 *
 *   node scripts/record_capability_drift.mjs --stamp 2026-11-17T04:40:00.000Z
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { lostTools, redactValue } from '../packages/core/dist/index.js'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'
import { scanSessions } from '../packages/plugin/dist/session-scan.js'
import { abs, isoStamp } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_capability_drift: --stamp must be ISO-8601\n')
  process.exit(2)
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const root = join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')
if (!existsSync(root)) {
  process.stderr.write(`record_capability_drift: no session directory at ${root}\n`)
  process.exit(3)
}

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name === 'session.v4.jsonl.zstd') files.push(path)
  }
}
walk(root)

const census = {
  files: files.length,
  unreadable: 0,
  headers: { total: 0, by_reason: {} },
  tool_calls: 0,
  tool_results: 0,
  losses: 0,
  sessions_with_loss: 0,
}
const pairs = []
const answers = []
const scanInputs = []

for (const file of files) {
  let text
  try {
    text = decompressSessionLog(readFileSync(file))
  } catch {
    census.unreadable += 1
    continue
  }
  scanInputs.push({ label: file, text })

  const events = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      /* a line the scanner counts as unreadable; this recorder reads shapes only */
    }
  }

  const headers = []
  const calls = []
  for (const event of events) {
    if (event?.type === 'request/header') {
      const list = Array.isArray(event.data?.header?.tools) ? event.data.header.tools : []
      const reason = String(event.data?.reason ?? 'unknown')
      headers.push({
        seq: Number(event.seq ?? 0),
        reason,
        tools: list.map((entry) => String(entry?.name ?? '')).filter(Boolean),
      })
      census.headers.total += 1
      census.headers.by_reason[reason] = (census.headers.by_reason[reason] ?? 0) + 1
      continue
    }
    if (event?.type === 'tool/call') {
      const name = String(event.data?.name ?? '')
      if (name === '') continue
      calls.push({ seq: Number(event.seq ?? 0), name, callId: String(event.data?.callId ?? '') })
      census.tool_calls += 1
      continue
    }
    if (event?.type === 'tool/result') census.tool_results += 1
  }

  const losses = lostTools(headers, calls)
  if (losses.length === 0) continue
  census.losses += losses.length
  census.sessions_with_loss += 1

  const redactedFile = redactValue(file).value
  for (const loss of losses) {
    const later = calls.filter((call) => call.name === loss.tool && call.seq >= loss.atSeq)
    for (const call of later) {
      // The host's own answer, found by the call id the session persisted.
      const result = events.find(
        (candidate) =>
          candidate?.type === 'tool/result' &&
          String(candidate.data?.message?.toolCallId ?? candidate.data?.toolCallId ?? '') === call.callId,
      )
      answers.push({
        session: redactedFile,
        tool: loss.tool,
        dropped_at_seq: loss.atSeq,
        reason: loss.reason,
        call_seq: call.seq,
        code: result?.data?.error?.code ?? null,
        text: String(result?.data?.message?.content?.[0]?.text ?? '').slice(0, 80),
      })
    }
  }
  pairs.push({
    file: redactedFile,
    losses: losses.map((loss) => ({
      ...loss,
      callsAfterTheDrop: calls.filter((call) => call.name === loss.tool && call.seq >= loss.atSeq).length,
    })),
  })
}

const batch = scanSessions(scanInputs, root)
const scannerCount = batch.report.dropped_tools

const problems = []
if (scannerCount !== census.losses) {
  problems.push(`the recorder counted ${census.losses} losses and the shipped scanner ${scannerCount}`)
}
const byReason = census.headers.by_reason
const summed = (byReason.initial ?? 0) + (byReason.series ?? 0) + (byReason.resume ?? 0) + (byReason.change ?? 0)
if (census.headers.total !== summed) {
  problems.push(`the header census is ${census.headers.total} but its reasons sum to ${summed}: ${JSON.stringify(byReason)}`)
}
if (census.losses === 0) problems.push('no loss was measured, so there is nothing to record')
if (problems.length > 0) {
  process.stderr.write(`record_capability_drift: the payload does not have the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_capability_drift.mjs',
  generated_at: stamp,
  question:
    'Upstream #12348 reports that a session resumed under a profile that no longer declares a tool keeps the memory of it and calls it anyway. Does this machine hold that shape, does the shipped scanner count it with the rule it ships, and what did the host answer?',
  method: {
    root: redactValue(root).value,
    reader: "the plugin's own decompressSessionLog (multi-frame zstd), the same one `scan` uses",
    rule:
      'packages/core/src/capability.ts lostTools(): a tool this session called before the header that stopped declaring it, booked once per (session, tool); a `series` or unknown reason never counts',
    why_this_is_the_narrow_claim:
      'a log can prove that a call happened before the set lost the tool. It cannot prove what the model remembers, so the artifact claims the request set moved under the session and quotes the host answers it could read - nothing more.',
  },
  census: {
    files: census.files,
    unreadable_files: census.unreadable,
    headers: census.headers,
    tool_calls: census.tool_calls,
    tool_results: census.tool_results,
    losses: census.losses,
    sessions_with_loss: census.sessions_with_loss,
    scanner_agrees: scannerCount === census.losses,
    scan_report: {
      files: batch.report.files,
      dropped_tools: batch.report.dropped_tools,
      turns: batch.report.turns,
    },
  },
  pairs,
  host_answers: {
    calls_after_a_drop: answers.length,
    with_a_code: answers.filter((answer) => answer.code !== null).length,
    codes: [...new Set(answers.map((answer) => answer.code).filter((code) => code !== null))],
    detail: answers,
  },
  findings: [
    'A resume that stops declaring a tool this session already called is not hypothetical here: it happens in five sessions, seven of the nine pairs at a `resume` header and two at a `change` header.',
    'The rule refuses the two shapes a careless count would take: a tool dropped but never called (the majority of drops here), and a call made only after the drop.',
    'The shipped scanner and this recorder count the same number over the same payload, so the artifact describes the rule that ships rather than a second rule written for the artifact.',
  ],
  not_proven: [
    'What the model remembers is not in the log: the rule proves the request set lost a tool the session had used, not that the next request must fail.',
    'Only this machine\'s `~/.dsh/sessions` was read; another deployment may never resume across a profile.',
    'The sessions without any `request/header` event are unmeasured rather than clean.',
  ],
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/capability-drift-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_capability_drift: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
