/** Offline scanner (P-0004/P-0006/P-0044/P-0047); each rule is in docs/patches/. */

import { isFusedJsonObjectText, noteAssistantMessage, redact, redactValue, splitTopLevelJsonObjects, turnAnswered, wouldRepair } from 'dsh-remedy-core'
import type { LastAnswer, RedactionSummary } from 'dsh-remedy-core'

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

/** Zeroed census; the names are the accepted `reason.kind`s. */
const emptyCensus = (): ScanTurnCensus => ({ completed: 0, max_tokens: 0, aborted: 0, error: 0 })

/** A count map leaves sorted, so two runs on one log compare equal. */
const sortedCounts = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/** Sum two count maps, sorted for the same reason. */
const mergeCounts = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> => {
  const out: Record<string, number> = { ...a }
  for (const [key, count] of Object.entries(b)) out[key] = (out[key] ?? 0) + count
  return sortedCounts(out)
}

/** The smaller instant; null never wins. */
const lower = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.min(a, b)

/** The larger instant; null never wins. */
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
  /** P-0044: `max_tokens` turns whose last message had no text and no tool call. */
  readonly truncated_without_answer: number
  /** P-0047: `completed` turns of the same shape (upstream #13169). */
  readonly completed_without_answer: number
  /** `reason.error.code` for error turns (P-0006), redaction-safe names only. */
  readonly error_codes: Readonly<Record<string, number>>
  /**
   * P-0042: `provider/model level` -> turns refused for that exact effort. Filled
   * only when the host's message names all three; otherwise nothing is inferred.
   */
  readonly refused_efforts: Readonly<Record<string, number>>
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

/** Proven fragments, 1 when the text is not a fusion. */
function fragmentsOf(text: string): number {
  if (!isFusedJsonObjectText(text)) return 1
  const split = splitTopLevelJsonObjects(text)
  return split.ok ? split.slices.length : 1
}

/** P-0042: `provider/model level` from the host sentence, or null (see its doc). */
function refusedKeyOf(message: string): string | null {
  const named = /provider "([^"]+)" model "([^"]+)" does not support reasoning effort "([^"]+)"/.exec(message)
  return named === null ? null : `${named[1]}/${named[2]} ${named[3]}`
}

/** Scan one file; `since` counts what it drops. */
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
  let truncatedWithoutAnswer = 0
  let completedWithoutAnswer = 0
  const errorCodes: Record<string, number> = {}
  const refusedEfforts: Record<string, number> = {}
  const lastSteps = new Map<string, LastAnswer>()

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

    // P-0009: the `session` header is dated by `createdAt`; see its doc.
    const stamp = time ?? (type === 'session' ? asNumber(event.createdAt) : null)

    // A filtered scan reports what it dropped as `before_since`.
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

    if (type === 'assistant/message' && data !== null) {
      // P-0044: only the last step decides (see its doc).
      const message = asRecord(data.message)
      noteAssistantMessage(lastSteps, data.turn, data.step, message?.content)
    }

    if (type === 'turn/end' && data !== null) {
      const reason = asRecord(data.reason)
      if (reason === null) continue
      // P-0006 census; P-0044 and P-0047 record whether anyone was answered.
      const kind = asString(reason.kind)
      const slot = kind === 'max-tokens' ? 'max_tokens' : kind
      if (slot === 'completed' || slot === 'max_tokens' || slot === 'aborted' || slot === 'error') {
        turns = { ...turns, [slot]: turns[slot] + 1 }
        // P-0044: a truncation that answered nobody. P-0047: the same for completed.
        if (slot === 'max_tokens' && !turnAnswered(lastSteps, data.turn)) truncatedWithoutAnswer += 1
        // P-0047: the silent shape, counted.
        if (slot === 'completed' && !turnAnswered(lastSteps, data.turn)) completedWithoutAnswer += 1
      }
      if (kind !== 'error') continue
      const error = asRecord(reason.error)
      if (error === null) continue
      const rawCode = asString(error.code)
      // A closed-vocabulary code, counted by name; `redactReport` sanitises it.
      if (rawCode !== '') errorCodes[rawCode] = (errorCodes[rawCode] ?? 0) + 1
      // P-0042: only a sentence naming all three is a measured fact.
      if (rawCode === 'UNSUPPORTED_REASONING_EFFORT') {
        const key = refusedKeyOf(asString(error.message))
        if (key !== null) refusedEfforts[key] = (refusedEfforts[key] ?? 0) + 1
      }
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
    truncated_without_answer: truncatedWithoutAnswer,
    completed_without_answer: completedWithoutAnswer,
    error_codes: sortedCounts(errorCodes),
    refused_efforts: sortedCounts(refusedEfforts),
    by_tool: sortedCounts(byTool),
    examples,
    redaction: { replacements: redactions, kinds: [...redactionKinds].sort() },
  }
}

/** Fold one file onto the accumulator. */
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
    truncated_without_answer: into.truncated_without_answer + from.truncated_without_answer,
    completed_without_answer: into.completed_without_answer + from.completed_without_answer,
    error_codes: mergeCounts(into.error_codes, from.error_codes),
    refused_efforts: mergeCounts(into.refused_efforts, from.refused_efforts),
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
  /** P-0044: this file's own count of truncations that answered nobody. */
  readonly truncated_without_answer: number
  /** P-0047: this file's own count of completed turns that answered nobody. */
  readonly completed_without_answer: number
}

export interface ScanBatch {
  readonly report: ScanReport
  readonly rows: readonly ScanRow[]
}

/** Scan several files; every file keeps a row, so a total audits backwards. */
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
    truncated_without_answer: 0,
    completed_without_answer: 0,
    error_codes: {},
    refused_efforts: {},
    by_tool: {},
    examples: [],
    redaction: { replacements: 0, kinds: [] },
  }
  let report = empty
  const rows: ScanRow[] = []
  for (const file of files) {
    // A row carries only what a reader audits; the report is the whole picture.
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
      truncated_without_answer: one.truncated_without_answer,
      completed_without_answer: one.completed_without_answer,
    })
    report = addReport(report, one, empty.source)
  }
  return { report, rows }
}

/** Redact every string before print or write (P-0004). */
export function redactReport(report: ScanReport): ScanReport {
  return redactValue(report).value as ScanReport
}
