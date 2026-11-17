#!/usr/bin/env node
/**
 * R65 · the first local evidence of a `completed` turn that ends on the tool call
 * the UI does not read (upstream #12741), and the control beside it.
 *
 * The two runs share endpoint, prompt and tool name. The only difference is that
 * the probe tool's success calls `exec.concludeTurn()` in one profile and not in
 * the other:
 *
 *   conclude : step 1 has a text block AND a tool call; the tool result carries
 *              `concludesTurn`, so `dsh-agent-loop/src/agent.ts` returns
 *              `{kind:'completed'}` with the tool call still in the last message
 *   control  : the same step, then a second step whose message is text only; the
 *              loop ends on that step
 *
 * Why the conclude shape reads as "no reply": `dsh-client-ui-chat`'s
 * `turn-process.ts:160-161` accepts a final step only when it has visible content
 * and no tool-call block, and `assistant-content.ts` classifies a tool call as
 * protocol material rather than a reply. This project counts a tool call as
 * visible work (P-0044), so P-0052 adds a second count instead of redefining the
 * first one.
 *
 * What the artifact claims is checked here before it is written: both exits are 0,
 * both turns end `completed`, the last block sets differ exactly as above, and the
 * scanner counts exactly one completed-on-tool-call turn and zero
 * completed-without-answer turns.
 *
 * Usage:
 *   node scripts/record_toolcall_turn.mjs \
 *     --conclude .tmp/r65-runs/conclude --control .tmp/r65-runs/control \
 *     --stamp 2026-11-17T13:30:00.000Z
 *
 * The run directories are produced by a probe harness that is not shipped. The
 * session file and the scan report are the durable half.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'
import { scanSessions } from '../packages/plugin/dist/session-scan.js'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_toolcall_turn: --stamp must be ISO-8601\n')
  process.exit(2)
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function observe(dir) {
  if (dir === undefined) throw new Error('missing run directory')
  const resultPath = join(abs(dir), 'result.json')
  if (!existsSync(resultPath)) throw new Error(`no result.json in ${dir}`)
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  if (typeof result.session !== 'string' || !existsSync(result.session)) {
    throw new Error(`${dir} names no readable session file`)
  }
  const text = decompressSessionLog(readFileSync(result.session))
  const events = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
  const ends = events.filter((event) => event.type === 'turn/end').map((event) => event.data?.reason?.kind ?? null)
  const messages = events
    .filter((event) => event.type === 'assistant/message')
    .map((event) => ({
      step: event.data?.step ?? null,
      blocks: (event.data?.message?.content ?? []).map((block) => String(block.type ?? '')),
    }))
  const last = messages.at(-1) ?? { step: null, blocks: [] }
  const calls = events.filter((event) => event.type === 'tool/call').map((event) => String(event.data?.name ?? ''))
  const results = events.filter((event) => event.type === 'tool/result').length
  return {
    dir: redactValue(dir).value,
    profile: result.profile,
    prompt: result.prompt,
    endpoint: result.endpoint,
    exit_code: result.exit_code,
    session: {
      file: redactValue(result.session).value,
      sha256: sha256(readFileSync(result.session)),
      events: events.length,
      turn_ends: ends,
      steps: messages.map((message) => message.step),
      last_blocks: last.blocks,
      tool_calls: calls,
      tool_results: results,
    },
    session_text: text,
    session_file: result.session,
  }
}

const conclude = observe(flag('conclude'))
const control = observe(flag('control'))

const problems = []
for (const [name, run] of [
  ['conclude', conclude],
  ['control', control],
]) {
  if (run.exit_code !== 0) problems.push(`the ${name} run exited ${run.exit_code}, expected 0`)
  if (run.session.turn_ends.length !== 1) problems.push(`the ${name} run has ${run.session.turn_ends.length} turn/end events`)
  if (run.session.turn_ends[0] !== 'completed') problems.push(`the ${name} turn ended ${String(run.session.turn_ends[0])}`)
}
if (conclude.prompt !== control.prompt) problems.push('the two runs used different prompts')
if (conclude.endpoint !== control.endpoint) problems.push('the two runs used different endpoints')
if (!conclude.session.last_blocks.includes('tool-call')) {
  problems.push(`the conclude run's last blocks are ${JSON.stringify(conclude.session.last_blocks)}`)
}
if (conclude.session.tool_calls.join(',') !== 'probe_conclude' || conclude.session.tool_results !== 1) {
  problems.push(`the conclude run executed ${JSON.stringify(conclude.session.tool_calls)} with ${conclude.session.tool_results} result(s)`)
}
if (control.session.last_blocks.includes('tool-call')) {
  problems.push(`the control run's last step still carries a tool call: ${JSON.stringify(control.session.last_blocks)}`)
}
if (!control.session.last_blocks.includes('text')) {
  problems.push(`the control run's last blocks are ${JSON.stringify(control.session.last_blocks)}`)
}
if ((control.session.steps.at(-1) ?? 0) <= (conclude.session.steps.at(-1) ?? 0)) {
  problems.push('the control did not take the extra step that makes it the control')
}

const batch = scanSessions(
  [
    { label: conclude.session.file, text: conclude.session_text },
    { label: control.session.file, text: control.session_text },
  ],
  `${conclude.dir} + ${control.dir}`,
)
if (batch.report.completed_on_tool_call !== 1) {
  problems.push(`the scanner counted ${batch.report.completed_on_tool_call} completed-on-tool-call turns, expected 1`)
}
if (batch.report.completed_without_answer !== 0) {
  problems.push(`the scanner counted ${batch.report.completed_without_answer} completed-without-answer turns, expected 0`)
}
if (batch.report.turns.completed !== 2) problems.push(`the scanner counted ${batch.report.turns.completed} completed turns, expected 2`)
const bySource = new Map(batch.rows.map((row) => [row.source, row.completed_on_tool_call]))
if (bySource.get(conclude.session.file) !== 1 || bySource.get(control.session.file) !== 0) {
  problems.push(`the per-file counts are ${JSON.stringify([...bySource])}`)
}

if (problems.length > 0) {
  process.stderr.write(`record_toolcall_turn: the runs do not have the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_toolcall_turn.mjs',
  generated_at: stamp,
  question:
    'Upstream #12741 reports a long tool loop that finishes a turn with no visible reply: the UI accepts a final step only when it has visible text and no tool-call block, while a tool result can mark the turn concluded. Does a local tool whose success calls `concludeTurn()` end a `completed` turn on a step that carries a text block and a tool call, and does the scanner count that shape without stealing the no-answer count?',
  probe: {
    homes: `${conclude.dir} and ${control.dir} (one isolated DSH_HOME; nothing under ~/.dsh is written)`,
    endpoint:
      'a local OpenAI-compatible server: the first step streams one text delta and one `probe_conclude` tool call, then `finish_reason: "tool_calls"`; a tool-result request streams text only',
    why_the_shape_survives:
      '`dsh-agent-loop/src/agent.ts` returns `{kind:"completed"}` from a step with tool calls when the batch result is `concluded` (`toolCalls.length === 0` / `result.concluded ? {kind:"completed"} : null`), and `dsh-tools` carries that marker from `ToolRunContext.concludeTurn()`. The UI rule is `dsh-client-ui-chat/.../turn-process.ts:160-161`: a final step with any tool-call block is not a final answer, even when it also has text.',
    runtime: readRuntime(),
    note: 'the endpoint is local and synthetic: it reproduces the host mechanism, not a relay incident',
  },
  runs: {
    conclude: {
      profile: conclude.profile,
      endpoint: conclude.endpoint,
      exit_code: conclude.exit_code,
      session: conclude.session,
    },
    control: {
      profile: control.profile,
      endpoint: control.endpoint,
      exit_code: control.exit_code,
      session: control.session,
    },
  },
  scan: {
    completed: batch.report.turns.completed,
    completed_on_tool_call: batch.report.completed_on_tool_call,
    completed_without_answer: batch.report.completed_without_answer,
    rows: batch.rows.map((row) => ({
      source: row.source,
      completed: row.turns.completed,
      completed_on_tool_call: row.completed_on_tool_call,
      completed_without_answer: row.completed_without_answer,
    })),
  },
  claims: {
    the_shape_reproduces_here: conclude.session.turn_ends[0] === 'completed' && conclude.session.last_blocks.includes('tool-call'),
    the_control_differs_only_in_the_concluding_tool: control.session.last_blocks.join(',') === 'text',
    the_scanner_counts_exactly_one: batch.report.completed_on_tool_call === 1,
    the_no_answer_counter_did_not_move: batch.report.completed_without_answer === 0,
    the_census_itself_did_not_move: batch.report.turns.completed === 2,
  },
  findings: [
    'A tool result that calls `concludeTurn()` ends the turn `completed` on a step that still carries a tool call, so the last assistant message can be `["text","tool-call"]`.',
    'The control run, same endpoint, prompt and tool name with `concludeTurn()` off, takes a second step and ends on a text-only message; the only difference a reader can see is the concluding marker.',
    'The scanner counts the conclude run and not the control; `completed_without_answer` stays zero, because P-0044 already counts the tool call as work. P-0052 adds the second count rather than redefining the first rule.',
    'The host and UI lines that make the shape possible are quoted in `docs/patches/P-0052-completed-on-tool-call.md`; the local endpoint reproduces the mechanism, not an incident.',
  ],
  not_proven: [
    'The endpoint is local and synthetic. It reproduces the host mechanism, not a relay or model incident.',
    'One route, one model, one prompt, one tool; a multi-tool batch and a multi-step conclusion were not exercised.',
    'The desktop UI was not driven for this probe: both runs are headless CLI runs, and the "no reply" half is read from `turn-process.ts`, not observed on screen.',
    'The number this artifact records is a transcript rule, not a count of user-visible incidents; the machine had produced zero of the shape before the probe.',
  ],
}

function readRuntime() {
  const candidate = join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json')
  if (!existsSync(candidate)) return { version: null, source: null, sha256: null }
  const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
  return {
    version: typeof parsed.desktopVersion === 'string' ? parsed.desktopVersion : null,
    source: redactValue(candidate).value,
    sha256: sha256(readFileSync(candidate)),
  }
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/live-toolcall-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_toolcall_turn: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
