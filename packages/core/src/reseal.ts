/**
 * Tool-call argument resealing (P-0005).
 *
 * One question: a single-object argument text that does not parse — is there
 * exactly one place where the model emitted a *bare, unquoted blob* as a JSON
 * value, such that quoting that one segment turns the whole text into one
 * plain object whose payload is byte-for-byte what the model wrote?
 *
 * That is the only shape this module will touch. It is the failure the model
 * produces when it hands a code block to `run_code`: it writes the program
 * after `"code": ` and forgets the quotes, and JSON reports
 * `Unexpected token 'c'`. Quoting it back is not a guess about intent — the
 * segmentation is proven by the fact that exactly one candidate parses.
 *
 * SAFETY PROPERTIES (each one has a negative-control test):
 *  - a text that already parses is never resealed (the caller checks that first);
 *  - a fusion (two or more top-level objects) is never resealed: that is a split;
 *  - the raw segment must span more than one line, so a mistyped enum or a
 *    truncated literal is refused rather than silently quoted;
 *  - exactly one candidate must parse, otherwise the shape is ambiguous and the
 *    text is refused — two possible resealings is the same as none;
 *  - the value is inserted with `JSON.stringify`, so every byte the model wrote
 *    survives into the parsed payload; nothing is trimmed or re-wrapped;
 *  - a `max-tokens` truncation is never resealed (the tail is cut, not malformed);
 *  - the search is bounded: a very long text with many member heads or commas
 *    is refused instead of scanned quadratically.
 */

const MAX_BYTES = 65536
const MAX_HEADS = 8
const MAX_COMMAS = 256
/** A bare value shorter than this is a token, not a blob: never reseal it. */
const MIN_RAW_LENGTH = 2

export type ResealRejectionCode = 'ambiguous-bare-value' | 'bare-value-unproven'

export interface ResealAccepted {
  readonly status: 'resealed'
  /** The member key whose value was bare. */
  readonly key: string
  /** The raw bytes the model wrote, unmodified. */
  readonly value: string
  /** The whole argument text, resealed and proven to parse. */
  readonly text: string
}

export interface ResealRefused {
  readonly status: 'refused'
  readonly code: ResealRejectionCode
  readonly detail: string
}

export type ResealResult = ResealAccepted | ResealRefused

interface Candidate {
  readonly key: string
  readonly valueStart: number
  readonly commaAt: number
  readonly raw: string
}

const MEMBER_HEAD = /"([^"\\]{1,120})"[ \t]*:[ \t]*/g
const COMMA = /,[ \t]/g

function refused(code: ResealRejectionCode, detail: string): ResealRefused {
  return { status: 'refused', code, detail }
}

/** A value position that could not have been a legal JSON value. */
function couldBeBareBlob(raw: string): boolean {
  if (raw.length < MIN_RAW_LENGTH) return false
  if (!raw.includes('\n')) return false
  const first = raw.trimStart()[0] ?? ''
  if (first === '"' || first === '{' || first === '[' || first === ']' || first === '}' || first === ',') return false
  if (first === '-' || (first >= '0' && first <= '9')) return false
  const head = raw.trimStart().slice(0, 5)
  if (head.startsWith('true') || head.startsWith('false') || head.startsWith('null')) return false
  return true
}

/**
 * Reseal one bare value.
 *
 * @param text - the argument text that already failed to parse.
 * @param options - `truncated` when the stream ended on the token ceiling.
 */
export function resealToolCallArguments(text: string, options: { readonly truncated?: boolean } = {}): ResealResult {
  if (options.truncated === true) {
    return refused('bare-value-unproven', 'finish reason is length: a cut text is not a bare value')
  }
  if (text.length > MAX_BYTES) {
    return refused('bare-value-unproven', `the argument text is ${text.length} bytes, above the ${MAX_BYTES} byte reseal window`)
  }

  const heads = [...text.matchAll(MEMBER_HEAD)]
  if (heads.length > MAX_HEADS) {
    return refused('ambiguous-bare-value', `${heads.length} member heads is beyond the ${MAX_HEADS} head search window`)
  }
  const commas = [...text.matchAll(COMMA)]
  if (commas.length > MAX_COMMAS) {
    return refused('ambiguous-bare-value', `${commas.length} commas is beyond the ${MAX_COMMAS} comma search window`)
  }

  const candidates: Candidate[] = []
  let sawBlobShape = false
  for (const head of heads) {
    const valueStart = (head.index ?? 0) + head[0].length
    for (const comma of commas) {
      const commaAt = comma.index ?? 0
      if (commaAt <= valueStart) continue
      const raw = text.slice(valueStart, commaAt)
      if (!couldBeBareBlob(raw)) continue
      sawBlobShape = true
      const rebuilt = `${text.slice(0, valueStart)}${JSON.stringify(raw)}${text.slice(commaAt)}`
      let parsed: unknown
      try {
        parsed = JSON.parse(rebuilt)
      } catch {
        continue
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const key = head[1]
      if (key === undefined) continue
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value !== 'string' || value !== raw) continue
      candidates.push({ key, valueStart, commaAt, raw })
    }
  }

  if (candidates.length === 0) {
    return refused(
      'bare-value-unproven',
      sawBlobShape
        ? 'a bare multi-line value was seen, but quoting it does not yield one plain object'
        : 'no bare multi-line value was found in the argument text',
    )
  }
  if (candidates.length > 1) {
    return refused(
      'ambiguous-bare-value',
      `${candidates.length} different segments each reseal into a valid object (keys: ${[...new Set(candidates.map((one) => one.key))].join(', ')})`,
    )
  }

  const only = candidates[0]
  if (only === undefined) return refused('bare-value-unproven', 'no candidate survived the proof')
  const rebuilt = `${text.slice(0, only.valueStart)}${JSON.stringify(only.raw)}${text.slice(only.commaAt)}`
  // Prove the rebuilt text once more at the point of use: the value must parse
  // back to the exact bytes the model wrote, or nothing is returned.
  let parsed: unknown
  try {
    parsed = JSON.parse(rebuilt)
  } catch {
    return refused('bare-value-unproven', 'the rebuilt text did not parse on the second proof')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return refused('bare-value-unproven', 'the rebuilt text is not a plain object')
  }
  if ((parsed as Record<string, unknown>)[only.key] !== only.raw) {
    return refused('bare-value-unproven', 'the resealed value does not round-trip to the original bytes')
  }

  return { status: 'resealed', key: only.key, value: only.raw, text: rebuilt }
}
