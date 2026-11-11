/**
 * Offline scanner for DSH session logs.
 *
 * It answers three questions with the same engine the plugin uses:
 *  - how many tool calls were fused in this session (`assistant/attempt` deltas)?
 *  - how many turns died on `MALFORMED_RESPONSE`, and how many of those the
 *    patch would have repaired (`turn/end` failures)?
 *  - how did *every* turn end, including the classes this layer cannot repair
 *    (P-0006: a map with one road is not a map)?
 *
 * The scanner never writes and never trusts a log line it cannot parse: an
 * unreadable line is counted, not skipped silently.
 */

import { isFusedJsonObjectText, redact, redactValue, splitTopLevelJsonObjects, wouldRepair } from 'dsh-remedy-core'
import type { RedactionSummary } from 'dsh-remedy-core'

export interface ScanExample {
  readonly seq: number | null
  readonly tool: string
  readonly callId: string | null
  readonly fragments: number
  readonly repairable: boolean
  readonly excerpt: string
}

/**
 * How every `turn/end` ended (P-0006), keyed by `reason.kind` with its hyphen
 * turned into an underscore (`max-tokens` -> `max_tokens`).
 */
export interface ScanTurnCensus {
  readonly completed: number
  readonly max_tokens: number
  readonly aborted: number
  readonly error: number
}

/** One zeroed census; the counter names are also the accepted `reason.kind`s. */
const emptyCensus = (): ScanTurnCensus => ({ completed: 0, max_tokens: 0, aborted: 0, error: 0 })

/** Insertion order is not a report: every count map leaves sorted by name. */
const sortedCounts = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/** Add two count maps together, sorting the result for the same reason. */
const mergeCounts = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> => {
  const out: Record<string, number> = { ...a }
  for (const [key, count] of Object.entries(b)) out[key] = (out[key] ?? 0) + count
  return sortedCounts(out)
}

/** The smaller of two nullable instants; a missing side never wins. */
const lower = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.min(a, b)

/** The larger of two nullable instants; a missing side never wins. */
const higher = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.max(a, b)

export interface ScanReport {
  readonly schema_version: 1
  readonly produced_by: string
  readonly generated_at: string
  readonly source: string
  readonly files: number
  readonly attempts: number
  readonly fused_calls: number
  readonly fusion_failures: number
  readonly repairable_failures: number
  readonly unreadable_lines: number
  readonly before_since: number
  readonly window: ScanWindow
  /** Every `turn/end`, by `reason.kind` (P-0006). */
  readonly turns: ScanTurnCensus
  /** `reason.error.code` for error turns (P-0006), redaction-safe names only. */
  readonly error_codes: Readonly<Record<string, number>>
  readonly by_tool: Readonly<Record<string, number>>
  readonly examples: readonly ScanExample[]
  readonly redaction: RedactionSummary
}

/** Epoch milliseconds of the kept events, or null for an empty window. */
export interface ScanWindow {
  readonly oldest: number | null
  readonly newest: number | null
}

export interface ScanOptions {
  /** Drop every event older than this epoch-ms instant; count them instead. */
  readonly since?: number
}

interface AttemptBuffer {
  tool: string
  callId: string
  delta: string
  summary: string | null
}

const MAX_EXAMPLES = 5
const EXCERPT_LENGTH = 240

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Count top-level objects in a proven fusion; 1 when it is not a fusion. */
function fragmentsOf(text: string): number {
  if (!isFusedJsonObjectText(text)) return 1
  const split = splitTopLevelJsonObjects(text)
  return split.ok ? split.slices.length : 1
}

/**
 * Scan one session file's text.
 *
 * `source` is a label, not necessarily a path; `since` drops older events but
 * counts them, because a window that hides its own exclusions is a lie.
 */
