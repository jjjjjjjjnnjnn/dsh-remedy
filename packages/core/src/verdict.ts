/**
 * The verdict over what the patch actually did.
 *
 * A remedy plugin that says "ok" because it saw nothing is the exact failure
 * this project exists to avoid. `unmeasured` and `quiet` are different words on
 * purpose: one means the seam never ran, the other means it ran and the defect
 * did not appear.
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
  ].join(' ')
  return `remedy: ${verdict.state} — ${verdict.headline} (${counts})`
}
