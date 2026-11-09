/**
 * Split a text that contains several concatenated top-level JSON objects.
 *
 * WHY THIS EXISTS (P-0001): the DeepSeek relay sometimes streams two tool calls
 * into one index, so the adapter hands the assembler `{"a":1}{"b":2}`. That is
 * not valid JSON, `parseToolCallArguments` throws `MALFORMED_RESPONSE`, and the
 * whole turn stops. The objects themselves are well-formed — only the boundary
 * is missing. This scanner finds the boundaries without ever splitting inside a
 * string, so `{"text":"}{"}{"b":2}` still yields exactly two objects.
 *
 * The scanner is deliberately strict: anything that is not `{...}` at depth 0
 * is reported as a failure instead of being skipped. A repair engine that
 * guesses is worse than one that refuses.
 */

export type SplitFailureCode =
  | 'empty'
  | 'not-an-object'
  | 'unterminated-string'
  | 'unbalanced'

export interface SplitSuccess {
  readonly ok: true
  /** Each slice is the exact source text of one top-level object, in order. */
  readonly slices: readonly string[]
}

export interface SplitFailure {
  readonly ok: false
  readonly code: SplitFailureCode
  readonly detail: string
}

export type SplitResult = SplitSuccess | SplitFailure

function fail(code: SplitFailureCode, detail: string): SplitFailure {
  return { ok: false, code, detail }
}

/**
 * Scan `text` and return one slice per concatenated top-level object.
 *
 * @param text - raw argument text, possibly fused.
 * @returns `ok: true` with at least one slice, or a typed failure.
 */
export function splitTopLevelJsonObjects(text: string): SplitResult {
  const slices: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === undefined) break

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (depth === 0) {
      if (ch === '"') return fail('not-an-object', `string outside an object at offset ${i}`)
      if (ch === '}' || ch === ']') return fail('unbalanced', `unexpected "${ch}" at offset ${i}`)
      if (ch === '{') {
        depth = 1
        start = i
        continue
      }
      if (ch === '[') return fail('not-an-object', `top-level array at offset ${i}`)
      if (ch.trim() === '') continue
      return fail('not-an-object', `unexpected "${ch}" at offset ${i}`)
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      depth += 1
      continue
    }
    if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) {
        slices.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  if (inString) return fail('unterminated-string', 'input ends inside a JSON string')
  if (depth !== 0) return fail('unbalanced', `input ends at depth ${depth}`)
  if (slices.length === 0) return fail('empty', 'no top-level JSON object found')
  return { ok: true, slices }
}

/**
 * Cheap predicate for logs and evidence scans: does this text look like two or
 * more concatenated JSON objects, each of which parses?
 */
export function isFusedJsonObjectText(text: string): boolean {
  const split = splitTopLevelJsonObjects(text)
  if (!split.ok || split.slices.length < 2) return false
  for (const slice of split.slices) {
    try {
      const value: unknown = JSON.parse(slice)
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    } catch {
      return false
    }
  }
  return true
}
