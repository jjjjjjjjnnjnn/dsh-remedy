/**
 * The counter ledger, split out of `repair-stream.ts` (P-0012's payment, not a
 * patch of its own). The wrapper decides; this file only books, which keeps
 * `repair-stream.js` inside its cap while each counter keeps its reason.
 *
 * Every counter has exactly one meaning and these docs are the contract. A
 * counter that cannot say why it moved lies, and this project shipped two of
 * those (BS-12, and the unreadable-line counter of P-0009).
 */

import { judgeRemedy } from 'dsh-remedy-core'
import type { RemedyCounters, RemedyVerdict } from 'dsh-remedy-core'
import type { RepairEvent } from './stream-types.js'

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
  private resealed = 0
  /** Failures named but deliberately not repaired (P-0013). */
  private diagnoses = 0
  private readonly listeners = new Set<(event: RepairEvent) => void>()
  private readonly recorded: RepairEvent[] = []

  enterStream(): void {
    this.streams += 1
  }

  recordRepaired(tool: string, callId: string, fragments: number, unattributed = 0, unproven = 0): void {
    this.fused += 1
    this.repaired += 1
    this.emit({ kind: 'repaired', tool, callId, fragments, ...(unattributed > 0 ? { unattributed } : {}), ...(unproven > 0 ? { unproven } : {}) })
  }

  /**
   * Book one bare-value reseal (P-0005).
   *
   * Not a fusion: exactly one call was intended, it kept its id, and its bytes went
   * out unchanged inside a JSON string. So it moves `resealed` only — never `fused`
   * ("a fusion was observed") and never `repaired` ("a fused call was split"). The
   * verdict reads it as a repair, because a defect was seen and fixed.
   */
  recordResealed(tool: string, callId: string, key: string): void {
    this.resealed += 1
    this.emit({ kind: 'resealed', tool, callId, key })
  }

  /**
   * Book one refusal (P-0003 / BS-12). `fused` keeps its P-0001 meaning: a fusion was
   * actually observed, so a plain bad JSON argument is not one (before P-0003 it was,
   * and such a stream read `degraded`). Three buckets, no fourth:
   *
   *  - `refused` alone — never proven to be a fusion: `not-an-object-sequence`,
   *    `single-object`, `unparsable-fragment`, `fragment-not-object`, `missing-id`,
   *    `missing-name`, `name-changed`, `empty-id-delta`; an unknown code lands here too.
   *  - `fused` + `refused` + `unrepaired` — `too-many-calls`: a proven fusion our own
   *    budget declined ("repaired" would lie, "quiet" would hide it).
   *  - `withdrawn` alone — `rolled-back`: a proven repair given back.
   *  - `withdrawn` plus the P-0002 pair — `consumer-abort`: the consumer stopped before
   *    any decision.
   *
   * `truncated` never reaches this method: a cut stream is `recordTruncated()`.
   */
  recordRejected(tool: string, callId: string, code: string, detail: string): void {
    switch (code) {
      case 'rolled-back':
        this.withdrawn += 1
        break
      case 'consumer-abort':
        this.withdrawn += 1
        // The fixed verdict vocabulary cannot express "undecided buffer
        // abandoned", so this keeps the counters that stop such a stream from
        // reading quiet or repaired.
        this.fused += 1
        this.unrepaired += 1
        break
      case 'too-many-calls':
        this.fused += 1
        this.refused += 1
        this.unrepaired += 1
        break
      default:
        this.refused += 1
    }
    this.emit({ kind: 'rejected', tool, callId, code, detail })
  }

  /**
   * Book a rescue that was proven for one candidate and then abandoned because another
   * could not be split. The proof existed, so this is a fusion; the calls never
   * dispatched, so it is `unrepaired` — the only place that counter moves. The refused
   * candidate is booked by `recordRejected`, so no candidate is counted twice.
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

  /**
   * Name a failure this plugin can diagnose but must not repair (P-0013).
   *
   * A deterministic refusal costs one named line, not one silent dead turn. This
   * counter never moves the verdict: a named diagnosis is not a repair, a
   * refusal or an error.
   */
  recordDiagnosis(code: string, detail: string): void {
    this.diagnoses += 1
    this.emit({ kind: 'diagnosis', code, detail })
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
      resealed: this.resealed,
      diagnoses: this.diagnoses,
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
