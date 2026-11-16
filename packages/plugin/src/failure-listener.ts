/**
 * `agent/request-error` (P-0011 retry, P-0013 naming) and `agent/error` (P-0045
 * naming). The contract, the measured seam split and the shared key set are in
 * `docs/patches/P-0011-request-error-contract.md`, `P-0013-named-refusals.md` and
 * `P-0045-preparation-refusal-seam.md`; this file only implements them.
 */

export interface FailurePayload {
  readonly turn?: unknown
  readonly step?: unknown
  readonly failure?: { readonly code?: string; readonly message?: string }
  readonly signal?: { readonly aborted?: boolean }
}

/** `agent/error` carries the thrown error itself, not a `failure`. */
export interface AgentErrorPayload {
  readonly turn?: unknown
  readonly step?: unknown
  readonly error?: { readonly code?: string; readonly message?: string }
}

export interface FailureSink {
  warn?(message: string): void
  info?(message: string): void
}

/** Signals, not failures: retrying one burns a request and hides the message. */
const CONTROL_CODES = new Set(['IMAGE_OFFLOAD_REQUIRED', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL'])

/** Named once per `(turn, step, code)`, never retried: the answer would be the same. */
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

/** One key set for every seam that can report the same failed step. */
export interface DiagnosisNamer {
  name(code: string | undefined, key: string, message: string | undefined): void
  /** Tests read this to prove the set stays bounded. */
  size(): number
}

export function makeNamer(report: (code: string, key: string) => void, logger?: FailureSink): DiagnosisNamer {
  const named = new Set<string>()
  return {
    name(code, key, message) {
      if (typeof code !== 'string' || code === '' || !DIAGNOSED_CODES.has(code)) return
      const seen = `${key}:${code}`
      if (named.has(seen)) return
      named.add(seen)
      while (named.size > RETRY_CACHE_LIMIT) {
        const oldest = named.values().next()
        if (oldest.done === true) break
        named.delete(oldest.value)
      }
      report(code, key)
      logger?.warn?.(`remedy: ${code} at ${key}: ${String(message ?? '').slice(0, 200)}`)
    },
    size: () => named.size,
  }
}

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
  /** Called once per named diagnosis. Ignored when `namer` is supplied. */
  readonly onDiagnosis?: (code: string, key: string) => void
  /** The set both seams share, so one failure is named once. */
  readonly namer?: DiagnosisNamer
  readonly logger?: FailureSink
}

export function makeFailureListener(options: FailureHandlerOptions): FailureListener {
  const { retryMax, onRetry, logger } = options
  const namer = options.namer ?? makeNamer(options.onDiagnosis ?? (() => {}), logger)
  const budget = new Map<string, number>()

  const listener = async (payload: FailurePayload, next: () => unknown): Promise<unknown> => {
    const code = payload.failure?.code
    if (typeof code !== 'string' || code === '' || payload.signal?.aborted === true) return await next()
    const key = `${String(payload.turn)}:${String(payload.step)}`

    if (DIAGNOSED_CODES.has(code)) {
      namer.name(code, key, payload.failure?.message)
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

/** `agent/error` has no decision to return, so this only names. */
export function makeErrorNamer(namer: DiagnosisNamer): (payload: AgentErrorPayload) => void {
  return (payload) => namer.name(payload.error?.code, `${String(payload.turn)}:${String(payload.step)}`, payload.error?.message)
}
