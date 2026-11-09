/**
 * Offline scanner for DSH session logs.
 *
 * It answers two questions with the same engine the plugin uses:
 *  - how many tool calls were fused in this session (`assistant/attempt` deltas)?
 *  - how many turns died on `MALFORMED_RESPONSE`, and how many of those the
 *    patch would have repaired (`turn/end` failures)?
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

export interface ScanReport {
  readonly schema_version: 1
  readonly produced_by: string
  readonly generated_at: string
  readonly source: string
  readonly attempts: number
  readonly fused_calls: number
  readonly fusion_failures: number
  readonly repairable_failures: number
  readonly unreadable_lines: number
  readonly by_tool: Readonly<Record<string, number>>
  readonly examples: readonly ScanExample[]
  readonly redaction: RedactionSummary
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
 * @param text - the `.jsonl` contents, one event per line.
 * @param source - a label for the report (the caller redacts the path).
 */
export function scanSessionText(text: string, source: string): ScanReport {
  let attempts = 0
  let fusedCalls = 0
  let fusionFailures = 0
  let repairableFailures = 0
  let unreadable = 0
  const byTool: Record<string, number> = {}
  const examples: ScanExample[] = []
  const redactionKinds = new Set<string>()
  let redactions = 0

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
      const error = asRecord(reason?.error)
      if (reason === null || error === null) continue
      if (asString(reason.kind) !== 'error') continue
      if (asString(error.code) !== 'MALFORMED_RESPONSE') continue
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
    attempts,
    fused_calls: fusedCalls,
    fusion_failures: fusionFailures,
    repairable_failures: repairableFailures,
    unreadable_lines: unreadable,
    by_tool: Object.fromEntries(Object.entries(byTool).sort(([a], [b]) => a.localeCompare(b))),
    examples,
    redaction: { replacements: redactions, kinds: [...redactionKinds].sort() },
  }
}

/** Redact every string in a report before it is printed or written. */
export function redactReport(report: ScanReport): ScanReport {
  return redactValue(report).value as ScanReport
}
