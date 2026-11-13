#!/usr/bin/env node
/**
 * `dsh-remedy explain` — what is this plugin doing in *this* profile?
 *
 * The plugin ships a patch registry, but the registry answers "what patches
 * exist", not "which of them are mounted here and which failure classes they
 * cover". A user who just saw a dead turn needs the second question, and until
 * now the only way to answer it was to read `docs/HANDOFF.md`.
 *
 * This command reads three things, all read-only:
 *
 *   1. the registry (`PATCHES`) — what each patch claims and its status;
 *   2. the profile patch layer, if a path is given with `--profile-file` — what
 *      the mounted plugin is actually configured to do;
 *   3. a scan of the session directory, if `--sessions` is given — which failure
 *      classes this host really hits, ranked by how often.
 *
 * The output is a table: failure class → how often → which patch covers it →
 * whether that patch is on here. It never invents a number: every count comes
 * from the scan, and every "on here" comes from the profile file.
 *
 * Exit codes: 0 when no class this host hits is covered-and-switched-off in a
 * profile that was read, 1 when one is, 3 when an input is unreadable. With no
 * `--profile-file` nothing was measured, so `enabled here` reads `unknown` and
 * no class can be a finding (P-0025).
 */

import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { EXIT_FINDING, EXIT_OK, EXIT_UNAVAILABLE, flagString, type Args } from './cli-args.js'
import { redactReport, scanSessions, type ScanTurnCensus } from './session-scan.js'
import { decompressSessionLog } from './session-log.js'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PATCHES } from 'dsh-remedy-core'

/**
 * Which failure class each patch answers — read from the registry, never restated
 * here (P-0016).
 *
 * This table used to live in this file as two constants, `COVERAGE` and
 * `SWITCHES`. That made "which patch covers which failure class" a fact with two
 * homes: adding a patch meant remembering this command, and the two could drift
 * with nothing to catch it. The patches themselves now carry `failureClasses`
 * and `switchKey`, so a patch added tomorrow is covered by `explain` the moment
 * it lands in `PATCHES`.
 */
function coverageOfPatch(patchId: string): readonly string[] {
  return PATCHES.find((patch) => patch.id === patchId)?.failureClasses ?? []
}

/** The covering patch ids for one failure class, in registry order. */
function coverersOf(failure: string): readonly string[] {
  return PATCHES.filter((patch) => (patch.failureClasses ?? []).includes(failure)).map((patch) => patch.id)
}

/** The config key that switches one patch's coverage on, if it has one. */
function switchOf(patchId: string): string | undefined {
  return PATCHES.find((patch) => patch.id === patchId)?.switchKey
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
  // This reads a YAML patch layer without a YAML parser: the only keys it needs
  // are the flat ones under the plugin's own row, and a wrong guess must not
  // become an invented answer, so an absent key stays absent.
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
  if (key === 'repair') return value !== false
  if (key === 'retryOnMalformed') return typeof value === 'number' && value > 0
  return value !== false
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
  /**
   * Patches switched on in the profile that was read, or `null` when none was
   * read (P-0025: on / off / unmeasured are three states, not two).
   */
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

  // Turn endings first: they are what costs the user a whole turn.
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

  let census: ScanTurnCensus = { completed: 0, max_tokens: 0, aborted: 0, error: 0 }
  let errorCodes: Record<string, number> = {}
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
  }

  const rows = explainRows(census, errorCodes, config)

  process.stdout.write('failure class            turns  covered by        enabled here\n')
  process.stdout.write('-----------------------  -----  -----------------  --------------\n')
  let uncovered = 0
  for (const row of rows) {
    const covering = row.coveredBy.length === 0 ? (row.byDesign === undefined ? '(none)' : 'by design') : row.coveredBy.join(',')
    // `unknown` is a third state, not a synonym for "(no)": no profile was read,
    // so "off" would answer a question the command never asked (P-0025).
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
    // A class this host hits, covered by a patch, switched off in a profile that
    // was actually read, is the one thing worth a nonzero exit. An unread profile
    // cannot support that claim (P-0025).
    if (config !== null && row.coveredBy.length > 0 && row.enabled !== null && row.enabled.length === 0) uncovered += 1
  }

  if (config === null) {
    process.stdout.write('\nenabled-here is unknown: pass --profile-file <cordis.patch.yml> to read it\n')
  }
  if (sessions === undefined) {
    process.stdout.write('\ncounts are unknown: pass --sessions <directory> to measure them\n')
  } else {
    process.stdout.write(`\nmeasured over ${files} session file(s)\n`)
  }
  for (const row of rows) {
    if (row.byDesign !== undefined) process.stdout.write(`by design: ${row.failure} — ${row.byDesign}\n`)
  }
  return uncovered === 0 ? EXIT_OK : EXIT_FINDING
}
