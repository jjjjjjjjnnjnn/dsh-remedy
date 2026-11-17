#!/usr/bin/env node
/** P-0016/P-0025/P-0042/P-0051/P-0052: what this plugin is doing here. */

import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { EXIT_FINDING, EXIT_OK, EXIT_UNAVAILABLE, flagString, type Args } from './cli-args.js'
import { redactReport, scanSessions, type ScanTurnCensus } from './session-scan.js'
import { decompressSessionLog } from './session-log.js'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PATCHES } from 'dsh-remedy-core'

/** Covering patch ids for a class, from the registry (P-0016). */
function coverersOf(failure: string): readonly string[] {
  return PATCHES.filter((patch) => (patch.failureClasses ?? []).includes(failure)).map((patch) => patch.id)
}

function switchOf(patchId: string): string | undefined {
  return PATCHES.find((patch) => patch.id === patchId)?.switchKey
}

/** The provider/model/level a profile fixes for the next turn. */
interface ProfileSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

function selectionOf(text: string): ProfileSelection | null {
  const start = text.split(/\r?\n/).findIndex((line) => line === '- id: agent-default-model')
  if (start === -1) return null
  const flat: Record<string, string> = {}
  for (const line of text.split(/\r?\n/).slice(start + 1)) {
    if (/^- /.test(line)) break
    const match = /^\s{2,}([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(line)
    if (match?.[2] !== undefined && match[2].trim() !== '') flat[String(match[1])] = match[2].trim()
  }
  const provider = flat['provider']
  const model = flat['model']
  if (provider === undefined || model === undefined) return null
  const effort = flat['reasoningEffort']
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
}

/** P-0042: both halves and an exact match; never clamps (P-0013). */
function conflicts(refused: Readonly<Record<string, number>>, selection: ProfileSelection | null): string[] {
  const level = selection?.reasoningEffort
  if (selection === null || level === undefined) return []
  const count = refused[`${selection.provider}/${selection.model} ${level}`] ?? 0
  return count <= 0
    ? []
    : [`CONFLICT — ${selection.provider}/${selection.model} fixes reasoningEffort "${level}"; the host refused it ${count} time(s). Change the profile; this plugin does not clamp it.`]
}

/** P-0051: the rule is P-0050's. */
function drops(dropped: number | null): string[] {
  return dropped === null || dropped <= 0
    ? []
    : [`DROPPED — ${dropped} tool(s) this session had called are missing from a later resume/change header; a later call was answered UNKNOWN_TOOL (P-0050).`]
}

/** Classes this project decided never to repair, with the reason. */
const BY_DESIGN: Readonly<Record<string, string>> = {
  'max-tokens': 'upstream by design: a cut tail is missing bytes, not a quote',
  SERVER: 'upstream already retries it (195 of 213 groups self-healed)',
  TRANSPORT: 'upstream already retries it, and a second layer would compete for the seam',
  TIMEOUT: 'upstream by design; the adapter owns the timeout',
  'IMAGE_OFFLOAD_REQUIRED': 'an in-design control signal, not a failure',
  INVALID_CREDENTIAL: 'a documented change; retrying hides the message to read',
}

export function readProfileConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf8')
  const block = text.split(/\n- id /).find((chunk) => /remedy|dsh-remedy/.test(chunk))
  if (block === undefined) return null
  const out: Record<string, unknown> = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^\s{2,}([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(line)
    if (match === null) continue
    const value = (match[2] ?? '').trim()
    out[String(match[1])] = value === '' ? true : value === 'true' ? true : value === 'false' ? false : Number(value) >= 0 && /^\d+$/.test(value) ? Number(value) : value
  }
  return out
}

function isPatchOn(patchId: string, config: Record<string, unknown> | null): boolean {
  if (config === null) return false
  const key = switchOf(patchId)
  if (key === undefined) return false
  const value = config[key]
  return key === 'retryOnMalformed' ? typeof value === 'number' && value > 0 : value !== false
}

function collectSessions(directory: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (/^session\.v4\.jsonl\.(zstd|jsonl)$/.test(entry.name)) files.push(path)
    }
  }
  walk(directory)
  return files
}

interface Row {
  readonly failure: string
  readonly count: number
  readonly coveredBy: readonly string[]
  /** Patches on in the profile read, or `null` when none was read (P-0025). */
  readonly enabled: readonly string[] | null
  readonly byDesign?: string
}

