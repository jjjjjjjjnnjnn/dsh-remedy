/** P-0044 / P-0047 — did a turn answer the user? One rule, shared by every reader. */

/** The ending kinds the census knows; anything else is not a question here. */
export const ENDINGS = ['completed', 'max_tokens', 'aborted', 'error'] as const

export type Ending = (typeof ENDINGS)[number]

/** `reason.kind` in the census's own spelling (`max-tokens` -> `max_tokens`). */
export function endingOf(kind: unknown): string {
  return kind === 'max-tokens' ? 'max_tokens' : String(kind)
}

/** A `tool-call` answers, a non-blank `text` answers, an unknown block does not. */
export function messageAnswers(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false
    const block = raw as Record<string, unknown>
    if (block.type === 'tool-call') return true
    return block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''
  })
}

export interface LastAnswer {
  readonly step: number
  readonly answered: boolean
}

/** Only the last step of a turn decides; an earlier step never overwrites it. */
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

/** No assistant message at all answered nothing: a missing record is `false`, not unknown. */
export function turnAnswered(last: ReadonlyMap<string, LastAnswer>, turn: unknown): boolean {
  return last.get(String(turn))?.answered === true
}
