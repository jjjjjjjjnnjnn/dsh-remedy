/** `llm/stream` chunk, event and option shapes; moved out of `repair-stream.ts` by the P-0005 seam split. Types erase, so this file costs no runtime bytes. */

import type { RemedyCounters } from 'dsh-remedy-core'

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
  | {
      readonly kind: 'repaired'
      readonly tool: string
      readonly callId: string
      readonly fragments: number
      /**
       * Fragments sent out under the fallback name because the declared tool's
       * schema did not accept their arguments (P-0027). Absent means every
       * fragment was dispatched under a proven name.
       */
      readonly unattributed?: number
    }
  | {
      readonly kind: 'resealed'
      readonly tool: string
      readonly callId: string
      /** The member key whose value was bare and is now a JSON string (P-0005). */
      readonly key: string
    }
  | {
      readonly kind: 'rejected'
      readonly tool: string
      readonly callId: string
      readonly code: string
      readonly detail: string
    }
  | { readonly kind: 'retry'; readonly detail: string }
  /** A class named and deliberately not repaired (P-0013): the code is the host's own. */
  | { readonly kind: 'diagnosis'; readonly code: string; readonly detail: string }
  | { readonly kind: 'stream'; readonly counters: RemedyCounters }

export interface RepairStreamOptions {
  /** Ceiling on calls synthesized across the whole stream. Default 8. */
  readonly maxCalls?: number
  /**
   * The tool declarations the request carried (`options.tools` on `llm/stream`).
   *
   * A fused text can glue two calls of different tools, and the stream carries
   * one name for that index; the surplus fragments therefore have no provable
   * name. With these declarations each fragment's arguments can be checked
   * against the named tool's own `required` list, which is the only evidence
   * available at this seam (P-0027).
   */
  readonly tools?: readonly ToolDeclaration[]
}

/** The slice of a tool declaration this seam needs; the host type is wider. */
export interface ToolDeclaration {
  readonly name: string
  readonly parameters?: {
    readonly required?: readonly string[]
    /** The host sends a full JSON Schema; nothing else is read here. */
    readonly [key: string]: unknown
  }
}

export interface OpenCall {
  id: string
  name: string
  text: string
}

export interface PendingBlock {
  /** What is emitted when the stream is not repaired as a whole. */
  readonly original: StreamChunk
  /** What is emitted when it is; `null` means "the original, unchanged". */
  readonly synthesized: readonly StreamChunk[] | null
  readonly repaired: { readonly tool: string; readonly callId: string; readonly fragments: number } | null
  /** A proven bare-value reseal (P-0005): one call, rewritten in place. */
  readonly resealed?: { readonly tool: string; readonly callId: string; readonly key: string }
  /** Calls this entry took from the stream-wide budget, returned if it is withdrawn. */
  readonly spent: number
}