export function scanSessionText(text: string, source: string, options: ScanOptions = {}): ScanReport {
  let attempts = 0
  let fusedCalls = 0
  let fusionFailures = 0
  let repairableFailures = 0
  let unreadable = 0
  let beforeSince = 0
  let oldest: number | null = null
  let newest: number | null = null
  const byTool: Record<string, number> = {}
  const examples: ScanExample[] = []
  const redactionKinds = new Set<string>()
  let redactions = 0
  let turns: ScanTurnCensus = emptyCensus()
  const errorCodes: Record<string, number> = {}

  const addExample = (example: ScanExample): void => {
    if (examples.length >= MAX_EXAMPLES) return
    const result = redact(example.excerpt)
    redactions += result.summary.replacements
    for (const kind of result.summary.kinds) redactionKinds.add(kind)
    examples.push({ ...example, excerpt: result.text })
  }

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    let event: Record<string, unknown> | null
    try {
      event = asRecord(JSON.parse(line))
    } catch {
      unreadable += 1
      continue
    }
    if (event === null) {
      unreadable += 1
      continue
    }

    const type = asString(event.type)
    const data = asRecord(event.data)
    const seq = asNumber(event.seq)
    const time = asNumber(event.time)

    // P-0009: a session opens with a `session` header whose instant is
    // `createdAt`, not `time`; reading it as "no time" spends one unreadable
    // line per session on a record that parsed perfectly.
    const stamp = time ?? (type === 'session' ? asNumber(event.createdAt) : null)

    // The window is applied before any counting, but the dropped events are
    // reported as `before_since`: a filtered scan must still say how much it
    // did not look at.
    if (options.since !== undefined) {
      if (stamp === null) {
        unreadable += 1
        continue
      }
      if (stamp < options.since) {
        beforeSince += 1
        continue
      }
    }
    if (stamp !== null) {
      oldest = oldest === null ? stamp : Math.min(oldest, stamp)
      newest = newest === null ? stamp : Math.max(newest, stamp)
    }

    if (type === 'assistant/attempt' && data !== null) {
      attempts += 1
      const stream = Array.isArray(data.stream) ? data.stream : []
      const buffers = new Map<number, AttemptBuffer>()
      for (const raw of stream) {
        const entry = asRecord(raw)
        if (entry === null) continue
        const entryType = asString(entry.type)
        if (entryType === 'tool-call-chunks') {
          const index = asNumber(entry.index)
          if (index === null) continue
          const args = Array.isArray(entry.args) ? entry.args.map(asString).join('') : ''
          buffers.set(index, {
            tool: asString(entry.name),
            callId: asString(entry.id),
            delta: '',
            summary: args,
          })
          continue
        }
        if (entryType === 'chunk') {
          const chunk = asRecord(entry.chunk)
          if (chunk === null || asString(chunk.type) !== 'tool-call-delta') continue
          const index = asNumber(chunk.index)
          if (index === null) continue
          const current = buffers.get(index) ?? {
            tool: asString(chunk.name),
            callId: asString(chunk.id),
            delta: '',
            summary: null,
          }
          current.delta += asString(chunk.argumentsDelta)
          buffers.set(index, current)
        }
      }

      for (const [index, buffer] of buffers) {
        const args = buffer.summary ?? buffer.delta
        if (!isFusedJsonObjectText(args)) continue
        fusedCalls += 1
        byTool[buffer.tool] = (byTool[buffer.tool] ?? 0) + 1
        addExample({
          seq,
          tool: buffer.tool,
          callId: buffer.callId === '' ? null : buffer.callId,
          fragments: fragmentsOf(args),
          repairable: true,
          excerpt: `index=${index} ${args.slice(0, EXCERPT_LENGTH)}`,
        })
      }
    }

    if (type === 'turn/end' && data !== null) {
      const reason = asRecord(data.reason)
      if (reason === null) continue
      // P-0006: count every ending first; the filter answers "can we repair
      // this?", the census answers "how did it end?", and a map needs both.
      const kind = asString(reason.kind)
      const slot = kind === 'max-tokens' ? 'max_tokens' : kind
      if (slot === 'completed' || slot === 'max_tokens' || slot === 'aborted' || slot === 'error') {
        turns = { ...turns, [slot]: turns[slot] + 1 }
      }
      if (kind !== 'error') continue
      const error = asRecord(reason.error)
      if (error === null) continue
      const rawCode = asString(error.code)
      // A code is a closed-vocabulary identifier and `redactReport` sanitises
      // the whole report, so it is counted by name rather than per-line.
      if (rawCode !== '') errorCodes[rawCode] = (errorCodes[rawCode] ?? 0) + 1
      if (rawCode !== 'MALFORMED_RESPONSE') continue
      fusionFailures += 1
      const message = asString(error.message)
      const marker = /Received arguments:\r?\n/.exec(message)
      const tool = /Tool call "([^"]+)"/.exec(message)?.[1] ?? 'unknown'
      if (marker === null) continue
      const args = message.slice(marker.index + marker[0].length)
      const repairable = wouldRepair({ id: `scan-${seq ?? fusionFailures}`, name: tool, arguments: args })
      if (repairable) {
        repairableFailures += 1
      }
      addExample({
        seq,
        tool,
        callId: null,
        fragments: fragmentsOf(args),
        repairable,
        excerpt: args.slice(0, EXCERPT_LENGTH),
      })
    }
  }

  return {
    schema_version: 1,
    produced_by: 'dsh-remedy scan',
    generated_at: new Date().toISOString(),
    source: redact(source).text,
    files: 1,
    attempts,
    fused_calls: fusedCalls,
    fusion_failures: fusionFailures,
    repairable_failures: repairableFailures,
    unreadable_lines: unreadable,
    before_since: beforeSince,
    window: { oldest, newest },
    turns,
    error_codes: sortedCounts(errorCodes),
    by_tool: sortedCounts(byTool),
    examples,
    redaction: { replacements: redactions, kinds: [...redactionKinds].sort() },
  }
}

