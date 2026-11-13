/**
 * The `llm/stream` repair wrapper. Measured ordering (session 9045e2ec, seq 524):
 * `block-start` → `tool-call-delta`* → `usage` → `finish{kind:'error'}`, no
 * `block-end` for the fused call — so the repair point is the terminal finish (the
 * throw path is handled too). DSH 0.2.2-rc.3 closes the first block itself and
 * leaves the surplus object to that same finish.
 *
 * Refusals: no unproven success; no `max-tokens` repair; no unnamed dispatch; no
 * commit while a later block could still reject; no dropped `replayState`.
 */

import {
  DEFAULT_MAX_CALLS,
  repairToolCallArguments,
  type ToolCallInput,
} from 'dsh-remedy-core'
import { argumentsFromFailure, isFusionFailure, normalizeArguments } from './failure-text.js'
import type { RemedyMonitor } from './monitor.js'
import type {
  BlockEndChunk,
  FinishChunk,
  LlmFailure,
  OpenCall,
  PendingBlock,
  RepairEvent,
  RepairStreamOptions,
  StreamChunk,
  ToolDeclaration,
} from './stream-types.js'

// The counter ledger moved to `monitor.ts` (the split P-0012 pays for) because
// the reasoning behind each counter is the largest part of it and the stream
// wrapper has its own cap to stay under.
export { RemedyMonitor } from './monitor.js'

// The data vocabulary moved to `stream-types.ts` (P-0005 seam split); every name
// still resolves through this module, so `index.ts` and the `./repair-stream`
// export map keep their public surface unchanged.
export type {
  BlockEndChunk,
  BlockStartChunk,
  DeltaChunk,
  FinishChunk,
  FinishReason,
  LlmFailure,
  RepairEvent,
  RepairStreamOptions,
  StreamChunk,
  ToolCallDeltaChunk,
  ToolDeclaration,
  UsageChunk,
} from './stream-types.js'

function ceilingOf(options: RepairStreamOptions): number {
  const value = options.maxCalls
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return DEFAULT_MAX_CALLS
  return value
}

/** Sent when a fragment's name cannot be proven (P-0027); the runtime answers
 * `UNKNOWN_TOOL` and continues (measured 0.2.2-rc.3). */
export const UNATTRIBUTED_NAME = 'remedy_unattributed'

/** Only a declared `required` list proves anything; none means no claim. */
function attributable(call: ToolCallInput, tools: readonly ToolDeclaration[] | undefined): boolean {
  if (tools === undefined || tools.length === 0) return true
  const declaration = tools.find((tool) => tool.name === call.name)
  const required = declaration?.parameters?.required
  if (declaration === undefined || required === undefined || required.length === 0) return true
  let parsed: unknown
  try {
    parsed = JSON.parse(normalizeArguments(call.arguments))
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
  return required.every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
}

interface RescuePlan {
  readonly chunks: readonly StreamChunk[]
}

/** A proven fusion becomes N `block-end` chunks and an error finish becomes
 * `{kind:'stop'}`; anything unproven passes through, throw included. */
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

  const hold = (entry: PendingBlock): void => {
    holding = true
    pending.push(entry)
  }

  /** Hold a chunk that is not a candidate for repair. */
  const holdPlain = (chunk: StreamChunk): void => {
    hold({ original: chunk, synthesized: null, repaired: null, spent: 0 })
  }

  /** All-or-nothing: one unrepairable buffer or two names on an index aborts. */
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

    const decisions: Array<{
      index: number
      calls: readonly ToolCallInput[]
      fused: boolean
      /** Set when this decision is a bare-value reseal (P-0005), not a split. */
      reseal: { tool: string; callId: string; key: string } | null
    }> = []
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
        // A reseal (P-0005) rewrites one call in place: it synthesizes nothing,
        // so it must not consume the stream-wide call budget.
        if (result.code === 'split') planned += result.calls.length
        // Write the synthesized ids back so the next candidate cannot mint the same one.
        for (const call of result.calls) seenIds.add(call.id)
        if (proven === null) {
          const first = result.calls[0]
          if (first !== undefined) proven = { name: first.name, id: first.id }
        }
        decisions.push({
          index: candidate.index,
          calls: result.calls,
          fused: true,
          reseal:
            result.code === 'resealed'
              ? { tool: candidate.call.name, callId: id, key: result.key ?? '' }
              : null,
        })
        continue
      }
      decisions.push({ index: candidate.index, calls: result.calls, fused: false, reseal: null })
    }

    if (!fusedSeen) return null

    const chunks: StreamChunk[] = []
    let unattributed = 0
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
        // P-0027: the stream named one tool for this index, so a fragment that does
        // not fit that tool's declared fields has no provable name. It goes out
        // under a name the runtime cannot execute rather than as a wrong call.
        if (offset > 0 && !attributable(call, options.tools)) {
          unattributed += 1
          chunks.push(closeCall(index, { ...call, name: UNATTRIBUTED_NAME }))
          continue
        }
        chunks.push(closeCall(index, call))
      }
    }

    // Counters and the stream budget are recorded only after the whole plan is proven.
    synthesized += planned
    for (const decision of decisions) {
      if (!decision.fused) continue
      const first = decision.calls[0]
      if (!first) continue
      if (decision.reseal !== null) {
        monitor.recordResealed(decision.reseal.tool, decision.reseal.callId, decision.reseal.key)
        continue
      }
      monitor.recordRepaired(first.name, first.id, decision.calls.length, unattributed)
    }

    return { chunks }
  }

  /** Emit the held tail; a rejected block withdraws every repair, so the turn fails
   * whole instead of running half-repaired. */
  function* flushPending(): Generator<StreamChunk> {
    if (pending.length === 0) return
    const blocks = pending.splice(0, pending.length)
    for (const entry of blocks) {
      if (entry.resealed !== undefined) {
        if (withdrawing !== null) {
          // The rewrite was proven and then given back. Nothing was dispatched,
          // so `withdrawn` alone carries it: booking `fused` would claim a second
          // call existed, and booking `unrepaired` would claim bytes were lost.
          if (withdrawing === 'rejected') {
            monitor.recordRejected(
              entry.resealed.tool,
              entry.resealed.callId,
              'rolled-back',
              'a later block in the same stream was rejected, so this reseal was withdrawn',
            )
          }
          yield entry.original
          continue
        }
        monitor.recordResealed(entry.resealed.tool, entry.resealed.callId, entry.resealed.key)
        if (entry.synthesized !== null) yield* entry.synthesized
        continue
      }
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

  /** Withdraw at the finish for the same all-or-nothing reason; a `max-tokens`
   * finish withdraws as a cut, not as an unrepaired fusion. */
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
              // A reseal (P-0005) rewrites the one call in place: it keeps this
              // block's index and id, synthesizes nothing, and must not consume
              // the stream-wide call budget. It is booked as `resealed`, never as
              // a fusion, because no second call existed.
              if (result.code === 'resealed') {
                hold({
                  original: chunk,
                  synthesized: chunks,
                  repaired: null,
                  resealed: { tool: chunk.block.name, callId: chunk.block.id, key: result.key ?? '' },
                  spent: 0,
                })
                break
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
