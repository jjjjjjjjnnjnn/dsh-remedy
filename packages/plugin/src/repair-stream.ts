/**
 * The `llm/stream` repair wrapper.
 *
 * MEASURED ORDERING (session 9045e2ec, seq 524): the adapter emits
 * `block-start` → `tool-call-delta`* → `usage` → `finish{kind:'error'}` with
 * `MALFORMED_RESPONSE`. It never emits `block-end` for the fused call. So the
 * primary repair point is the terminal `finish`, using the deltas already
 * buffered; the thrown-exception path is handled too because other adapters
 * throw instead of finishing with an error.
 *
 * WHAT THIS FILE REFUSES TO DO:
 *  - it never turns an error into a success it did not prove (every fragment
 *    must parse; otherwise the original finish/throw goes through untouched);
 *  - it never repairs a `max-tokens` truncation;
 *  - it never dispatches a call it could not name or trace.
 */

import {
  judgeRemedy,
  repairToolCallArguments,
  type RemedyCounters,
  type RemedyVerdict,
  type ToolCallInput,
} from 'dsh-remedy-core'

export interface LlmFailure {
  readonly code?: string
  readonly message?: string
}

export type FinishReason =
  | { readonly kind: 'stop' }
  | { readonly kind: 'max-tokens' }
  | { readonly kind: 'error'; readonly failure: LlmFailure }
  | { readonly kind: 'aborted'; readonly failure?: LlmFailure }

export interface BlockStartChunk {
  readonly type: 'block-start'
  readonly index: number
  readonly blockType: 'text' | 'reasoning' | 'tool-call'
}

export interface DeltaChunk {
  readonly type: 'text-delta' | 'reasoning-delta'
  readonly index: number
  readonly text: string
}

export interface ToolCallDeltaChunk {
  readonly type: 'tool-call-delta'
  readonly index: number
  readonly id: string
  readonly name?: string
  readonly argumentsDelta: string
}

export interface BlockEndChunk {
  readonly type: 'block-end'
  readonly index: number
  readonly block:
    | { readonly type: 'tool-call'; readonly id: string; readonly name: string; readonly arguments: string }
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'reasoning'; readonly text: string }
}

export interface UsageChunk {
  readonly type: 'usage'
  readonly usage: unknown
}

export interface FinishChunk {
  readonly type: 'finish'
  readonly reason: FinishReason
  readonly replayState?: unknown
}

export type StreamChunk =
  | BlockStartChunk
  | DeltaChunk
  | ToolCallDeltaChunk
  | BlockEndChunk
  | UsageChunk
  | FinishChunk

export type RepairEvent =
  | { readonly kind: 'repaired'; readonly tool: string; readonly callId: string; readonly fragments: number }
  | {
      readonly kind: 'rejected'
      readonly tool: string
      readonly callId: string
      readonly code: string
      readonly detail: string
    }
  | { readonly kind: 'retry'; readonly detail: string }
  | { readonly kind: 'stream'; readonly counters: RemedyCounters }

/** Live counters for one plugin instance. */
export class RemedyMonitor {
  private streams = 0
  private fused = 0
  private repaired = 0
  private unrepaired = 0
  private truncated = 0
  private errors = 0
  private readonly listeners = new Set<(event: RepairEvent) => void>()
  private readonly recorded: RepairEvent[] = []

  enterStream(): void {
    this.streams += 1
  }

  recordRepaired(tool: string, callId: string, fragments: number): void {
    this.fused += 1
    this.repaired += 1
    this.emit({ kind: 'repaired', tool, callId, fragments })
  }

  recordRejected(tool: string, callId: string, code: string, detail: string): void {
    this.fused += 1
    this.unrepaired += 1
    this.emit({ kind: 'rejected', tool, callId, code, detail })
  }

  recordTruncated(): void {
    this.truncated += 1
  }

  recordError(): void {
    this.errors += 1
  }

  recordRetry(detail: string): void {
    this.emit({ kind: 'retry', detail })
  }

  /** One line per stream, so a quiet run still has evidence it observed the seam. */
  recordStreamEnd(): void {
    this.emit({ kind: 'stream', counters: this.counters() })
  }

