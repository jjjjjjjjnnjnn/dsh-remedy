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
 *  - it never dispatches a call it could not name or trace;
 *  - it never commits a `block-end` repair while that same stream could still
 *    reject a later block, so one turn is either fully repaired or untouched;
 *  - it never drops the adapter's `replayState` on a repaired finish.
 */

import {
  DEFAULT_MAX_CALLS,
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
  private refused = 0
  private withdrawn = 0
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

  /**
   * Book one refusal (P-0003 / BS-12).
   *
   * `fused` keeps its P-0001 meaning: a fusion was actually observed. Before
   * P-0003 every rejection incremented it, so a plain bad JSON argument read as
   * a fusion and a stream whose only defect was syntax reported `degraded`
   * (BS-12). Three buckets, and no fourth:
   *
   *  - `refused` alone — we refused and the text was never proven to be a
   *    fusion: `not-an-object-sequence`, `single-object`, `unparsable-fragment`,
   *    `fragment-not-object`, `missing-id`, `missing-name`, `name-changed`.
   *    An unknown code lands here too: a code this build does not know is not
   *    assumed repairable.
   *  - `fused` + `refused` + `unrepaired` — `too-many-calls`: the input *was* a
   *    proven fusion shape, but our own `maxCalls` budget refused to split it.
   *    It is a fusion we chose not to take (`fused`), a refusal (`refused`),
   *    and — because the original failure then goes out untouched — a proven
   *    fusion that was never repaired (`unrepaired`).
   *
   *    Booking `fused` without `unrepaired` here would be a lie. `judgeRemedy`
   *    reports `repaired` (headline "defect seen and repaired") whenever
   *    `fused > 0` and `unrepaired === 0`, even with `repaired === 0`; and
   *    dropping `fused` too would report `quiet` ("defect not seen") for a
   *    stream we just refused to fix. `degraded` is the only state that
   *    describes a proven fusion left unrepaired, which is exactly what
   *    `unrepaired` is defined to be.
   *  - `withdrawn` alone — `rolled-back`: a repair that was already proven is
   *    given back, so the run must not claim it. The proven-but-abandoned split
   *    itself is booked by `recordAbandoned`, which is the only place that can
   *    move `fused` + `unrepaired` for an abandoned proof.
   *  - `withdrawn` alone — `consumer-abort`: the consumer stopped reading before
   *    any decision. This code keeps its P-0002 booking (`fused` +
   *    `unrepaired`) *in addition to* `withdrawn`, because the verdict
   *    vocabulary is fixed: with `fused > 0` and `unrepaired === 0`, `judgeRemedy`
   *    would report "repaired", and with `fused === 0` it would report "quiet".
   *    Both claims are false for a stream whose buffered call was never emitted.
   *
   *    `truncated` never reaches this method: a cut stream is counted by
   *    `recordTruncated()`, and a truncation withdrawal is not a failed repair.
   */
  recordRejected(tool: string, callId: string, code: string, detail: string): void {
    switch (code) {
      case 'rolled-back':
        this.withdrawn += 1
        break
      case 'consumer-abort':
        this.withdrawn += 1
        // See the note above: the fixed verdict vocabulary cannot express
        // "undecided buffer abandoned", so this keeps the P-0002 counters that
        // stop a truncated-by-consumer stream from reading quiet or repaired.
        this.fused += 1
        this.unrepaired += 1
        break
      case 'too-many-calls':
        this.fused += 1
        this.refused += 1
        // The original failure goes out untouched, so the proven fusion really is
        // unrepaired; see the note above. Without this, `judgeRemedy` would claim
        // "defect seen and repaired" for a stream that repaired nothing.
        this.unrepaired += 1
        break
      default:
        this.refused += 1
    }
    this.emit({ kind: 'rejected', tool, callId, code, detail })
  }

  /**
   * Book a rescue that was proven for at least one candidate and then abandoned
   * because another candidate in the same stream could not be split.
   *
   * The proof existed, so this is a fusion (`fused`); the calls were never
   * dispatched, so it is `unrepaired`. This is the only place `unrepaired`
   * moves: it stays the single bucket for "proven fusion, no repair". The
   * refused candidate is booked separately by `recordRejected`, so
   * `fused`+`unrepaired` here and `refused` there are two different candidates,
   * never the same one counted twice.
   */
  recordAbandoned(tool: string, callId: string, detail: string): void {
    this.fused += 1
    this.unrepaired += 1
    this.emit({ kind: 'rejected', tool, callId, code: 'abandoned-rescue', detail })
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
      refused: this.refused,
      withdrawn: this.withdrawn,
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
  /** Ceiling on calls synthesized across the whole stream. Default 8. */
  readonly maxCalls?: number
}

interface OpenCall {
  id: string
  name: string
  text: string
}

interface PendingBlock {
  /** What is emitted when the stream is not repaired as a whole. */
  readonly original: StreamChunk
  /** What is emitted when it is; `null` means "the original, unchanged". */
  readonly synthesized: readonly StreamChunk[] | null
  readonly repaired: { readonly tool: string; readonly callId: string; readonly fragments: number } | null
  /** Calls this entry took from the stream-wide budget, returned if it is withdrawn. */
  readonly spent: number
}

const RECEIVED_MARKER = /Received arguments:\r?\n/

function isFusionFailure(failure: LlmFailure | undefined): boolean {
  if (!failure) return false
  if (failure.code === 'MALFORMED_RESPONSE') return true
  const message = failure.message ?? ''
  return /Unexpected non-whitespace character after JSON|Unexpected token .+ in JSON at position/i.test(message)
}

/**
 * The exact argument text is echoed in the adapter's failure message.
 *
 * A message we cannot attribute to a tool is not a rescue candidate: synthesizing
 * `name: 'unknown'` would dispatch a call to a tool that does not exist.
 */
function argumentsFromFailure(failure: LlmFailure | undefined): { name: string; text: string } | null {
  const message = failure?.message ?? ''
  const marker = RECEIVED_MARKER.exec(message)
  if (!marker) return null
  const text = message.slice(marker.index + marker[0].length)
  if (text.trim() === '') return null
  const name = /Tool call "([^"]+)"/.exec(message)?.[1]
  if (name === undefined || name.trim() === '') return null
  return { name, text }
}

