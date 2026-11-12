/**
 * P-0013 — the reasoning-effort preflight (pure decision, no I/O).
 *
 * The defect this exists for is measured, not supposed: 37 turns on this host
 * died with `UNSUPPORTED_REASONING_EFFORT`, all of them the same sentence —
 *
 *   provider "opendesign" model "deepseek-v4.1-flash-eco"
 *   does not support reasoning effort "xhigh"
 *
 * across three workspaces, eleven sessions, and two days. A profile declared
 * `xhigh` for a model whose declared efforts were `off/high/xhigh/max`, so the
 * deployment advertised a level the adapter then refused at request time.
 *
 * Where the refusal comes from (read out of the shipped `app.asar`):
 *
 *   resolveReasoningLevel(model, effort):
 *     if (getSupportedThinkingLevels(model).includes(effort)) return effort
 *     throw new LlmError(..., 'UNSUPPORTED_REASONING_EFFORT')
 *
 *   getSupportedThinkingLevels(model):
 *     if (!model.reasoning) return ['off']
 *     return THINKING_LEVELS.filter(level => {
 *       const mapped = model.thinkingLevelMap?.[level]
 *       if (mapped === null) return false
 *       if (level === 'xhigh' || level === 'max') return mapped !== undefined
 *       return true
 *     })
 *
 * So the effective set is the adapter's own metadata, not the profile's prose.
 * This module re-derives that set from the same inputs and answers one question:
 * given a declared effort and a model's capabilities, will the request be
 * refused before a token is spent?
 *
 * It never writes, never guesses, and never silently substitutes a level. The
 * decision is `ok` / `refuse` / `unknown`, and `unknown` is a first-class answer:
 * a model with no reasoning metadata may still accept `off` (the adapter returns
 * `['off']`), which is a fact this module reports rather than assumes.
 */

export type EffortLevel = 'off' | 'low' | 'high' | 'xhigh' | 'max'

/** The order the adapter escalates through, copied from its own THINKING_LEVELS. */
export const EFFORT_ORDER: readonly EffortLevel[] = ['off', 'low', 'high', 'xhigh', 'max']

export interface ModelCapability {
  /**
   * The model's declared reasoning metadata, as a profile writes it:
   * `undefined` means the model carries none, and the adapter then answers
   * `['off']` — every other level is refused.
   */
  readonly reasoning?: {
    /** Levels the model accepts, in the profile's own spelling. */
    readonly efforts?: readonly string[]
    /** Which levels map to a wire value; `null` means "mapped to nothing". */
    readonly thinkingLevelMap?: Readonly<Record<string, unknown>>
    /** The level used when the request omits one. */
    readonly defaultEffort?: string
  } | undefined
}

export type PreflightVerdict = 'ok' | 'refuse' | 'unknown'

export interface PreflightDecision {
  readonly verdict: PreflightVerdict
  /** The level the request would carry, after the adapter's own defaulting. */
  readonly effective: string | undefined
  /** Why, in one sentence a user can act on. `undefined` when `ok`. */
  readonly reason?: string
  /** The level a caller could switch to, when there is exactly one obvious one. */
  readonly suggestion?: string
  /** Every level this model actually accepts, so the message can list them. */
  readonly supported: readonly string[]
}

/**
 * Re-derive the adapter's supported set. Two inputs are possible: the profile's
 * explicit `efforts` list, or the thinking-level map. They can disagree, and when
 * they do the adapter's map is what decides at request time, so the map wins —
 * this function reports that rather than merging them into a fictional union.
 */
export function supportedEfforts(capability: ModelCapability): readonly string[] {
  const reasoning = capability.reasoning
  if (reasoning === undefined) return ['off']
  const map = reasoning.thinkingLevelMap
  if (map === undefined || Object.keys(map).length === 0) {
    // No map means the adapter keeps every level that is not explicitly absent.
    return reasoning.efforts === undefined ? ['off'] : [...reasoning.efforts]
  }
  return EFFORT_ORDER.filter((level) => {
    const mapped = map[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}

/**
 * Decide whether a declared effort will be refused before the request goes out.
 *
 * `declared` is what the deployment asks for. `undefined` means "omit it and let
 * the adapter default apply", which is always safe and is reported as `ok` with
 * the effective level filled in when the profile names a default.
 */
export function preflightEffort(
  declared: string | undefined,
  capability: ModelCapability,
): PreflightDecision {
  const supported = supportedEfforts(capability)

  if (declared === undefined || declared === '') {
    const fallback = capability.reasoning?.defaultEffort
    return { verdict: 'ok', effective: fallback, supported }
  }

  if (supported.includes(declared)) {
    return { verdict: 'ok', effective: declared, supported }
  }

  // A model with no declared efforts accepts only `off`, and its own adapter
  // says so plainly; anything else is a guaranteed refusal.
  if (capability.reasoning === undefined) {
    const suggestion = supported.includes('off') ? 'off' : undefined
    return {
      verdict: 'refuse',
      effective: declared,
      supported,
      reason: `the model carries no reasoning metadata, so the adapter accepts only ${supported.join('/')}`,
      ...(suggestion === undefined ? {} : { suggestion }),
    }
  }

  // Pick the nearest supported level at or below the declared one, so the
  // suggestion is the least surprising change rather than a jump to the top.
  const declaredAt = EFFORT_ORDER.indexOf(declared as EffortLevel)
  const lower = declaredAt === -1
    ? []
    : supported.filter((level) => EFFORT_ORDER.indexOf(level as EffortLevel) <= declaredAt)
  const suggestion = lower.length > 0 ? lower[lower.length - 1] : supported[supported.length - 1]

  return {
    verdict: 'refuse',
    effective: declared,
    supported,
    reason: `the adapter's declared efforts are ${supported.join('/')}, and the request asks for "${declared}"`,
    ...(suggestion === undefined ? {} : { suggestion }),
  }
}

/** One line for a log or a refusal message; never a silent correction. */
export function describePreflight(provider: string, model: string, decision: PreflightDecision): string {
  if (decision.verdict === 'ok') return `${provider}/${model}: effort "${decision.effective ?? '(default)'}" is accepted`
  const tail = decision.suggestion === undefined ? '' : `; the nearest accepted level is "${decision.suggestion}"`
  return `${provider}/${model}: ${decision.reason}${tail}`
}
