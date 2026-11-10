/**
 * The verdict over what the patch actually did.
 *
 * A remedy plugin that says "ok" because it saw nothing is the exact failure
 * this project exists to avoid. `unmeasured` and `quiet` are different words on
 * purpose: one means the seam never ran, the other means it ran and the defect
 * did not appear.
 *
 * P-0003 adds two counters without touching the judgement. `fused` keeps its old
 * meaning — fusions actually seen — so a plain bad JSON argument can no longer
 * masquerade as a fusion (BS-12). The new counts are reported, not judged: the
 * four states and their order are unchanged on purpose, because a verdict
 * vocabulary change is a different seam and would invalidate every recorded
 * artifact.
 *
 * P-0005 adds a ninth counter, `resealed`, for the bare-value defect: one call
 * was intended and it was repaired in place, so it is neither a fusion nor a
 * refusal. The quiet guard had to widen to it — with `fused === 0` and
 * `resealed > 0` the seam *did* see and repair a defect, and reporting "quiet"
 * would be the same lie P-0003 removed from the refusal path. The four words
 * and their order are untouched.
 */

export interface RemedyCounters {
  /** Streams that passed through the wrapper. */
  readonly streams: number
  /** Fused tool calls detected. */
  readonly fused: number
  /** Fused calls that were split into valid calls. */
  readonly repaired: number
  /** Fused calls that could not be repaired and were re-thrown. */
  readonly unrepaired: number
  /** Calls skipped because the stream was truncated by `max-tokens`. */
  readonly truncated: number
  /** Streams that failed for a reason other than fusion. */
  readonly errors: number
  /**
   * Calls we refused to repair because the text was never proven to be a
   * fusion (P-0003): a plain bad JSON argument, a single object, a fragment
   * that does not parse, or a call with no id / no tool name. A refusal is not
   * evidence of fusion, so it must not move `fused`.
   */
  readonly refused: number
  /**
   * Repairs that were proven and then given back because a later block of the
   * same stream was rejected, or because the consumer stopped early (P-0003).
   * The original chunks went out instead, so nothing was silently kept.
   */
  readonly withdrawn: number
  /**
   * One tool call whose value was a bare, unquoted blob that was resealed as a
   * JSON string and dispatched with the model's own bytes (P-0005).
   *
   * This is a *different* defect from a fusion: exactly one call was intended
   * and it kept its identity, so it must not move `fused` or `repaired`.
   *
   * Optional on purpose: a counter object recorded by a 0.3.x build has no such
   * field, and judging it must stay byte-identical to how that build judged it.
   * Readers fold a missing value to zero, the same way `record_live_mount.mjs`
   * folds the fields P-0003 added.
   */
  readonly resealed?: number
}

export type RemedyState = 'unmeasured' | 'quiet' | 'repaired' | 'degraded'

export interface RemedyVerdict {
  readonly state: RemedyState
  readonly headline: string
  readonly reasons: readonly string[]
}

/** Judge a set of counters. Pure; the same numbers always give the same state. */
export function judgeRemedy(counters: RemedyCounters): RemedyVerdict {
  const reasons: string[] = []
  const resealed = counters.resealed ?? 0

  if (counters.streams === 0) {
    reasons.push('no stream passed through the wrapper: the seam is not mounted')
    return { state: 'unmeasured', headline: 'no measurement', reasons }
  }
  if (counters.fused === 0 && resealed === 0) {
    reasons.push(`${counters.streams} stream(s) observed, no fused tool call`)
    if (counters.truncated > 0) reasons.push(`${counters.truncated} call(s) skipped as truncated`)
    return { state: 'quiet', headline: 'seam live, defect not seen', reasons }
  }
  if (counters.unrepaired > 0) {
    reasons.push(`${counters.fused} fused call(s), ${counters.unrepaired} could not be repaired`)
    reasons.push('the original failure was re-thrown, not swallowed')
    return { state: 'degraded', headline: 'repair incomplete', reasons }
  }
  if (counters.fused > 0) {
    reasons.push(`${counters.repaired}/${counters.fused} fused call(s) split into valid calls`)
  }
  if (resealed > 0) {
    reasons.push(`${resealed} bare value(s) resealed into a JSON string`)
  }
  if (counters.truncated > 0) reasons.push(`${counters.truncated} call(s) skipped as truncated`)
  return { state: 'repaired', headline: 'defect seen and repaired', reasons }
}

/** One stable line for logs and the CLI. */
export function formatRemedyVerdict(verdict: RemedyVerdict, counters: RemedyCounters): string {
  const counts = [
    `streams=${counters.streams}`,
    `fused=${counters.fused}`,
    `repaired=${counters.repaired}`,
    `unrepaired=${counters.unrepaired}`,
    `truncated=${counters.truncated}`,
    `errors=${counters.errors}`,
    `refused=${counters.refused}`,
    `withdrawn=${counters.withdrawn}`,
    // P-0005: only printed when the build that produced the counters knows it,
    // so a 0.3.x artifact never grows a field its own verdict did not judge.
    ...(counters.resealed === undefined ? [] : [`resealed=${counters.resealed}`]),
  ].join(' ')
  return `remedy: ${verdict.state} — ${verdict.headline} (${counts})`
}
