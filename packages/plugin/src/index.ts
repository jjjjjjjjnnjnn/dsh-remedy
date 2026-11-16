/**
 * DSH loader entry for `dsh-remedy`.
 *
 * Three listeners:
 *  - `llm/stream` (waterfall): repair a fused call before the loop assembles it (P-0001);
 *  - `agent/request-error` (waterfall): the retry for MALFORMED_RESPONSE, and the
 *    namer for refusals that reach it (P-0011, P-0013);
 *  - `agent/error` (emit): the seam a preparation refusal reaches; names only (P-0045).
 *
 * Resident but silent: no route, no tool, no writes unless `journalPath` is set.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PATCHES, redactValue } from 'dsh-remedy-core'
import { RemedyMonitor, repairStream, type RepairEvent, type ToolDeclaration } from './repair-stream.js'
import {
  makeErrorNamer,
  makeFailureListener,
  makeNamer,
  RETRY_CACHE_LIMIT,
  type AgentErrorPayload,
  type DiagnosisNamer,
  type FailureListener,
} from './failure-listener.js'

export { makeFailureListener, makeNamer, RETRY_CACHE_LIMIT, type DiagnosisNamer, type FailureListener }

export interface RemedyLogger {
  info?(message: string): void
  warn?(message: string): void
}

export interface RequestErrorPayload {
  readonly turn?: unknown
  readonly step?: unknown
  readonly failure?: { readonly code?: string; readonly message?: string }
  /** Present on a live payload; a cancelled step must not be retried. */
  readonly signal?: { readonly aborted?: boolean }
  /** Present on a live payload; the preparation's policy, which this plugin ignores. */
  readonly retryPolicy?: unknown
}

/** The narrow slice of the Cordis context this plugin uses. */
export interface RemedyContext {
  on(event: 'llm/stream', listener: (options: unknown, next: () => unknown) => unknown): () => void
  on(
    event: 'agent/request-error',
    listener: (payload: RequestErrorPayload, next: () => unknown) => unknown,
  ): () => void
  /**
   * P-0045: the seam a preparation-time refusal actually reaches. `agent/error`
   * is emitted by the loop's own `throwError` and carries the thrown error; it
   * has no decision, so a listener can only observe.
   */
  on(event: 'agent/error', listener: (payload: AgentErrorPayload) => void): () => void
  readonly logger?: RemedyLogger
  effect?(execute: () => () => void, label?: string): unknown
}

export interface RemedyConfig {
  /** Repair fused tool calls. Default true. */
  readonly repair?: boolean
  /** Retries after `MALFORMED_RESPONSE` per step. Default 0 (off). */
  readonly retryOnMalformed?: number
  /** Ceiling on calls synthesized from one fused block. Default 8. */
  readonly maxCalls?: number
  /** Append redacted repair events as JSONL. Default off (no writes). */
  readonly journalPath?: string
  /** Log a mount line. Default true. */
  readonly log?: boolean
}

export const name = 'remedy'

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

/**
 * `llm/stream` is a SYNCHRONOUS Cordis waterfall: the caller iterates the return value
 * immediately. Making this listener `async` wraps the stream in a Promise and the agent
 * loop fails with "stream is not async iterable" — measured on a real headless run. Wrap
 * synchronously; re-enter through `.then` only when `next()` was already asynchronous.
 */
function wrapStream(
  stream: unknown,
  monitor: RemedyMonitor,
  maxCalls: number | undefined,
  tools: readonly ToolDeclaration[] | undefined,
): unknown {
  if (isThenable(stream)) return stream.then((value) => wrapStream(value, monitor, maxCalls, tools))
  if (!isAsyncIterable(stream)) return stream
  return repairStream(stream, monitor, { maxCalls, tools })
}

/** The declarations the request carried; without them every name is unproven. */
function toolsOf(options: unknown): readonly ToolDeclaration[] | undefined {
  const tools = (options as { tools?: unknown } | null)?.tools
  return Array.isArray(tools) ? (tools as ToolDeclaration[]) : undefined
}

function journalWriter(
  path: string,
  logger: RemedyLogger | undefined,
  monitor: RemedyMonitor,
): (event: RepairEvent) => void {
  let ready = false
  return (event) => {
    try {
      if (!ready) {
        mkdirSync(dirname(path), { recursive: true })
        ready = true
      }
      const redacted = redactValue(event).value
      const line = JSON.stringify({
        at: new Date().toISOString(),
        ...(redacted as object),
        counters: monitor.counters(),
      })
      appendFileSync(path, `${line}\n`, 'utf8')
    } catch (error) {
      logger?.warn?.(`remedy: journal write failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function mount(ctx: RemedyContext, config: RemedyConfig, monitor: RemedyMonitor): void {
  if (config.journalPath !== undefined && config.journalPath !== '') {
    monitor.onEvent(journalWriter(config.journalPath, ctx.logger, monitor))
  }

  const register = (): (() => void) => {
    const disposers: Array<() => void> = []

    if (config.repair !== false) {
      disposers.push(
        ctx.on('llm/stream', (options, next) => wrapStream(next(), monitor, config.maxCalls, toolsOf(options))),
      )
    }

    // P-0011 + P-0013 + P-0045 share one namer and two seams: a stream that fails
    // after it started reaches `agent/request-error` (where a retry is a legal
    // decision); a call refused during preparation reaches only `agent/error`
    // (where naming is all that is possible). One set of `(turn, step, code)` keys
    // means a failure both seams see is named once.
    const retryMax = config.retryOnMalformed ?? 0
    const namer = makeNamer((code, key) => monitor.recordDiagnosis(code, key), ctx.logger)
    disposers.push(
      ctx.on(
        'agent/request-error',
        makeFailureListener({
          retryMax,
          onRetry: (key) => monitor.recordRetry(key),
          namer,
          logger: ctx.logger,
        }),
      ),
    )
    disposers.push(ctx.on('agent/error', makeErrorNamer(namer)))

    return () => {
      for (const dispose of disposers) dispose()
    }
  }

  if (typeof ctx.effect === 'function') ctx.effect(register, 'remedy')
  else register()

  if (config.log !== false) {
    ctx.logger?.info?.(`remedy: mounted (${PATCHES.map((patch) => `${patch.id}:${patch.status}`).join(', ')})`)
  }
}

export function apply(ctx: RemedyContext, config: RemedyConfig = {}): void {
  mount(ctx, config, new RemedyMonitor())
}

export interface RemedyInstance {
  readonly plugin: { readonly name: string; readonly apply: (ctx: RemedyContext, config?: RemedyConfig) => void }
  readonly monitor: RemedyMonitor
}

/** A plugin bound to one observable monitor, for tests and embedding. */
export function createRemedy(): RemedyInstance {
  const monitor = new RemedyMonitor()
  return {
    plugin: { name, apply: (ctx, config = {}) => mount(ctx, config, monitor) },
    monitor,
  }
}

const plugin = { name, apply }

export default plugin

export { RemedyMonitor, repairStream }
export { decompressSessionLog } from './session-log.js'
export type { RepairEvent, StreamChunk, FinishChunk, RepairStreamOptions } from './repair-stream.js'
