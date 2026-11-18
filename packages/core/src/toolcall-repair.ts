/**
 * Tool-call argument repair (P-0001): one call is handed back untouched, or as the
 * proven list it should have been. Two in-place exceptions keep the id and name
 * (bare-value reseal P-0005, one missing closer P-0037). Safety rules and the
 * negative controls are in `docs/patches/P-0001-toolcall-fusion.md`.
 */

import { closeMissingDelimiter } from './closer.js'
import { splitTopLevelJsonObjects } from './json-split.js'
import { resealToolCallArguments } from './reseal.js'
import type { ToolCallInput } from './types.js'

export type RepairRejectionCode =
  | 'truncated'
  | 'missing-id'
  | 'missing-name'
  | 'not-an-object-sequence'
  | 'single-object'
  | 'unparsable-fragment'
  | 'fragment-not-object'
  | 'too-many-calls'

export interface RepairOptions {
  /** Set when the stream ended with `finish.reason.kind === 'length'`. */
  readonly truncated?: boolean
  /** Hard ceiling on synthesized calls. Default 8. */
  readonly maxCalls?: number
  /** Ids already present in the stream, so a synthetic id cannot collide. */
  readonly existingIds?: Iterable<string>
}

export interface RepairUnchanged {
  readonly status: 'unchanged'
  readonly code: 'already-valid' | 'empty-arguments'
  readonly calls: readonly ToolCallInput[]
}

export interface RepairRepaired {
  readonly status: 'repaired'
  readonly code: 'split' | 'resealed' | 'closed'
  readonly calls: readonly ToolCallInput[]
  /** Number of top-level objects found in the fused text (1 when resealed or closed). */
  readonly fragments: number
  /** `resealed`: the member key whose value was bare. `closed`: `<delimiter>@<offset>`. */
  readonly key?: string
}

export interface RepairRejected {
  readonly status: 'rejected'
  readonly code: RepairRejectionCode
  readonly detail: string
}

export type RepairResult = RepairUnchanged | RepairRepaired | RepairRejected

const DEFAULT_MAX_CALLS = 8

/** Public so the wrapper and the CLI share one ceiling instead of two literals. */
export { DEFAULT_MAX_CALLS }

function reject(code: RepairRejectionCode, detail: string): RepairRejected {
  return { status: 'rejected', code, detail }
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  const id = `${base}-${suffix}`
  taken.add(id)
  return id
}

/**
 * Decide whether one tool call is a fused pair and, if so, split it.
 *
 * @param call - the call as the adapter assembled it.
 * @param options - truncation flag, ceiling, and ids already in the stream.
 */
export function repairToolCallArguments(
  call: ToolCallInput,
  options: RepairOptions = {},
): RepairResult {
  if (options.truncated === true) {
    return reject('truncated', 'finish reason is length: the tail was cut, not fused')
  }
  if (call.id.trim() === '') {
    return reject('missing-id', 'a synthetic call cannot be traced without an id')
  }
  if (call.name.trim() === '') {
    return reject('missing-name', 'a synthetic call cannot be dispatched without a tool name')
  }

  const text = call.arguments
  if (text.trim() === '') {
    return { status: 'unchanged', code: 'empty-arguments', calls: [call] }
  }

  try {
    JSON.parse(text)
    return { status: 'unchanged', code: 'already-valid', calls: [call] }
  } catch {
    // Fall through: an unparseable text is inspected, never re-serialised.
  }

  // P-0037: one dropped closing delimiter, proven by uniqueness. It runs before
  // the splitter because the dropped `]` also makes the depth scanner end at
  // depth 1: the text is one object exactly one character short of parsing.
  const closer = closeMissingDelimiter(text)
  if (closer.status === 'closed') {
    return {
      status: 'repaired',
      code: 'closed',
      calls: [{ id: call.id, name: call.name, arguments: closer.text }],
      fragments: 1,
      key: `${closer.delimiter}@${closer.at}`,
    }
  }

  const split = splitTopLevelJsonObjects(text)
  if (!split.ok) {
    // The closer proof already knows more than the depth scanner does, and a
    // refusal that drops that knowledge is the defect P-0003 removed elsewhere.
    const why = closer.status === 'refused' ? `${split.code}: ${split.detail}; closer: ${closer.detail}` : `${split.code}: ${split.detail}`
    return reject('not-an-object-sequence', why)
  }
  if (split.slices.length === 1) {
    // One object that does not parse is not a fusion, but it can still be the
    // bare-value defect (P-0005): the model wrote a program after `"code": `
    // without quotes. Resealing is accepted only when exactly one segment
    // proves, so this stays a refusal for every other single-object shape.
    // Truncation is already refused above, so the reseal pass cannot be reached
    // with a cut tail: no second truncation guard is needed here. The closer
    // proof already ran above and did not fire, so the two never meet.
    const reseal = resealToolCallArguments(text)
    if (reseal.status !== 'resealed') {
      return reject('single-object', `the text is one object; ${reseal.detail}`)
    }
    return {
      status: 'repaired',
      code: 'resealed',
      calls: [{ id: call.id, name: call.name, arguments: reseal.text }],
      fragments: 1,
      key: reseal.key,
    }
  }

  const maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS
  if (split.slices.length > maxCalls) {
    return reject('too-many-calls', `${split.slices.length} objects exceeds the ceiling of ${maxCalls}`)
  }

  const values: Record<string, unknown>[] = []
  for (const [index, slice] of split.slices.entries()) {
    let value: unknown
    try {
      value = JSON.parse(slice)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return reject('unparsable-fragment', `fragment ${index} does not parse: ${detail}`)
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return reject('fragment-not-object', `fragment ${index} is not a JSON object`)
    }
    values.push(value as Record<string, unknown>)
  }

  const taken = new Set<string>(options.existingIds ?? [])
  taken.add(call.id)
  const calls: ToolCallInput[] = []
  for (const [index, value] of values.entries()) {
    const id = index === 0 ? call.id : uniqueId(`${call.id}#remedy-${index}`, taken)
    calls.push({ id, name: call.name, arguments: JSON.stringify(value) })
  }

  return { status: 'repaired', code: 'split', calls, fragments: values.length }
}

/**
 * Whether the text would be repaired, without building the calls. Used by the
 * evidence scanner, where only the count matters.
 */
export function wouldRepair(call: ToolCallInput, options: RepairOptions = {}): boolean {
  return repairToolCallArguments(call, options).status === 'repaired'
}
