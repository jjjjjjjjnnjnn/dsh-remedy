/**
 * The `agent/request-error` listener (P-0011) and the failure namer (P-0013).
 *
 * Two jobs on one seam, because a second listener would only pay twice for the
 * same dispatch:
 *
 *   1. **name** every failure class this plugin knows how to diagnose, including
 *      the ones it must never retry. Before this, `UNSUPPORTED_REASONING_EFFORT`
 *      was counted by `scan` but invisible to the resident layer: 37 turns on
 *      this host died on a profile field, and nothing in the journal said so.
 *   2. **retry** `MALFORMED_RESPONSE` within an explicit, bounded budget — the
 *      same shape the community guard proved on ten release rows.
 *
 * Upstream's own contract, quoted from the shipped runtime documentation: a
 * handling listener returns `{ kind: 'retry' }` *without* calling `next()`, and
 * an unowned decision must return `next()`. So decide in that order: speak only
 * when the decision is ours, hand everything else back. Calling `next()` first
 * and then overriding the answer — what 0.3.7 did — discards the default chain,
 * and context compaction authorizes its own retry on that path.
 */

export interface FailurePayload {
  readonly turn?: unknown
  readonly step?: unknown
  readonly failure?: { readonly code?: string; readonly message?: string }
  readonly signal?: { readonly aborted?: boolean }
}

export interface FailureSink {
  warn?(message: string): void
  info?(message: string): void
}

/** Signals, not failures: retrying one burns a request and hides the message. */
const CONTROL_CODES = new Set(['IMAGE_OFFLOAD_REQUIRED', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL'])

/**
 * Classes worth a named line in the journal. Each one is a real defect measured
 * on this host (`data/results/scan-full-*.json`), not a guess: a configuration
 * refusal, a request the provider rejected outright, and a turn that produced
 * nothing. They are named, never retried — a retry of a deterministic refusal
 * spends a request to learn the same answer twice.
 */
const DIAGNOSED_CODES = new Set([
  'UNSUPPORTED_REASONING_EFFORT',
  'INVALID_REQUEST',
  'MISSING_CREDENTIAL',
  'EMPTY_RESPONSE',
])

/** Only this code is retried; SERVER/TRANSPORT/TIMEOUT already self-heal upstream. */
const RETRYABLE = 'MALFORMED_RESPONSE'

/** A resident process must not keep one entry per step forever. */
export const RETRY_CACHE_LIMIT = 256

export interface FailureListener {
  (payload: FailurePayload, next: () => unknown): Promise<unknown>
  /** Exposed so a test proves the cache is bounded instead of assuming it. */
  cacheSize(): number
}

export interface FailureHandlerOptions {
  /** Retries allowed per turn-and-step. `0` keeps the retry path off. */
  readonly retryMax: number
  /** Called once per retried attempt, with the `turn:step` key. */
  readonly onRetry: (key: string) => void
  /** Called once per named diagnosis, with the code and the key. */
  readonly onDiagnosis: (code: string, key: string) => void
  /** The preceding `next()` is not consulted when this listener owns the decision. */
  readonly logger?: FailureSink
}

export function makeFailureListener(options: FailureHandlerOptions): FailureListener {
  const { retryMax, onRetry, onDiagnosis, logger } = options
  const budget = new Map<string, number>()
  const named = new Set<string>()

  const listener = async (payload: FailurePayload, next: () => unknown): Promise<unknown> => {
    const code = payload.failure?.code
    if (typeof code !== 'string' || code === '' || payload.signal?.aborted === true) return await next()

    const key = `${String(payload.turn)}:${String(payload.step)}`

    if (DIAGNOSED_CODES.has(code)) {
      // Name it once per (step, code): a host-level retry of the same failure
      // would otherwise fill the journal with the same sentence — the "unreadable
      // noise" defect this project already fixed once in `scan` — while a
      // different code on the same step is a genuinely different fact.
      const seenKey = `${key}:${code}`
      if (!named.has(seenKey)) {
        named.add(seenKey)
        while (named.size > RETRY_CACHE_LIMIT) {
          const oldest = named.values().next()
          if (oldest.done === true) break
          named.delete(oldest.value)
        }
        onDiagnosis(code, key)
        logger?.warn?.(`remedy: ${code} at ${key}: ${String(payload.failure?.message ?? '').slice(0, 200)}`)
      }
      return await next()
    }

    if (code !== RETRYABLE || CONTROL_CODES.has(code) || retryMax <= 0) return await next()

    const used = budget.get(key) ?? 0
    if (used >= retryMax) return await next()
    budget.delete(key)
    budget.set(key, used + 1)
    while (budget.size > RETRY_CACHE_LIMIT) {
      const oldest = budget.keys().next()
      if (oldest.done === true) break
      budget.delete(oldest.value)
    }

    onRetry(key)
    logger?.warn?.(`remedy: retry ${used + 1}/${retryMax} for ${key} after ${RETRYABLE}`)
    return { kind: 'retry' }
  }
  ;(listener as FailureListener).cacheSize = () => budget.size
  return listener as FailureListener
}
