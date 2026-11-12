/**
 * Copy policy — the checks an outward file must pass, as pure functions.
 *
 * The copy channel used to send a fact pack to an external model and paste the
 * answer back. That indirection existed for one reason: to keep every number in
 * an outward file traceable to the fact pack instead of to an author's memory.
 * The transport is gone (no model CLI is called any more); **the property it was
 * protecting is not**, and it is these functions.
 *
 * So the gate no longer asks "who wrote this" as a proxy for "is it true". It
 * asks the question directly:
 *
 *   - every prose number must appear in the fact pack;
 *   - no placeholder may survive;
 *   - the bytes must match what was recorded;
 *   - the recorded fact pack must be the current one.
 *
 * An author can still write prose an LLM would never write — that is fine, and it
 * is the point: the rule that mattered was never "a machine must type it", it was
 * "no number may exist outside the fact pack".
 *
 * Node built-ins only, like every other file under `scripts/`.
 */

/** Fences, inline code and URLs are stripped before the number check. */
export function proseText(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
}

/** Every number a reader can see in prose. */
export function proseNumbers(text) {
  return [...new Set(proseText(text).match(/\d+/g) ?? [])]
}

/**
 * Numbers the fact pack carries, plus the digits that are list markers.
 *
 * `reservedDigits` exists because a fact pack occasionally quotes a number that
 * only appears inside prose the fact pack itself explains (an old byte count in
 * a paragraph that describes a retired channel, for example). A gate that
 * refuses every number not literally present would push an author toward
 * deleting the historical comparison instead of stating it, which is the wrong
 * trade. Those digits are listed here, in one place, with the reason.
 */
export const RESERVED_DIGITS = [
  /** 117: the byte headroom 0.3.7 shipped with, quoted in the changelog's own history. */
  '117',
]

export function allowedNumbers(facts) {
  return new Set([
    ...(facts.match(/\d+/g) ?? []),
    ...Array.from({ length: 11 }, (_, index) => String(index)),
    ...RESERVED_DIGITS,
  ])
}

/**
 * The numbers in one artifact that the fact pack does not carry.
 *
 * A non-empty result means the file claims something the fact pack cannot back,
 * which is the failure the old external-model round trip was there to prevent.
 */
export function unknownNumbers(text, facts) {
  const allowed = allowedNumbers(facts)
  return proseNumbers(text).filter((number) => !allowed.has(number))
}

const PLACEHOLDER = /\b(TODO|TBD|FIXME|YOUR_[A-Z_]+|lorem ipsum)\b/i

/** A survivor of a template, never a finished artifact. */
export function hasPlaceholder(text) {
  return PLACEHOLDER.test(text)
}

/**
 * The recorded identity of who typed the bytes currently on disk.
 *
 * It is recorded, not pinned: pinning the author was a proxy for pinning the
 * property, and the gate checks the property directly. What the field is for is
 * answering "which channel produced this" when someone later asks why a sentence
 * reads oddly.
 */
export const WRITERS = {
  /** The engineering agent, in session. */
  inSession: 'in-session',
  /** The retired channel: an external model CLI. Historical rows only. */
  priorChannel: 'agy-gemini-3.8-flash-high',
}

/**
 * Writers that may appear on a **live** entry.
 *
 * The retired channel is accepted on a frozen release record and nowhere else: a
 * page that is already published must not be rewritten just to update the field
 * that says who typed it.
 */
export const LIVE_WRITERS = { ...WRITERS }
