/**
 * DSH loader entry for `dsh-remedy`.
 *
 * One seam, two listeners:
 *
 *   1. `llm/stream` (waterfall) — wraps the chunk stream and repairs a fused
 *      tool call before the agent loop assembles it (P-0001);
 *   2. `agent/request-error` (waterfall) — an opt-in retry for
 *      `MALFORMED_RESPONSE`, off by default. It is a stop-gap for deployments
 *      that cannot take the repair, not the fix.
 *
 * The plugin is resident but silent: no route, no tool, no writes unless
 * `journalPath` is configured. Its job is to make a known defect not happen,
 * not to add a surface.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PATCHES, redactValue } from 'dsh-remedy-core'
import { RemedyMonitor, repairStream, type RepairEvent } from './repair-stream.js'
import { makeFailureListener, RETRY_CACHE_LIMIT, type FailureListener } from './failure-listener.js'

export { makeFailureListener, RETRY_CACHE_LIMIT, type FailureListener }

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
 * `llm/stream` is a SYNCHRONOUS Cordis waterfall: the caller iterates the return
 * value immediately. Turning this listener into an `async` function wraps the
 * stream in a Promise and the agent loop fails with "stream is not async
 * iterable" — measured on a real headless run, not hypothesized. Wrap
 * synchronously; only re-enter through `.then` when `next()` itself was already
 * asynchronous.
 */
function wrapStream(stream: unknown, monitor: RemedyMonitor, maxCalls: number | undefined): unknown {
  if (isThenable(stream)) return stream.then((value) => wrapStream(value, monitor, maxCalls))
  if (!isAsyncIterable(stream)) return stream
  return repairStream(stream, monitor, { maxCalls })
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
        ctx.on('llm/stream', (_options, next) => wrapStream(next(), monitor, config.maxCalls)),
      )
    }

    // P-0011 + P-0013 share one listener: naming a failure and retrying it are
    // two decisions on the same dispatch, and a second listener would only pay
    // twice for it. Naming is always on; the retry budget defaults to 0.
    const retryMax = config.retryOnMalformed ?? 0
    disposers.push(
      ctx.on(
        'agent/request-error',
        makeFailureListener({
          retryMax,
          onRetry: (key) => monitor.recordRetry(key),
          onDiagnosis: (code, key) => monitor.recordDiagnosis(code, key),
          logger: ctx.logger,
        }),
      ),
    )

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
