// Deterministic session sample: the numbers cited by docs/research/failure-map
// and by the public copy come from THIS script's output, not from ad-hoc probes.
//
// Why the script exists: three hand-written probes disagreed on the SERVER
// "terminal" count because they grouped retries by turn (or by turn+step
// without the session file). Turn numbers are per-session and a turn contains
// many steps, so both groupings credit a failure with a success that belongs to
// a different step or a different session. The retry unit is
// (session file, turn, step). This script uses exactly that key.
//
// It reads the shipped log reader (packages/plugin/dist) rather than a copy, so
// the evidence passes through the same decompression path the product uses.
//
// It also classifies every MALFORMED_RESPONSE by parser shape and by whether the
// shipped splitter can prove a split (kind x verdict), so the "37 repairable /
// 3 not repairable" numbers in the failure map are product output, not a probe.
//
// Output: data/results/session-sample-<stamp>.json + .sha256, nothing else.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const stamp = flag('stamp', '')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  console.error('record_session_sample: --stamp must be ISO-8601 like 2026-11-10T10:40:00.000Z')
  process.exit(2)
}

const sessionsRoot = process.env.DSH_SESSIONS ?? join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')
if (!existsSync(sessionsRoot)) {
  console.error(`record_session_sample: no session directory at ${sessionsRoot}`)
  process.exit(3)
}

// A cutoff is required for a REPRODUCIBLE number: the session directory is
// append-only and the currently active session keeps growing while this script
// runs, so an unfiltered pass yields a different total every time. Sessions
// modified after the cutoff are skipped and listed, never silently dropped.
const until = flag('until', '')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(until)) {
  console.error('record_session_sample: --until must be ISO-8601 like 2026-11-10T10:30:00.000Z')
  process.exit(2)
}
const untilMs = Date.parse(until)

const readerPath = join(ROOT, 'packages', 'plugin', 'dist', 'index.js')
if (!existsSync(readerPath)) {
  console.error('record_session_sample: build first (packages/plugin/dist/index.js is missing)')
  process.exit(3)
}
const { decompressSessionLog } = await import(pathToFileURL(readerPath).href)
if (typeof decompressSessionLog !== 'function') {
  console.error('record_session_sample: the built plugin no longer exports decompressSessionLog')
  process.exit(3)
}

const corePath = join(ROOT, 'packages', 'core', 'dist', 'index.js')
if (!existsSync(corePath)) {
  console.error('record_session_sample: build first (packages/core/dist/index.js is missing)')
  process.exit(3)
}
const { splitTopLevelJsonObjects } = await import(pathToFileURL(corePath).href)
if (typeof splitTopLevelJsonObjects !== 'function') {
  console.error('record_session_sample: the built core no longer exports splitTopLevelJsonObjects')
  process.exit(3)
}

const RECEIVED = 'Received arguments:'

// Classify one MALFORMED_RESPONSE message the way the product sees it: the
// first line names the shape, and the echoed arguments decide whether the
// shipped splitter can prove a split. Anything unprovable is "not repairable".
function classifyMalformed(message) {
  const firstLine = String(message ?? '').split('\n')[0]
  const tool = /Tool call "([^"]+)"/.exec(firstLine)?.[1] ?? '(unparsed)'
  const kind =
    /Unexpected non-whitespace character after JSON/.test(firstLine) ? 'trailing-objects(fusion)'
    : /Unexpected token .+ in JSON at position/.test(firstLine) ? 'unexpected-token'
    : /Expected ',' or '\}' after property value/.test(firstLine) ? 'cut-inside-object'
    : /Expected ',' or '\]' after array element/.test(firstLine) ? 'cut-inside-array'
    : /Unterminated string/.test(firstLine) ? 'cut-inside-string'
    : /Unexpected end of JSON input/.test(firstLine) ? 'empty-or-truncated'
    : 'other'
  const marker = String(message ?? '').indexOf(RECEIVED)
  if (marker === -1) return { tool, kind, verdict: 'no-captured-text' }
  const captured = String(message).slice(marker + RECEIVED.length).replace(/^\r?\n/, '')
  const split = splitTopLevelJsonObjects(captured)
  if (!split.ok) return { tool, kind, verdict: 'split-failed' }
  if (split.slices.length < 2) return { tool, kind, verdict: 'single-object' }
  const allObjects = split.slices.every((piece) => {
    try {
      const value = JSON.parse(piece)
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    } catch {
      return false
    }
  })
  return { tool, kind, verdict: allObjects ? `proven-${split.slices.length}-objects` : 'multi-unparsable' }
}

