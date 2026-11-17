/** P-0044/P-0047/P-0052 — did a turn answer, and did it end on a tool call? */

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

/** P-0052: a tool call in the last message. */
export function messageOnToolCall(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some(
    (raw) => raw !== null && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).type === 'tool-call',
  )
}

export interface LastAnswer {
  readonly step: number
  readonly answered: boolean
  readonly toolCall: boolean
}

/** Only the last step decides. */
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
  last.set(key, { step: at, answered: messageAnswers(content), toolCall: messageOnToolCall(content) })
}

/** A missing record answered nothing: `false`, not unknown. */
export function turnAnswered(last: ReadonlyMap<string, LastAnswer>, turn: unknown): boolean {
  return last.get(String(turn))?.answered === true
}

/** P-0052: the last step carried a tool call. */
export function turnOnToolCall(last: ReadonlyMap<string, LastAnswer>, turn: unknown): boolean {
  return last.get(String(turn))?.toolCall === true
}