export function explainRows(census: ScanTurnCensus, errorCodes: Readonly<Record<string, number>>, config: Record<string, unknown> | null): Row[] {
  const rows: Row[] = []
  const push = (failure: string, count: number) => {
    const covering = coverersOf(failure)
    rows.push({
      failure,
      count,
      coveredBy: covering,
      enabled: config === null ? null : covering.filter((patch) => isPatchOn(patch, config)),
      ...(BY_DESIGN[failure] === undefined ? {} : { byDesign: BY_DESIGN[failure] }),
    })
  }

  // Turn endings first: they cost the user a whole turn.
  if (census.max_tokens > 0) push('max-tokens', census.max_tokens)
  for (const [code, count] of Object.entries(errorCodes)) {
    if (count > 0) push(code, count)
  }
  if (census.aborted > 0) push('aborted', census.aborted)
  if (census.completed > 0) push('completed', census.completed)
  return rows.sort((a, b) => b.count - a.count || a.failure.localeCompare(b.failure))
}

export function cmdExplain(args: Args): number {
  const sessions = flagString(args, 'sessions')
  const profileFile = flagString(args, 'profile-file')

  if (sessions !== undefined && !existsSync(sessions)) {
    process.stderr.write(`explain: no session directory at ${sessions}\n`)
    return EXIT_UNAVAILABLE
  }

  const config = profileFile === undefined ? null : readProfileConfig(profileFile)
  if (profileFile !== undefined) {
    if (config === null) {
      process.stderr.write(`explain: no remedy row found in ${profileFile}\n`)
      return EXIT_UNAVAILABLE
    }
  }
  const selection = profileFile === undefined ? null : selectionOf(readFileSync(profileFile, 'utf8'))

  let census: ScanTurnCensus = { completed: 0, max_tokens: 0, aborted: 0, error: 0 }
  let errorCodes: Record<string, number> = {}
  let refusedEfforts: Record<string, number> = {}
  /** P-0051: `null` means no directory was measured, which is not a zero. */
  let droppedTools: number | null = null
  /** P-0052: the same null-means-unmeasured rule. */
  let onToolCall: number | null = null
  let files = 0
  if (sessions !== undefined) {
    const inputs = collectSessions(sessions)
    files = inputs.length
    const texts: Array<{ text: string; label: string }> = []
    for (const file of inputs) {
      try {
        texts.push({ text: decompressSessionLog(readFileSync(file)), label: file })
      } catch {
        // An unreadable file is counted as a file, never folded into the numbers.
      }
    }
    const batch = scanSessions(texts, sessions)
    const report = redactReport(batch.report)
    census = report.turns
    errorCodes = { ...report.error_codes }
    refusedEfforts = { ...report.refused_efforts }
    droppedTools = report.dropped_tools
    onToolCall = report.completed_on_tool_call
  }

  const rows = explainRows(census, errorCodes, config)

  process.stdout.write('failure class            turns  covered by        enabled here\n')
  process.stdout.write('-----------------------  -----  -----------------  --------------\n')
  let uncovered = 0
  for (const row of rows) {
    const covering = row.coveredBy.length === 0 ? (row.byDesign === undefined ? '(none)' : 'by design') : row.coveredBy.join(',')
    // P-0025: `null` is unknown, never a zero; `(no)` needs a profile that was read.
    const enabled =
      row.coveredBy.length === 0
        ? (row.byDesign === undefined ? '(none)' : 'no (by design)')
        : row.enabled === null
          ? 'unknown'
          : row.enabled.length === 0
            ? '(no)'
            : row.enabled.join(',')
    process.stdout.write(
      `${row.failure.padEnd(23)}  ${String(row.count).padStart(5)}  ${covering.padEnd(17)}  ${enabled}\n`,
    )
    // A class this host hits, covered by a patch, off in a profile that was read, is a
    // finding; an unread profile cannot support that claim (P-0025).
    if (config !== null && row.coveredBy.length > 0 && row.enabled !== null && row.enabled.length === 0) uncovered += 1
  }

  if (config === null) {
    process.stdout.write('\nenabled-here unknown: pass --profile-file <cordis.patch.yml>\n')
  }
  if (sessions === undefined) {
    process.stdout.write('\ncounts unknown: pass --sessions <directory>\n')
  } else {
    process.stdout.write(`\nmeasured: ${files} session file(s)\n`)
  }
  for (const row of rows) {
    if (row.byDesign !== undefined) process.stdout.write(`by design: ${row.failure} — ${row.byDesign}\n`)
  }
  // P-0042: the two halves meet here; `agent/pre-step` cannot change a selection
  // (data/results/prestep-enter-2026-11-15T17-55-00.000Z.json), so naming is the only lever.
  const findings = conflicts(refusedEfforts, selection)
  // P-0051: the session census has a second thing worth a nonzero exit.
  const drift = drops(droppedTools)
  const toolCall = onToolCall === null || onToolCall <= 0 ? [] : [`TOOLCALL — ${onToolCall} completed turn(s) ended on a tool call; the UI counts only text (P-0052).`]
  for (const line of [...drift, ...toolCall, ...findings]) process.stdout.write(`${line}\n`)
  return uncovered === 0 && findings.length === 0 && drift.length === 0 && toolCall.length === 0 ? EXIT_OK : EXIT_FINDING
}