/** Add one report's numbers onto an accumulator (the per-file loop). */
function addReport(into: ScanReport, from: ScanReport, source: string): ScanReport {
  return {
    ...into,
    source,
    files: into.files + from.files,
    attempts: into.attempts + from.attempts,
    fused_calls: into.fused_calls + from.fused_calls,
    fusion_failures: into.fusion_failures + from.fusion_failures,
    repairable_failures: into.repairable_failures + from.repairable_failures,
    unreadable_lines: into.unreadable_lines + from.unreadable_lines,
    before_since: into.before_since + from.before_since,
    window: { oldest: lower(into.window.oldest, from.window.oldest), newest: higher(into.window.newest, from.window.newest) },
    turns: {
      completed: into.turns.completed + from.turns.completed,
      max_tokens: into.turns.max_tokens + from.turns.max_tokens,
      aborted: into.turns.aborted + from.turns.aborted,
      error: into.turns.error + from.turns.error,
    },
    error_codes: mergeCounts(into.error_codes, from.error_codes),
    by_tool: mergeCounts(into.by_tool, from.by_tool),
    examples: [...into.examples, ...from.examples].slice(0, MAX_EXAMPLES),
    redaction: {
      replacements: into.redaction.replacements + from.redaction.replacements,
      kinds: [...new Set([...into.redaction.kinds, ...from.redaction.kinds])].sort(),
    },
  }
}

/** One session file's contribution, so a multi-file scan never hides a file. */
export interface ScanRow {
  readonly source: string
  readonly files: number
  readonly attempts: number
  readonly fused_calls: number
  readonly fusion_failures: number
  readonly repairable_failures: number
  readonly unreadable_lines: number
  readonly before_since: number
  /** P-0006: this file's own turn census, so the total stays auditable. */
  readonly turns: ScanTurnCensus
}

export interface ScanBatch {
  readonly report: ScanReport
  readonly rows: readonly ScanRow[]
}

/**
 * Scan several session files at once.
 *
 * The source becomes a label, not a path: a directory has no single path, and
 * inventing one would cite a file that was never read. Every file also keeps
 * its own row, because a total that cannot be broken down cannot be audited.
 *
 * @param files - pairs of label and text, in the caller's order.
 * @param source - the label for the merged report.
 * @param options - passed to every file (`since` applies to all of them).
 */
export function scanSessions(
  files: readonly { readonly label: string; readonly text: string }[],
  source: string,
  options: ScanOptions = {},
): ScanBatch {
  const empty: ScanReport = {
    schema_version: 1,
    produced_by: 'dsh-remedy scan',
    generated_at: new Date().toISOString(),
    source: redact(source).text,
    files: 0,
    attempts: 0,
    fused_calls: 0,
    fusion_failures: 0,
    repairable_failures: 0,
    unreadable_lines: 0,
    before_since: 0,
    window: { oldest: null, newest: null },
    turns: emptyCensus(),
    error_codes: {},
    by_tool: {},
    examples: [],
    redaction: { replacements: 0, kinds: [] },
  }
  let report = empty
  const rows: ScanRow[] = []
  for (const file of files) {
    // Per-file reports are built with a redacted label so an example can never
    // carry one file's path into another file's summary.
    const one = scanSessionText(file.text, file.label, options)
    rows.push({
      source: one.source,
      files: one.files,
      attempts: one.attempts,
      fused_calls: one.fused_calls,
      fusion_failures: one.fusion_failures,
      repairable_failures: one.repairable_failures,
      unreadable_lines: one.unreadable_lines,
      before_since: one.before_since,
      turns: one.turns,
    })
    report = addReport(report, one, empty.source)
  }
  return { report, rows }
}

/** Redact every string in a report before it is printed or written. */
export function redactReport(report: ScanReport): ScanReport {
  return redactValue(report).value as ScanReport
}
