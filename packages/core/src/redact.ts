/**
 * Redaction for evidence that leaves the machine.
 *
 * Evidence is quoted from real sessions, and real sessions contain keys, tokens,
 * email addresses and home paths. Every artifact written under `data/` goes
 * through here; the scanner counts replacements so a reader can see that
 * redaction ran instead of trusting that it did.
 */

import type { RedactionSummary } from './types.js'

interface Rule {
  readonly kind: string
  readonly pattern: RegExp
  readonly replacement: string
}

const RULES: readonly Rule[] = [
  { kind: 'api-key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: 'sk-***' },
  { kind: 'bearer', pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, replacement: '$1***' },
  {
    kind: 'assignment',
    pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)\b(\s*[:=]\s*["']?)[^\s"',}]{8,}/gi,
    replacement: '$1$2***',
  },
  { kind: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '***@***' },
  {
    // MEASURED: a home path reaches an artifact in three shapes, and only the
    // first one was redacted. A path quoted inside JSON doubles its separators
    // (`C:\\Users\\rongj`), and a file URL writes them as slashes
    // (`C:/Users/rongj`) — both leaked the account name until this rule
    // matched one-or-two backslashes or a forward slash. The username is the
    // sensitive part, so only it is dropped.
    kind: 'windows-home',
    pattern: /\b[A-Za-z]:(?:\\{1,2}|\/)(?:Users|users)(?:\\{1,2}|\/)[^\\/\s"']+/gi,
    replacement: '<home>',
  },
  {
    // MEASURED: DSH names a session directory after the absolute workspace
    // path with `-` as the separator and `~XXXX` for each escaped code point,
    // so `C:/Users/rongj/Desktop/x` appears as `--C-Users-rongj-Desktop-…--`.
    // No separator survived to match, and the account name leaked through the
    // directory name in every artifact that cited a session path.
    kind: 'encoded-home',
    pattern: /\b[A-Za-z]-Users-[A-Za-z0-9._]+(?:~[0-9A-Fa-f]{4})*(?=-)/,
    replacement: '<home-encoded>',
  },
  { kind: 'posix-home', pattern: /\/home\/[^/\s"']+/g, replacement: '<home>' },
]

export interface RedactResult {
  readonly text: string
  readonly summary: RedactionSummary
}

/** Redact one string and report what was removed. */
export function redact(text: string): RedactResult {
  let output = text
  let replacements = 0
  const kinds = new Set<string>()
  for (const rule of RULES) {
    output = output.replace(rule.pattern, (...args) => {
      replacements += 1
      kinds.add(rule.kind)
      const groups = args.slice(1, -2) as string[]
      let expanded = rule.replacement
      for (const [index, group] of groups.entries()) {
        expanded = expanded.replaceAll(`$${index + 1}`, group ?? '')
      }
      return expanded
    })
  }
  return { text: output, summary: { replacements, kinds: [...kinds].sort() } }
}

/** Redact every string in a JSON-like value. Keys are left alone. */
export function redactValue(value: unknown): { value: unknown; summary: RedactionSummary } {
  let replacements = 0
  const kinds = new Set<string>()

  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      const result = redact(input)
      replacements += result.summary.replacements
      for (const kind of result.summary.kinds) kinds.add(kind)
      return result.text
    }
    if (Array.isArray(input)) return input.map(walk)
    if (input !== null && typeof input === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(input as Record<string, unknown>)) out[key] = walk(item)
      return out
    }
    return input
  }

  return { value: walk(value), summary: { replacements, kinds: [...kinds].sort() } }
}