function normalizeArguments(text: string): string {
  return text.trim() === '' ? '{}' : text
}

function ceilingOf(options: RepairStreamOptions): number {
  const value = options.maxCalls
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return DEFAULT_MAX_CALLS
  return value
}

interface RescuePlan {
  readonly chunks: readonly StreamChunk[]
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

  const ceiling = ceilingOf(options)
  const open = new Map<number, OpenCall>()
  const seenIds = new Set<string>()
  const pending: PendingBlock[] = []
  let holding = false
  let synthesized = 0
  let highestIndex = -1
  let blockEndsSeen = 0
  let truncated = false
  let finished = false
  let failed = false
  let exhausted = false
  let blockRejected = false
  let withdrawing: 'rejected' | 'truncated' | null = null
  let nameConflict = false

  const track = (index: number): void => {
    if (index > highestIndex) highestIndex = index
  }

  const nextIndex = (): number => {
    highestIndex += 1
    return highestIndex
  }

  /** Budget left for calls synthesized from this stream (not from one block). */
  const remaining = (): number => ceiling - synthesized

  const closeCall = (index: number, call: ToolCallInput): BlockEndChunk => ({
    type: 'block-end',
    index,
    block: { type: 'tool-call', id: call.id, name: call.name, arguments: normalizeArguments(call.arguments) },
  })

  const stopFinish = (replayState: unknown): FinishChunk => ({
    type: 'finish',
    reason: { kind: 'stop' },
    ...(replayState === undefined ? {} : { replayState }),
  })

  /** Once a `block-end` is held, everything after it is held too, so order is never rewritten. */
  const hold = (entry: PendingBlock): void => {
    holding = true
    pending.push(entry)
  }

  /** Hold a chunk that is not a candidate for repair. */
  const holdPlain = (chunk: StreamChunk): void => {
    hold({ original: chunk, synthesized: null, repaired: null, spent: 0 })
  }

