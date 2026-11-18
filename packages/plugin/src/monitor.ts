/**
 * The counter ledger (P-0012 split). Every counter has one meaning; these docs are the contract.
 * A counter that cannot say why it moved lies (BS-12).
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
  private closed = 0
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

  /** Book one in-place rewrite: `resealed` (P-0005) or `closed` (P-0037), never a fusion. */
  recordInPlace(tool: string, callId: string, detail: string, closed: boolean): void {
    if (closed) this.closed += 1
    else this.resealed += 1
    this.emit({ kind: closed ? 'closed' : 'resealed', tool, callId, key: detail } as RepairEvent)
  }

  /** Book one refusal (P-0003 / BS-12). The bucket table is in `docs/patches/P-0003-refusal-observability.md`. */
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

  /** Book an all-or-nothing rescue: `fused` + `unrepaired` (the only mover); the refused candidate is booked separately. */
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

  /** Name a failure this plugin can diagnose but must not repair (P-0013). Never moves the verdict. */
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
      closed: this.closed,
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
