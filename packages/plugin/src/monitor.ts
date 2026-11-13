/**
 * The counter ledger, split out of `repair-stream.ts` (the split recorded as
 * P-0012's payment, not as a patch of its own).
 *
 * The wrapper decides; this file only books. Splitting them is what keeps
 * `repair-stream.js` inside its own 28 000-byte cap while the reasoning that
 * justifies each counter stays written down: the alternative was deleting the
 * prose, and this repository already rejected that trade twice (R15 recorded it,
 * P-0009 paid 354 bytes for it).
 *
 * Every counter here has exactly one meaning, and the docs below are the
 * contract rather than a comment. A counter that cannot say why it moved is a
 * counter that lies, and this project has already shipped two of those (the
 * fusion counter that moved on plain bad JSON, BS-12; and the unreadable-line
 * counter that rose with the number of files, P-0009).
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

  recordRepaired(tool: string, callId: string, fragments: number): void {
    this.fused += 1
    this.repaired += 1
    this.emit({ kind: 'repaired', tool, callId, fragments })
  }

  /**
   * Book one bare-value reseal (P-0005).
   *
   * Not a fusion: exactly one call was intended, it kept its id, and its bytes
   * went out unchanged inside a JSON string. So it moves `resealed` only — never
   * `fused` ("a fusion was observed") and never `repaired` ("a fused call was
   * split"). The verdict reads it as a repair because a defect was seen and
   * fixed, and `quiet` would be a lie.
   */
  recordResealed(tool: string, callId: string, key: string): void {
    this.resealed += 1
    this.emit({ kind: 'resealed', tool, callId, key })
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
   *    `fragment-not-object`, `missing-id`, `missing-name`, `name-changed`. An
   *    unknown code lands here too: a code this build does not know is not
   *    assumed repairable.
   *  - `fused` + `refused` + `unrepaired` — `too-many-calls`: the input *was* a
   *    proven fusion shape, but our own `maxCalls` budget refused to split it.
   *    Booking `fused` without `unrepaired` would let `judgeRemedy` report
   *    "defect seen and repaired" for a stream that repaired nothing; dropping
   *    `fused` too would report "quiet" for a stream we just refused to fix.
   *    `degraded` is the only state that describes a proven fusion left
   *    unrepaired, which is exactly what `unrepaired` is defined to be.
   *  - `withdrawn` alone — `rolled-back`: a repair that was already proven is
   *    given back, so the run must not claim it. The abandoned proof itself is
   *    booked by `recordAbandoned`.
   *  - `withdrawn` plus the P-0002 pair — `consumer-abort`: the consumer stopped
   *    reading before any decision. With `fused > 0` and `unrepaired === 0`
   *    `judgeRemedy` would say "repaired"; with `fused === 0` it would say
   *    "quiet". Both are false for a buffered call that was never emitted.
   *
   * `truncated` never reaches this method: a cut stream is counted by
   * `recordTruncated()`, and a truncation withdrawal is not a failed repair.
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
   * Book a rescue that was proven for at least one candidate and then abandoned
   * because another candidate in the same stream could not be split.
   *
   * The proof existed, so this is a fusion; the calls were never dispatched, so
   * it is `unrepaired`. This is the only place `unrepaired` moves. The refused
   * candidate is booked separately by `recordRejected`, so the two counts name
   * two different candidates and never the same one twice.
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
