#!/usr/bin/env node
/**
 * R57 · the first local evidence of a `completed` turn that answered nobody
 * (upstream #13169), and the negative control beside it.
 *
 * The two runs differ only in what the local endpoint streams:
 *
 *   reasoning : two `reasoning_content` deltas, then `finish_reason: "stop"` —
 *               the adapter's empty-response guard counts blocks, not usable
 *               content, so the turn ends `completed` with no text and no tool call
 *   text      : one `content` delta, then `stop` — the control, same prompt,
 *               same endpoint, same host
 *
 * What the artifact claims is checked here before it is written: the endings must
 * match, the block shapes must differ, and the scanner must count exactly one.
 *
 * Usage:
 *   node scripts/record_completed_answer.mjs \
 *     --reasoning .tmp/r57-runs/reasoning --control .tmp/r57-runs/text \
 *     --stamp 2026-11-16T18:30:00.000Z [--scan-out data/results/scan-r57-….json]
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'
import { redactReport, scanSessions } from '../packages/plugin/dist/session-scan.js'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_completed_answer: --stamp must be ISO-8601\n')
  process.exit(2)
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function observe(dir) {
  if (dir === undefined) throw new Error('missing run directory')
  const resultPath = join(abs(dir), 'result.json')
  if (!existsSync(resultPath)) throw new Error(`no result.json in ${dir}`)
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  const files = result.sessions ?? []
  if (files.length === 0) throw new Error(`${dir} has no session file`)
  const file = files[0].file
  const text = decompressSessionLog(readFileSync(file))
  const events = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
  const ends = events.filter((event) => event.type === 'turn/end').map((event) => event.data?.reason?.kind ?? null)
  const messages = events
    .filter((event) => event.type === 'assistant/message')
    .map((event) => ({
      turn: event.data?.turn ?? null,
      step: event.data?.step ?? null,
      blocks: (event.data?.message?.content ?? []).map((block) => String(block.type ?? '')),
      text: (event.data?.message?.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => String(block.text ?? ''))
        .join(''),
    }))
  const last = messages.at(-1) ?? null
  return {
    dir: redactValue(dir).value,
    endpoint: result.endpoint,
    exit_code: result.exit_code,
    requests: (result.requests ?? []).length,
    session: {
      file: redactValue(file).value,
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      events: events.length,
      turn_ends: ends,
      last_blocks: last === null ? [] : last.blocks,
      last_text: last === null ? '' : last.text,
    },
    session_text: text,
    session_file: file,
  }
}

const reasoning = observe(flag('reasoning'))
const control = observe(flag('control'))

const problems = []
for (const [name, run] of [['reasoning', reasoning], ['control', control]]) {
  if (run.exit_code !== 0) problems.push(`the ${name} run exited ${run.exit_code}, expected 0`)
  if (run.session.turn_ends.length !== 1) problems.push(`the ${name} run has ${run.session.turn_ends.length} turn/end events`)
  if (run.session.turn_ends[0] !== 'completed') problems.push(`the ${name} turn ended ${String(run.session.turn_ends[0])}`)
}
if (reasoning.session.last_blocks.join(',') !== 'reasoning') {
  problems.push(`the reasoning run's last blocks are ${JSON.stringify(reasoning.session.last_blocks)}`)
}
if (control.session.last_blocks.join(',') !== 'text') {
  problems.push(`the control run's last blocks are ${JSON.stringify(control.session.last_blocks)}`)
}
if (control.session.last_text.trim() === '') problems.push('the control run delivered no text')

const batch = scanSessions(
  [
    { label: reasoning.session.file, text: reasoning.session_text },
    { label: control.session.file, text: control.session_text },
  ],
  `${reasoning.dir} + ${control.dir}`,
)
if (batch.report.completed_without_answer !== 1) {
  problems.push(`the scanner counted ${batch.report.completed_without_answer} completed-without-answer turns, expected 1`)
}
if (batch.report.turns.completed !== 2) problems.push(`the scanner counted ${batch.report.turns.completed} completed turns, expected 2`)

if (problems.length > 0) {
  process.stderr.write(`record_completed_answer: the runs do not have the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_completed_answer.mjs',
  generated_at: stamp,
  question:
    'Upstream #13169 reports a turn whose only delivered content is reasoning and whose `turn/end` still says `completed`. This machine had produced 0 of them, so nothing could say whether it happens here. Does a local endpoint that streams one reasoning block and a normal stop reproduce the shape, and does the scanner count it?',
  probe: {
    homes: `${reasoning.dir} and ${control.dir} (isolated DSH_HOME; nothing under ~/.dsh is written)`,
    endpoint:
      '.tmp/r57-fake-openai.mjs — `reasoning-only` streams two `reasoning_content` deltas then `finish_reason: "stop"`; `text` streams one content delta then `stop`',
    why_the_shape_survives:
      "the adapter's empty-response guard counts blocks, not usable content (`dsh-llm-pi-ai` `mapStopReason`: `if (message.content.length === 0)`), so one reasoning block passes and the loop ends the turn as `completed`",
    runtime: readRuntime(),
    note: 'the endpoint is local and synthetic: it reproduces the adapter shape, not a relay incident',
  },
  runs: {
    reasoning: {
      endpoint: reasoning.endpoint,
      exit_code: reasoning.exit_code,
      requests: reasoning.requests,
      session: reasoning.session,
    },
    control: {
      endpoint: control.endpoint,
      exit_code: control.exit_code,
      requests: control.requests,
      session: control.session,
    },
  },
  scan: {
    completed: batch.report.turns.completed,
    completed_without_answer: batch.report.completed_without_answer,
    truncated_without_answer: batch.report.truncated_without_answer,
    rows: batch.rows.map((row) => ({
      source: row.source,
      completed: row.turns.completed,
      completed_without_answer: row.completed_without_answer,
    })),
  },
  claims: {
    the_shape_reproduces_here: reasoning.session.last_blocks.join(',') === 'reasoning' && reasoning.session.turn_ends[0] === 'completed',
    the_control_differs_only_in_content: control.session.last_blocks.join(',') === 'text',
    the_scanner_counts_exactly_one: batch.report.completed_without_answer === 1,
    the_census_itself_did_not_move: batch.report.turns.completed === 2,
  },
  findings: [
    'A turn that delivered only reasoning ends `completed` on this host, exactly as upstream #13169 describes, and the endpoint delivered it as a normal `stop` — so the shape is not a truncation and not an error.',
    'The control run, same endpoint and same prompt with a text delta, ends the same way; the only difference a reader can see is the block type in the transcript.',
    'The scanner counts the reasoning run and not the control, which is the rule P-0047 added; the completion census itself stays two.',
  ],
  not_proven: [
    'The endpoint is local and synthetic. It reproduces the adapter output, not a relay incident.',
    'One route, one model, one prompt, one step per turn; a multi-step turn was not exercised.',
    'The desktop app was not driven for this probe: both runs are headless CLI runs on the same host.',
  ],
}

function readRuntime() {
  const candidates = [join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json')]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
    if (typeof parsed.desktopVersion === 'string') {
      return { version: parsed.desktopVersion, source: redactValue(candidate).value, sha256: sha256(readFileSync(candidate)) }
    }
  }
  return { version: null, source: null, sha256: null }
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/live-completed-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_completed_answer: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)

const scanOut = flag('scan-out')
if (scanOut !== undefined) {
  const scanArtifact = `${JSON.stringify(
    {
      schema_version: 1,
      produced_by: 'dsh-remedy scan (via scripts/record_completed_answer.mjs)',
      generated_at: stamp,
      source: redactReport(batch.report).source,
      ...redactReport(batch.report),
      rows: batch.rows,
    },
    null,
    2,
  )}\n`
  if (existsSync(abs(scanOut))) {
    process.stderr.write(`record_completed_answer: refusing to overwrite ${scanOut}\n`)
    process.exit(2)
  }
  writeFileSync(abs(scanOut), scanArtifact, 'utf8')
  writeFileSync(abs(`${scanOut}.sha256`), `${sha256(scanArtifact)}\n`, 'utf8')
  process.stdout.write(`RECORDED ${scanOut}\n`)
}
