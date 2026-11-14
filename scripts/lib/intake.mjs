/**
 * Intake bookkeeping, kept pure so a test can hold it to one rule:
 * **a source that could not be read is never recorded as zero.**
 *
 * The intake artifact is evidence, and `data/results/` only accepts script
 * output. The one thing that must not be possible is a run that failed to reach
 * a source and wrote `count: 0`, which reads as "nothing there" instead of
 * "nobody looked". Every failure path here produces `ok: false`, `counts: null`
 * and a reason.
 */

/** One source that answered. */
export function okSource(id, counts, detail = {}) {
  return { id, ok: true, counts, detail, unreadable_reason: null }
}

/** One source that did not answer, with the reason it did not. */
export function unreadableSource(id, reason, detail = {}) {
  return { id, ok: false, counts: null, detail, unreadable_reason: String(reason) }
}

/** The whole run: what answered, what did not, and what that means. */
export function summarize(sources) {
  const answered = sources.filter((source) => source.ok).length
  const unreadable = sources.filter((source) => !source.ok).map((source) => source.id)
  return {
    sources,
    answered,
    unreadable,
    complete: unreadable.length === 0,
    note:
      unreadable.length === 0
        ? 'every registered source answered'
        : `${unreadable.length} source(s) could not be read: ${unreadable.join(', ')}; their counts are null, not zero`,
  }
}

/** Candidate rows a later hand edit may append to `leads.md`; never statuses. */
export function candidatesFromDiscussions(nodes) {
  return (nodes ?? [])
    .filter((node) => typeof node?.number === 'number' && typeof node?.url === 'string')
    .map((node) => ({
      number: node.number,
      title: String(node.title ?? ''),
      url: node.url,
      updatedAt: String(node.updatedAt ?? ''),
    }))
}

/** Which candidates are already in the ledger, by discussion number. */
export function knownNumbers(leadsText) {
  const numbers = new Set()
  for (const match of String(leadsText).matchAll(/discussions\/(\d+)/g)) numbers.add(Number(match[1]))
  return numbers
}