  counters(): RemedyCounters {
    return {
      streams: this.streams,
      fused: this.fused,
      repaired: this.repaired,
      unrepaired: this.unrepaired,
      truncated: this.truncated,
      errors: this.errors,
    }
  }

  verdict(): RemedyVerdict {
    return judgeRemedy(this.counters())
  }

  events(): readonly RepairEvent[] {
    return [...this.recorded]
  }

  onEvent(listener: (event: RepairEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: RepairEvent): void {
    this.recorded.push(event)
    for (const listener of this.listeners) listener(event)
  }
}

export interface RepairStreamOptions {
  /** Ceiling on calls synthesized from one fused block. Default 8. */
  readonly maxCalls?: number
}

interface OpenCall {
  id: string
  name: string
  text: string
}

const RECEIVED_MARKER = /Received arguments:\r?\n/

function isFusionFailure(failure: LlmFailure | undefined): boolean {
  if (!failure) return false
  if (failure.code === 'MALFORMED_RESPONSE') return true
  const message = failure.message ?? ''
  return /Unexpected non-whitespace character after JSON|Unexpected token .+ in JSON at position/i.test(message)
}

/** The exact argument text is echoed in the adapter's failure message. */
function argumentsFromFailure(failure: LlmFailure | undefined): { name: string; text: string } | null {
  const message = failure?.message ?? ''
  const marker = RECEIVED_MARKER.exec(message)
  if (!marker) return null
  const text = message.slice(marker.index + marker[0].length)
  if (text.trim() === '') return null
  const name = /Tool call "([^"]+)"/.exec(message)?.[1] ?? 'unknown'
  return { name, text }
}

function normalizeArguments(text: string): string {
  return text.trim() === '' ? '{}' : text
}

interface RescuePlan {
  readonly chunks: readonly BlockEndChunk[]
}

/**
 * Wrap a chunk stream and repair fused tool calls.
 *
 * The returned generator yields the same chunks in the same order, except that
 * a repaired tool call becomes N `block-end` chunks and a terminal
 * `MALFORMED_RESPONSE` finish becomes `{kind:'stop'}`. If no repair is proven,
 * the original chunks (or the original throw) pass through unchanged.
 */
