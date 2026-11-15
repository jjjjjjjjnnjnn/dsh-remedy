/**
 * The verdict over what the patch actually did: `unmeasured` and `quiet` are
 * different words on purpose (the seam never ran / it ran and saw nothing).
 *
 * Each counter's own rule and why it was added live in `docs/patches/`:
 * `fused`/`refused`/`withdrawn` in P-0003, `resealed` in P-0005, `closed` in
 * P-0037, `diagnoses` in P-0013. The four states and their order are frozen: a
 * vocabulary change would invalidate every recorded artifact.
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
  /** One call that was one closing delimiter short and had it restored (P-0037).
   * In place like `resealed`: same id, same name, nothing synthesized. */
  readonly closed?: number
  /** Classes named but deliberately not repaired (P-0013). Never moves the verdict. */
  readonly diagnoses?: number
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
  const closed = counters.closed ?? 0

  if (counters.streams === 0) {
    reasons.push('no stream passed through the wrapper: the seam is not mounted')
    return { state: 'unmeasured', headline: 'no measurement', reasons }
  }
  if (counters.fused === 0 && resealed === 0 && closed === 0) {
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
  if (closed > 0) {
    reasons.push(`${closed} call(s) closed by restoring one dropped delimiter`)
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
    // P-0037: printed under the same rule — an older artifact must not grow a
    // field whose verdict its own build never judged.
    ...(counters.closed === undefined ? [] : [`closed=${counters.closed}`]),
  ].join(' ')
  return `remedy: ${verdict.state} — ${verdict.headline} (${counts})`
}