function collect(dir, prefix, into) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      collect(path, `${prefix}${name}/`, into)
      continue
    }
    if (!name.endsWith('.zstd') && !name.endsWith('.jsonl')) continue
    into.push({ path, label: `${prefix}${name}`, mtimeMs: stat.mtimeMs, bytes: stat.size })
  }
  return into
}

const files = collect(sessionsRoot, '', []).sort((a, b) => a.label.localeCompare(b.label))
const skipped = files.filter((file) => file.mtimeMs > untilMs)
const sampled = files.filter((file) => file.mtimeMs <= untilMs)

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by)
const ranked = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
const SUCCESS = new Set(['stop', 'tool-calls'])

const turnEndReasons = new Map()
const finishOutcomes = new Map()
const perCode = new Map()
const fusedToolNames = new Map()
const malformedShapes = new Map()
const unreadable = []
let attemptRecords = 0
let turnEndTotal = 0
let turnsWithoutAttempt = 0
let recordsWithoutFinish = 0
let toolCallDeltaChunks = 0
let blockStarts = 0
let blockEnds = 0
let unpairedBlockEnds = 0

const perCodeEntry = (code) => {
  if (!perCode.has(code)) {
    perCode.set(code, {
      failedAttempts: 0,
      failingGroups: 0,
      groupsEndingInSuccess: 0,
      groupsEndingInSameCode: 0,
      groupsEndingInOtherFailure: 0,
      attemptsInGroupsEndingInThisCode: 0,
      attemptsPerFailingGroup: new Map(),
    })
  }
  return perCode.get(code)
}

for (const file of sampled) {
  let text
  try {
    text = decompressSessionLog(readFileSync(file.path))
  } catch (error) {
    unreadable.push({ file: file.label, reason: String(error?.message ?? error) })
    continue
  }

  const groups = new Map()
  const turnEnd = new Map()
  const startsInTurn = new Map()
  const endsInTurn = new Map()

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const data = event?.data
    const turn = String(data?.turn)

    if (event?.type === 'turn/end') {
      turnEndTotal += 1
      const reason = data?.reason ?? {}
      const code = reason.kind === 'error' ? `error:${reason.error?.code}` : String(reason.kind)
      bump(turnEndReasons, code)
      turnEnd.set(turn, code)
      continue
    }

    const stream = Array.isArray(data?.stream) ? data.stream : null
    if (!stream) continue
    attemptRecords += 1

    const key = `${file.label}#${turn}/${data?.step}`
    let outcome = null
    let message = ''
    for (const entry of stream) {
      const chunk = entry?.chunk
      if (!chunk) continue
      if (chunk.type === 'tool-call-delta') toolCallDeltaChunks += 1
      if (chunk.type === 'block-start') {
        blockStarts += 1
        startsInTurn.set(turn, (startsInTurn.get(turn) ?? 0) + 1)
      }
      if (chunk.type === 'block-end') {
        blockEnds += 1
        endsInTurn.set(turn, (endsInTurn.get(turn) ?? 0) + 1)
      }
      if (chunk.type !== 'finish') continue
      const reason = chunk.reason ?? {}
      outcome = reason.kind === 'error' ? `error:${reason.failure?.code}` : String(reason.kind)
      message = reason.failure?.message ?? ''
    }
    if (outcome === null) {
      recordsWithoutFinish += 1
      continue
    }
    if (!groups.has(key)) groups.set(key, { turn, outcomes: [], messages: [] })
    const group = groups.get(key)
    group.outcomes.push(outcome)
    group.messages.push(message)
  }

  for (const turn of turnEnd.keys()) {
    if ([...groups.values()].every((group) => group.turn !== turn)) turnsWithoutAttempt += 1
  }
  for (const [turn, ends] of endsInTurn) {
    const starts = startsInTurn.get(turn) ?? 0
    if (ends > starts) unpairedBlockEnds += ends - starts
  }

  for (const group of groups.values()) {
    for (const [index, code] of group.outcomes.entries()) {
      bump(finishOutcomes, code)
      if (SUCCESS.has(code)) continue
      const entry = perCodeEntry(code)
      entry.failedAttempts += 1
      if (code === 'error:MALFORMED_RESPONSE') {
        const message = group.messages[index] ?? ''
        const name = /Tool call "([^"]+)"/.exec(message)?.[1]
        bump(fusedToolNames, name ?? '(unparsed)')
        const shape = classifyMalformed(message)
        bump(malformedShapes, `${shape.kind} | ${shape.verdict}`)
      }
    }
    const counts = new Map()
    for (const code of group.outcomes) if (!SUCCESS.has(code)) bump(counts, code)
    for (const [code, count] of counts) {
      perCodeEntry(code).failingGroups += 1
      bump(perCodeEntry(code).attemptsPerFailingGroup, String(count))
    }
    const last = group.outcomes.at(-1)
    if (last === undefined || SUCCESS.has(last)) {
      for (const code of counts.keys()) {
        const entry = perCodeEntry(code)
        entry.groupsEndingInSuccess += 1
      }
      continue
    }
    const entry = perCodeEntry(last)
    entry.groupsEndingInSameCode += 1
    entry.attemptsInGroupsEndingInThisCode += (counts.get(last) ?? 0)
    for (const code of counts.keys()) {
      if (code === last) continue
      const other = perCodeEntry(code)
      other.groupsEndingInOtherFailure += 1
    }
  }
}