  /**
   * Decide every open call at once. All-or-nothing: one unrepairable buffer
   * aborts the rescue, so a turn never runs with a silently dropped call.
   *
   * A name conflict aborts too: two tool names on one index means the rest of
   * the request cannot be attributed to the right tool without guessing.
   */
  const planRescue = (failure: LlmFailure | undefined): RescuePlan | null => {
    if (nameConflict || blockRejected) return null
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
    let planned = 0
    let proven: { name: string; id: string } | null = null
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
        { truncated, maxCalls: remaining() - planned, existingIds: seenIds },
      )
      if (result.status === 'rejected') {
        monitor.recordRejected(candidate.call.name, id, result.code, result.detail)
        // One candidate was already proven splittable, but the all-or-nothing rule
        // drops the whole rescue. The proof is real (a fusion was seen), the calls
        // are never dispatched, so this is the one place that books `unrepaired`.
        // `recordRejected` above books only the *refused candidate*, never this
        // proven one, so the two counts name two different candidates.
        if (fusedSeen && proven !== null) {
          monitor.recordAbandoned(
            proven.name,
            proven.id,
            `candidate "${candidate.call.name}" at index ${String(candidate.index)} was rejected (${result.code}), so the proven split was abandoned`,
          )
        }
        return null
      }
      if (result.status === 'repaired') {
        fusedSeen = true
        planned += result.calls.length
        // Write the synthesized ids back so the next candidate cannot mint the same one.
        for (const call of result.calls) seenIds.add(call.id)
        if (proven === null) {
          const first = result.calls[0]
          if (first !== undefined) proven = { name: first.name, id: first.id }
        }
      }
      decisions.push({ index: candidate.index, calls: result.calls, fused: result.status === 'repaired' })
    }

    if (!fusedSeen) return null

    const chunks: StreamChunk[] = []
    for (const decision of decisions) {
      for (const [offset, call] of decision.calls.entries()) {
        if (offset === 0 && decision.index !== -1) {
          chunks.push(closeCall(decision.index, call))
          continue
        }
        // A synthesized call needs its own opening block: a bare `block-end` for an
        // index the consumer never saw start is not a well-formed block sequence.
        const index = nextIndex()
        chunks.push({ type: 'block-start', index, blockType: 'tool-call' })
        chunks.push(closeCall(index, call))
      }
    }

    // Counters and the stream budget are recorded only after the whole plan is proven.
    synthesized += planned
    for (const decision of decisions) {
      if (!decision.fused) continue
      const first = decision.calls[0]
      if (!first) continue
      monitor.recordRepaired(first.name, first.id, decision.calls.length)
    }

    return { chunks }
  }

  /**
   * Emit the held tail. If any block in this stream was rejected, every repair is
   * withdrawn and the originals go out instead: the turn fails as a whole rather
   * than running with a half-repaired call list.
   */
  function* flushPending(): Generator<StreamChunk> {
    if (pending.length === 0) return
    const blocks = pending.splice(0, pending.length)
    for (const entry of blocks) {
      if (entry.repaired !== null && withdrawing !== null) {
        // A withdrawn repair never ran, so its calls go back to the stream budget.
        synthesized -= entry.spent
        if (withdrawing === 'rejected') {
          // The split was proven and then given back: a fusion was seen and no call
          // was dispatched, so it is `fused` + `unrepaired` plus `withdrawn`.
          monitor.recordAbandoned(
            entry.repaired.tool,
            entry.repaired.callId,
            'a later block in the same stream was rejected, so this proven split was withdrawn',
          )
          monitor.recordRejected(
            entry.repaired.tool,
            entry.repaired.callId,
            'rolled-back',
            'a later block in the same stream was rejected, so this repair was withdrawn',
          )
        }
        // A truncated stream is not a failed repair: it is already counted as
        // `truncated`, and booking anything else here would report `degraded`.
        yield entry.original
        continue
      }
      if (entry.repaired !== null) {
        monitor.recordRepaired(entry.repaired.tool, entry.repaired.callId, entry.repaired.fragments)
        if (entry.synthesized !== null) yield* entry.synthesized
        continue
      }
      if (entry.synthesized !== null) {
        yield* entry.synthesized
        continue
      }
      yield entry.original
    }
  }

  /**
   * A failing stream must not commit a repair it cannot complete: withdrawing is
   * the same all-or-nothing rule as a rejected block, applied at the finish.
   *
   * A `max-tokens` finish withdraws too, but for a different reason: the stream
   * was cut, not rejected, so it must not be counted as an unrepaired fusion.
   */
  const withdrawPending = (reason: 'rejected' | 'truncated'): void => {
    if (pending.some((entry) => entry.repaired !== null)) withdrawing = reason
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
          if (holding) holdPlain(chunk)
          else yield chunk
          break
        }
        case 'tool-call-delta': {
          track(chunk.index)
          const call = open.get(chunk.index) ?? { id: '', name: '', text: '' }
          if (chunk.id) call.id = chunk.id
          if (typeof chunk.name === 'string' && chunk.name !== '') {
            if (call.name !== '' && call.name !== chunk.name) {
              nameConflict = true
              monitor.recordRejected(
                call.name,
                call.id,
                'name-changed',
                `index ${chunk.index} carried "${call.name}" and then "${chunk.name}"`,
              )
            } else {
              call.name = chunk.name
            }
          }
          if (typeof chunk.argumentsDelta === 'string') {
            call.text += chunk.argumentsDelta
          } else {
            // A missing delta is an adapter defect, not argument text: never concatenate `undefined`.
            monitor.recordError()
          }
          if (call.id !== '') seenIds.add(call.id)
          open.set(chunk.index, call)
          if (holding) holdPlain(chunk)
          else yield chunk
          break
        }
        case 'text-delta':
        case 'reasoning-delta': {
          track(chunk.index)
          if (holding) holdPlain(chunk)
          else yield chunk
          break
        }
        case 'block-end': {
          track(chunk.index)
          blockEndsSeen += 1
          if (chunk.block.type === 'tool-call') {
            open.delete(chunk.index)
            seenIds.add(chunk.block.id)
            const result = repairToolCallArguments(chunk.block, {
              maxCalls: remaining(),
              existingIds: seenIds,
            })
            if (result.status === 'repaired') {
              const chunks: StreamChunk[] = []
              for (const [offset, call] of result.calls.entries()) {
                seenIds.add(call.id)
                if (offset === 0) {
                  chunks.push(closeCall(chunk.index, call))
                  continue
                }
                const index = nextIndex()
                chunks.push({ type: 'block-start', index, blockType: 'tool-call' })
                chunks.push(closeCall(index, call))
              }
              synthesized += result.calls.length
              hold({
                original: chunk,
                synthesized: chunks,
                repaired: { tool: chunk.block.name, callId: chunk.block.id, fragments: result.fragments },
                spent: result.calls.length,
              })
            } else if (result.status === 'rejected') {
              blockRejected = true
              withdrawPending('rejected')
              monitor.recordRejected(chunk.block.name, chunk.block.id, result.code, result.detail)
              holdPlain(chunk)
            } else if (chunk.block.arguments.trim() === '') {
              // A no-argument tool call is `{}` downstream, not the empty string.
              hold({ original: chunk, synthesized: [closeCall(chunk.index, chunk.block)], repaired: null, spent: 0 })
            } else {
              holdPlain(chunk)
            }
          } else {
            open.delete(chunk.index)
            holdPlain(chunk)
          }
          break
        }
        case 'usage': {
          if (holding) holdPlain(chunk)
          else yield chunk
          break
        }
        case 'finish': {
          finished = true
          if (chunk.reason.kind === 'max-tokens') {
            truncated = true
            monitor.recordTruncated()
            withdrawPending('truncated')
          } else if (chunk.reason.kind !== 'stop') {
            withdrawPending('rejected')
          }
          yield* flushPending()
          if (chunk.reason.kind === 'error') {
            const plan = blockEndsSeen > 0 ? null : planRescue(chunk.reason.failure)
            if (plan !== null) {
              for (const repaired of plan.chunks) yield repaired
              yield stopFinish(chunk.replayState)
              return
            }
            // A failure that passed through is still an observed error: the journal
            // must not report zero errors for a stream that failed. A fusion failure
            // that was refused is already counted as a rejection, not as an error.
            if (!isFusionFailure(chunk.reason.failure)) monitor.recordError()
          }
          yield chunk
          return
        }
        default: {
          if (holding) holdPlain(chunk)
          else yield chunk
        }
      }
    }
    exhausted = true
    yield* flushPending()
  } catch (error) {
    failed = true
    if (finished) {
      monitor.recordError()
      throw error
    }
    const failure: LlmFailure = {
      code: (error as { code?: string } | null)?.code,
      message: error instanceof Error ? error.message : String(error),
    }
    const plan = blockEndsSeen > 0 ? null : planRescue(failure)
    if (plan === null) {
      monitor.recordError()
      yield* flushPending()
      throw error
    }
    for (const repaired of plan.chunks) yield repaired
    yield stopFinish(undefined)
  } finally {
    const abandonedRepairs = pending.filter((entry) => entry.repaired !== null).length
    const abandonedOpen = open.size
    if (!finished && !failed && !exhausted && (abandonedOpen > 0 || abandonedRepairs > 0 || pending.length > 0)) {
      // The consumer stopped reading before any finish: the held tail and buffered calls
      // were abandoned, so this stream must not be reported as quiet.
      monitor.recordRejected(
        '<abandoned>',
        '',
        'consumer-abort',
        `${abandonedOpen} open call(s) and ${pending.length} held chunk(s) were never emitted because the consumer stopped early`,
      )
    }
    monitor.recordStreamEnd()
  }
}
