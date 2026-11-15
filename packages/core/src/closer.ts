/**
 * P-0037 — restore one dropped closing delimiter, only when it is the only way to
 * parse. Rule and negative controls: `docs/patches/P-0037-missing-closer.md`.
 *
 * End-of-text is never a site (a cut tail looks the same as a missing final
 * closer), and exactly one interior (site, delimiter) pair may parse. The result
 * is the original text plus one character, never a re-serialisation.
 */

const MAX_BYTES = 32768
const MAX_SITES = 1024

export type CloserRejectionCode = 'closer-ambiguous' | 'closer-unproven'

export interface CloserAccepted {
  readonly status: 'closed'
  readonly at: number
  readonly delimiter: ']' | '}'
  readonly text: string
}

export interface CloserRefused {
  readonly status: 'refused'
  readonly code: CloserRejectionCode
  readonly detail: string
}

export type CloserResult = CloserAccepted | CloserRefused

const no = (code: CloserRejectionCode, detail: string): CloserRefused => ({ status: 'refused', code, detail })

function plain(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  } catch {
    return false
  }
}

/** Restore one dropped closer, or refuse. */
export function closeMissingDelimiter(text: string, options: { readonly truncated?: boolean } = {}): CloserResult {
  if (options.truncated === true) return no('closer-unproven', 'a cut text is not a missing closer')
  if (text.length > MAX_BYTES) return no('closer-unproven', `${text.length} bytes is beyond the ${MAX_BYTES} window`)
  if (plain(text)) return no('closer-unproven', 'the text already parses')

  const found: Array<{ at: number; delimiter: ']' | '}'; text: string }> = []
  let inString = false
  let escaped = false
  let sites = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch !== '}' && ch !== ']') continue
    sites += 1
    if (sites > MAX_SITES) return no('closer-unproven', `${sites} sites exceeds the ${MAX_SITES} window`)
    for (const delimiter of [']', '}'] as const) {
      const rebuilt = `${text.slice(0, i)}${delimiter}${text.slice(i)}`
      if (plain(rebuilt)) found.push({ at: i, delimiter, text: rebuilt })
    }
  }
  if (inString) return no('closer-unproven', 'the text ends inside a string')

  if (found.length === 0) return no('closer-unproven', `none of ${sites} sites yields one plain object`)
  if (found.length > 1) {
    return no('closer-ambiguous', `${found.length} sites parse (${found.map((one) => `${one.delimiter}@${one.at}`).join(', ')})`)
  }
  const only = found[0]
  if (only === undefined) return no('closer-unproven', 'no candidate survived the proof')
  if (`${only.text.slice(0, only.at)}${only.text.slice(only.at + 1)}` !== text) return no('closer-unproven', 'not the original plus one')
  return { status: 'closed', at: only.at, delimiter: only.delimiter, text: only.text }
}