export async function* repairStream(
  source: AsyncIterable<unknown>,
  monitor: RemedyMonitor,
  options: RepairStreamOptions = {},
): AsyncGenerator<StreamChunk> {
  monitor.enterStream()

  const open = new Map<number, OpenCall>()
  const seenIds = new Set<string>()
  let highestIndex = -1
  let blockEndsSeen = 0
  let truncated = false
  let finished = false

  const track = (index: number): void => {
    if (index > highestIndex) highestIndex = index
  }

  const nextIndex = (): number => {
    highestIndex += 1
    return highestIndex
  }

  const closeCall = (index: number, call: ToolCallInput): BlockEndChunk => ({
    type: 'block-end',
    index,
    block: { type: 'tool-call', id: call.id, name: call.name, arguments: normalizeArguments(call.arguments) },
  })

  /**
   * Decide every open call at once. All-or-nothing: one unrepairable buffer
   * aborts the rescue, so a turn never runs with a silently dropped call.
   */
  const planRescue = (failure: LlmFailure | undefined): RescuePlan | null => {
    if (!isFusionFailure(failure)) return null

    const entries = [...open.entries()].sort((a, b) => a[0] - b[0])
    const candidates: Array<{ index: number; call: ToolCallInput }> = []
    let fusedSeen = false

    if (entries.length > 0) {
      for (const [index, call] of entries) {
        candidates.push({ index, call: { id: call.id, name: call.name, arguments: call.text } })
      }
    } else {
      if (blockEndsSeen > 0) return null
      const recovered = argumentsFromFailure(failure)
      if (!recovered) return null
      candidates.push({ index: -1, call: { id: '', name: recovered.name, arguments: recovered.text } })
    }

    const decisions: Array<{ index: number; calls: readonly ToolCallInput[]; fused: boolean }> = []
    for (const candidate of candidates) {
      let id = candidate.call.id
      if (id.trim() === '') {
        let serial = 1
        while (seenIds.has(`call_remedy_${serial}`)) serial += 1
        id = `call_remedy_${serial}`
        seenIds.add(id)
      }
      const result = repairToolCallArguments(
        { id, name: candidate.call.name, arguments: candidate.call.arguments },
        { truncated, maxCalls: options.maxCalls, existingIds: seenIds },
      )
      if (result.status === 'rejected') {
        monitor.recordRejected(candidate.call.name, id, result.code, result.detail)
        return null
      }
      if (result.status === 'repaired') fusedSeen = true
      decisions.push({ index: candidate.index, calls: result.calls, fused: result.status === 'repaired' })
    }

    if (!fusedSeen) return null

    const chunks: BlockEndChunk[] = []
    for (const decision of decisions) {
      for (const [offset, call] of decision.calls.entries()) {
        const index = offset === 0 ? (decision.index === -1 ? nextIndex() : decision.index) : nextIndex()
        chunks.push(closeCall(index, call))
      }
    }

    // Counters are recorded only after the whole plan is proven.
    for (const decision of decisions) {
      if (!decision.fused) continue
      const first = decision.calls[0]
      if (!first) continue
      monitor.recordRepaired(first.name, first.id, decision.calls.length)
    }

    return { chunks }
  }

  try {
    for await (const raw of source) {
      const chunk = raw as StreamChunk
      switch (chunk.type) {
        case 'block-start': {
          track(chunk.index)
          if (chunk.blockType === 'tool-call') {
            open.set(chunk.index, { id: '', name: '', text: '' })
          }
          yield chunk
          break
        }
        case 'tool-call-delta': {
          track(chunk.index)
          const call = open.get(chunk.index) ?? { id: '', name: '', text: '' }
          if (chunk.id) call.id = chunk.id
          if (chunk.name) call.name = chunk.name
          call.text += chunk.argumentsDelta
          if (call.id !== '') seenIds.add(call.id)
          open.set(chunk.index, call)
          yield chunk
          break
        }
        case 'text-delta':
        case 'reasoning-delta': {
          track(chunk.index)
          yield chunk
          break
        }
        case 'block-end': {
          track(chunk.index)
          blockEndsSeen += 1
          if (chunk.block.type === 'tool-call') {
            open.delete(chunk.index)
            seenIds.add(chunk.block.id)
            const result = repairToolCallArguments(chunk.block, {
              maxCalls: options.maxCalls,
              existingIds: seenIds,
            })
            if (result.status === 'repaired') {
              monitor.recordRepaired(chunk.block.name, chunk.block.id, result.fragments)
              for (const [offset, call] of result.calls.entries()) {
                yield closeCall(offset === 0 ? chunk.index : nextIndex(), call)
              }
            } else if (result.status === 'rejected') {
              monitor.recordRejected(chunk.block.name, chunk.block.id, result.code, result.detail)
              yield chunk
            } else if (chunk.block.arguments.trim() === '') {
              // A no-argument tool call is `{}` downstream, not the empty string.
              yield closeCall(chunk.index, chunk.block)
            } else {
              yield chunk
            }
          } else {
            open.delete(chunk.index)
            yield chunk
          }
          break
        }
        case 'usage': {
          yield chunk
          break
        }
        case 'finish': {
          finished = true
          if (chunk.reason.kind === 'max-tokens') {
            truncated = true
            if (open.size > 0) monitor.recordTruncated()
          }
          if (chunk.reason.kind === 'error') {
            const plan = planRescue(chunk.reason.failure)
            if (plan !== null) {
              for (const repaired of plan.chunks) yield repaired
              yield { type: 'finish', reason: { kind: 'stop' } }
              return
            }
          }
          yield chunk
          return
        }
        default: {
          yield chunk
        }
      }
    }
  } catch (error) {
    if (finished) {
      monitor.recordError()
      throw error
    }
    const failure: LlmFailure = {
      code: (error as { code?: string } | null)?.code,
      message: error instanceof Error ? error.message : String(error),
    }
    const plan = planRescue(failure)
    if (plan === null) {
      monitor.recordError()
      throw error
    }
    for (const repaired of plan.chunks) yield repaired
    yield { type: 'finish', reason: { kind: 'stop' } }
  } finally {
    monitor.recordStreamEnd()
  }
}
