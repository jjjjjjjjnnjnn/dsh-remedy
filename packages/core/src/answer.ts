/**
 * P-0044 / P-0047 — did a turn answer the user?
 *
 * The census counts how a turn ended and never asked whether the user saw
 * anything: a `max-tokens` cut and a `completed` stop both look the same in the
 * transcript when the last step carried only `reasoning`. Pure functions, no I/O,
 * so the scanner and the evidence samplers share one rule. The measured shapes and
 * the reports are in docs/patches/P-0044-turn-answered.md and P-0047.
 */

/** The ending kinds the census knows. Anything else is not a question here. */
export const ENDINGS = ['completed', 'max_tokens', 'aborted', 'error'] as const

export type Ending = (typeof ENDINGS)[number]

/** `reason.kind` in the census's own spelling (`max-tokens` -> `max_tokens`). */
export function endingOf(kind: unknown): string {
  return kind === 'max-tokens' ? 'max_tokens' : String(kind)
}

/**
 * Does this assistant message's `content` show the user anything?
 *
 * A `tool-call` counts, because the turn continued and the step is visible in the
 * transcript. A `text` block counts only when it is not whitespace. A block type
 * this rule does not know does not count: an unknown block is not a reply.
 */
export function messageAnswers(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false
    const block = raw as Record<string, unknown>
    if (block.type === 'tool-call') return true
    return block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''
  })
}

/** One turn's last assistant step, as far as answering is concerned. */
export interface LastAnswer {
  readonly step: number
  readonly answered: boolean
}

/**
 * Fold one `assistant/message` event into the per-turn record.
 *
 * Only the last step of a turn decides: an earlier step that ran a tool call is
 * part of the same turn, and a turn whose final step says nothing said nothing.
 */
export function noteAssistantMessage(
  last: Map<string, LastAnswer>,
  turn: unknown,
  step: unknown,
  content: unknown,
): void {
  const key = String(turn)
  const at = typeof step === 'number' && Number.isFinite(step) ? step : 0
  const prior = last.get(key)
  if (prior !== undefined && at < prior.step) return
  last.set(key, { step: at, answered: messageAnswers(content) })
}

/**
 * Did this turn answer its user?
 *
 * A turn with no assistant message at all answered nothing, so a missing record
 * is `false` rather than unknown: the transcript is what the user sees.
 */
export function turnAnswered(last: ReadonlyMap<string, LastAnswer>, turn: unknown): boolean {
  return last.get(String(turn))?.answered === true
}