const window = sampled.length === 0
  ? { oldest: null, newest: null }
  : {
      oldest: new Date(Math.min(...sampled.map((file) => file.mtimeMs))).toISOString(),
      newest: new Date(Math.max(...sampled.map((file) => file.mtimeMs))).toISOString(),
    }

const fingerprint = createHash('sha256')
  .update(sampled.map((file) => `${file.label}:${file.bytes}:${file.mtimeMs}`).join('\n'))
  .digest('hex')

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_session_sample.mjs',
  generated_at: stamp,
  source: {
    path: '~/.dsh/sessions',
    root_relative: relative(HERE, sessionsRoot) || sessionsRoot,
    files: sampled.length,
    unreadable: unreadable.length,
    window,
    fingerprint_sha256: fingerprint,
  },
  read_with: 'dsh-remedy decompressSessionLog (packages/plugin/dist)',
  retry_unit: 'session file + turn + step',
  totals: {
    attempt_records: attemptRecords,
    attempt_records_without_finish: recordsWithoutFinish,
    turn_end: turnEndTotal,
    turns_without_attempt: turnsWithoutAttempt,
    tool_call_delta_chunks: toolCallDeltaChunks,
    block_starts: blockStarts,
    block_ends: blockEnds,
    block_ends_without_a_start_in_the_same_turn: unpairedBlockEnds,
  },
  turn_end_reasons: ranked(turnEndReasons),
  finish_outcomes: ranked(finishOutcomes),
  failed_attempts_per_code: [...perCode.entries()]
    .sort((a, b) => b[1].failedAttempts - a[1].failedAttempts || a[0].localeCompare(b[0]))
    .map(([code, entry]) => ({
      code,
      failed_attempts: entry.failedAttempts,
      failing_groups: entry.failingGroups,
      groups_ending_in_success: entry.groupsEndingInSuccess,
      groups_ending_in_this_code: entry.groupsEndingInSameCode,
      groups_ending_in_another_failure: entry.groupsEndingInOtherFailure,
      attempts_in_groups_ending_in_this_code: entry.attemptsInGroupsEndingInThisCode,
      attempts_per_failing_group: ranked(entry.attemptsPerFailingGroup).map(([count, groups]) => ({ attempts: Number(count), groups })),
    })),
  fused_call_tool_names: ranked(fusedToolNames).map(([name, calls]) => ({ name, calls })),
  malformed_response_shapes: ranked(malformedShapes).map(([shape, failures]) => {
    const [kind, verdict] = shape.split(' | ')
    return { kind, verdict, failures, repairable: verdict.startsWith('proven-') }
  }),
  unreadable,
}

const out = flag('out', join('data', 'results', `session-sample-${stamp.replaceAll(':', '-')}.json`))
const target = join(ROOT, out)
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`)
const digest = createHash('sha256').update(readFileSync(target)).digest('hex')
writeFileSync(`${target}.sha256`, `${digest}  ${basename(target)}\n`)

console.log(`record_session_sample: wrote ${out}`)
console.log(`record_session_sample: ${sampled.length} file(s), ${turnEndTotal} turn/end, ${attemptRecords} attempt record(s)`)
console.log(`record_session_sample: sha256 ${digest}`)
