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

  if (counters.streams === 0) {
    reasons.push('no stream passed through the wrapper: the seam is not mounted')
    return { state: 'unmeasured', headline: 'no measurement', reasons }
  }
  if (counters.fused === 0) {
    reasons.push(`${counters.streams} stream(s) observed, no fused tool call`)
    if (counters.truncated > 0) reasons.push(`${counters.truncated} call(s) skipped as truncated`)
    return { state: 'quiet', headline: 'seam live, defect not seen', reasons }
  }
  if (counters.unrepaired > 0) {
    reasons.push(`${counters.fused} fused call(s), ${counters.unrepaired} could not be repaired`)
    reasons.push('the original failure was re-thrown, not swallowed')
    return { state: 'degraded', headline: 'repair incomplete', reasons }
  }
  reasons.push(`${counters.repaired}/${counters.fused} fused call(s) split into valid calls`)
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
  ].join(' ')
  return `remedy: ${verdict.state} — ${verdict.headline} (${counts})`
}
