/**
 * Redaction for evidence that leaves the machine: keys, tokens, emails and home
 * paths, in every shape the three platforms write them. Each rule's measurement
 * (and the two platform shapes P-0038 added) is in
 * `docs/patches/P-0038-cross-platform-home-paths.md`; a scanner counts
 * replacements so a reader can see redaction ran instead of trusting it did.
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
    // Drive-letter shape, raw or JSON-escaped or slashed (`C:/Users/x`), which is
    // what a Windows session writes; the account name is the sensitive part.
    kind: 'windows-home',
    pattern: /\b[A-Za-z]:(?:\\{1,2}|\/)(?:Users|users)(?:\\{1,2}|\/)[^\\/\s"']+/gi,
    replacement: '<home>',
  },
  {
    // P-0038: `/home/<name>` (Linux) and `/Users/<name>` (macOS) are the same
    // host code on other platforms, and both used to pass through untouched.
    kind: 'posix-home',
    pattern: /(^|[\s"'(=,:;\/])\/(?:home|Users)\/[^\/\s"']+/g,
    replacement: '$1<home>',
  },
  {
    // P-0038: DSH renames the session directory after the workspace path
    // (`projectKey` in app.asar: 0.2.2-rc.3), so the same project encodes as
    // `--home-x--`, `--Users-x--` or `--C-Users-x--`. No separator survives to
    // match a path rule, so the account name leaked on two of the three.
    kind: 'encoded-home',
    pattern: /--(?:[A-Za-z]-)?(?:Users|home)-[A-Za-z0-9._]+(?:~[0-9A-Fa-f]{4})*(?=-)/g,
    replacement: '--<home-encoded>',
  },
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
