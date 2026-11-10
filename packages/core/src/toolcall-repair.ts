/**
 * Tool-call fusion repair (P-0001).
 *
 * One function, one decision: given a single tool call whose `arguments` text
 * failed to parse, either return the original call untouched or return the
 * proven list of calls it should have been. There is no third outcome.
 *
 * SAFETY PROPERTIES (each one has a negative-control test):
 *  - a value that already parses is never rewritten;
 *  - a single object that fails to parse is never "repaired" (the defect is
 *    something else and splitting would fabricate a second call) — the one
 *    exception is a proven bare-value reseal, which returns that same call with
 *    its own bytes intact (P-0005);
 *  - a `max-tokens` truncation is never repaired (the tail is missing, not fused);
 *  - every fragment must parse to a plain object before any call is returned;
 *  - a call without an id or without a tool name is rejected: a synthetic call
 *    that cannot be traced or dispatched is worse than the original failure;
 *  - the first call keeps the original id, so the transcript stays traceable;
 *  - synthetic ids are suffixed and collision-checked.
 */

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
  readonly code: 'split' | 'resealed'
  readonly calls: readonly ToolCallInput[]
  /** Number of top-level objects found in the fused text (1 when resealed). */
  readonly fragments: number
  /** Set only when `code` is `resealed`: the member key whose value was bare. */
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
    // Fall through: the only accepted reason to touch the text is a proven split.
  }

  const split = splitTopLevelJsonObjects(text)
  if (!split.ok) {
    return reject('not-an-object-sequence', `${split.code}: ${split.detail}`)
  }
  if (split.slices.length === 1) {
    // One object that does not parse is not a fusion, but it can still be the
    // bare-value defect (P-0005): the model wrote a program after `"code": `
    // without quotes. Resealing is accepted only when exactly one segment
    // proves, so this stays a refusal for every other single-object shape.
    // Truncation is already refused above, so the reseal pass cannot be reached
    // with a cut tail: no second truncation guard is needed here.
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
