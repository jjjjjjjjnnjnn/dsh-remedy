#!/usr/bin/env node
/**
 * R71 · the shipped readers, run over this machine's real session corpus.
 *
 *   node scripts/record_live_census.mjs --sessions ~/.dsh/sessions --stamp <ISO>
 *
 * What it measures: `dsh-remedy scan` and `dsh-remedy explain` over the sessions
 * this host actually wrote, not over a fixture. Three kinds of claim come out of
 * it, and the recorder refuses to write unless each measured count supports it:
 *
 *   P-0004 / P-0006  the reader opens every file it is pointed at and counts all
 *                   four turn endings (no unreadable line, no missing kind)
 *   P-0044          every `max-tokens` turn in the corpus is a truncated turn that
 *                   answered nobody
 *   P-0050 / P-0051  a resume that dropped a tool the session had called is
 *                   counted, and `explain` names it as a finding without a profile
 *
 * Two shapes are recorded as **absent** rather than claimed: `completed` turns
 * that answered nobody (P-0047) and `completed` turns that end on a tool call
 * (P-0052). Both were probe reproductions; neither has a real case here.
 *
 * Session excerpts are deliberately not carried into the artifact. The corpus is
 * private and the redactor only knows about home paths, so the artifact keeps
 * counts, the class table and hashes, and points at `.tmp/` for the full output.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_live_census: --stamp must be ISO-8601\n')
  process.exit(2)
}
const sessions = flag('sessions')
if (sessions === undefined) {
  process.stderr.write('record_live_census: --sessions is required\n')
  process.exit(2)
}
const sessionsDir = sessions === undefined ? null : resolve(sessions)
if (sessionsDir === null || !existsSync(sessionsDir)) {
  process.stderr.write(`record_live_census: no session directory at ${String(sessions)}\n`)
  process.exit(3)
}

const cli = join('packages', 'plugin', 'dist', 'cli.js')
const scan = spawnSync(process.execPath, [cli, 'scan', sessionsDir, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const explain = spawnSync(process.execPath, [cli, 'explain', '--sessions', sessionsDir], { encoding: 'utf8' })

if (scan.status !== 0 && scan.status !== 1) {
  process.stderr.write(`record_live_census: scan exited ${String(scan.status)}: ${(scan.stderr ?? '').trim()}\n`)
  process.exit(4)
}
if (explain.status !== 0 && explain.status !== 1) {
  process.stderr.write(`record_live_census: explain exited ${String(explain.status)}: ${(explain.stderr ?? '').trim()}\n`)
  process.exit(4)
}

let census = null
try {
  census = JSON.parse(scan.stdout)
} catch (error) {
  process.stderr.write(`record_live_census: scan --json did not print JSON (${error.message})\n`)
  process.exit(4)
}

// The scan names every row; the artifact keeps the count, not the paths.
const rows = Array.isArray(census.rows) ? census.rows : []
const explainText = (explain.stdout ?? '').trimEnd()
const explainLines = explainText.split(/\r?\n/)
const droppedLine = explainLines.find((line) => line.startsWith('DROPPED')) ?? null
const classTable = explainLines.filter((line) => line.includes('  '))
const turns = census.turns ?? {}

const problems = []
const require = (holds, message) => {
  if (!holds) problems.push(message)
}
require(Number(census.files) > 0, `the scan opened ${String(census.files)} file(s)`)
require(rows.length === Number(census.files), `the scan reported ${rows.length} row(s) for ${String(census.files)} file(s)`)
require(Number(census.unreadable_lines) === 0, `the scan met ${String(census.unreadable_lines)} unreadable line(s)`)
require(Number(census.attempts) > 0, 'the corpus has no attempts')
for (const kind of ['completed', 'max_tokens', 'aborted', 'error']) {
  require(Number(turns[kind] ?? 0) > 0, `the corpus has no \`${kind}\` turn, so the census rule is not exercised`)
}
require(
  Number(census.truncated_without_answer) > 0 &&
    Number(census.truncated_without_answer) === Number(turns.max_tokens ?? -1),
  `truncated_without_answer ${String(census.truncated_without_answer)} does not equal the ${String(turns.max_tokens)} max-tokens turns`,
)
require(Number(census.dropped_tools) > 0, 'no resume dropped a tool, so P-0050 is not exercised here')
require(droppedLine !== null, 'explain printed no DROPPED line for a corpus the scan says dropped tools')
require(explain.status === 1, `explain exited ${String(explain.status)}, expected 1 (a finding)`)
require(
  explainLines.some((line) => line.includes('enabled-here unknown')),
  'explain did not report the enabled-here column as unknown without a profile',
)

if (problems.length > 0) {
  process.stderr.write(`record_live_census: the corpus does not have the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_live_census.mjs',
  generated_at: stamp,
  question:
    'Do the shipped readers say the truth about the sessions this machine actually wrote — every file opened, every ending counted, a truncated turn that answered nobody, a resume that dropped a tool?',
  corpus: {
    sessions: redactValue(sessionsDir).value,
    files: Number(census.files),
    attempts: Number(census.attempts),
    window: census.window ?? null,
    redaction: census.redaction ?? null,
    note: 'counts only; the session text stays on this machine, and the examples the CLI collects are dropped here',
  },
  scan: {
    fused_calls: Number(census.fused_calls ?? 0),
    fusion_failures: Number(census.fusion_failures ?? 0),
    repairable_failures: Number(census.repairable_failures ?? 0),
    unreadable_lines: Number(census.unreadable_lines ?? 0),
    turns,
    truncated_without_answer: Number(census.truncated_without_answer ?? 0),
    completed_without_answer: Number(census.completed_without_answer ?? 0),
    completed_on_tool_call: Number(census.completed_on_tool_call ?? 0),
    dropped_tools: Number(census.dropped_tools ?? 0),
    error_codes: census.error_codes ?? {},
    refused_efforts: census.refused_efforts ?? {},
  },
  explain: {
    exit_code: explain.status,
    class_table: classTable,
    dropped_finding: droppedLine,
    enabled_here: 'unknown without --profile-file, which is the three-state rule the artifact depends on',
  },
  claims: {
    p0004_the_reader_opened_every_file: `${rows.length} rows for ${Number(census.files)} files, ${Number(census.unreadable_lines)} unreadable lines`,
    p0006_every_ending_is_counted: `completed ${String(turns.completed)}, max-tokens ${String(turns.max_tokens)}, aborted ${String(turns.aborted)}, error ${String(turns.error)}`,
    p0044_every_max_tokens_turn_answered_nobody: `${String(census.truncated_without_answer)} of ${String(turns.max_tokens)}`,
    p0050_a_dropped_tool_is_counted: `${String(census.dropped_tools)} tool(s)`,
    p0051_explain_names_it_without_a_profile: droppedLine,
    p0047_completed_without_answer_has_no_real_case: 'recorded as 0; the probe artifact remains the only witness',
    p0052_completed_on_tool_call_has_no_real_case: 'recorded as 0; the probe artifact remains the only witness',
  },
  sources: {
    'scan --json': sha256(scan.stdout),
    'explain': sha256(explain.stdout),
  },
  not_proven: [
    'this is the corpus on this machine at this stamp, not a distribution: another host writes other sessions',
    'the readers are not a resident seam, so nothing here re-proves a repair, a retry or a refusal',
    'P-0042\'s CONFLICT line is not exercised: the desktop profile no longer pins the effort the host refuses (37 such turns exist in the corpus)',
    'P-0009\'s window is not exercised by this run: the scan ran unwindowed',
  ],
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out') ?? `data/results/live-census-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_live_census: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
if (flag('keep-raw') !== undefined) {
  const raw = abs('.tmp/r71-census')
  mkdirSync(raw, { recursive: true })
  writeFileSync(join(raw, 'scan.json'), scan.stdout, 'utf8')
  writeFileSync(join(raw, 'explain.txt'), explain.stdout, 'utf8')
}
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
process.stdout.write(`files ${String(census.files)} · truncated ${String(census.truncated_without_answer)}/${String(turns.max_tokens)} · dropped ${String(census.dropped_tools)} · cwa ${String(census.completed_without_answer)} · cotc ${String(census.completed_on_tool_call)}\n`)
