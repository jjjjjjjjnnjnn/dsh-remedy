import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * BS-20: a Reproduction step that lives in `.tmp/` cannot be re-run by a reader.
 *
 * `.tmp/` is gitignored and swept between rounds, so a command that cites it is a
 * promise the repository cannot keep. R60 measured the gap while cleaning the
 * directory and kept every script a doc named that still existed; it did not read
 * the eleven (now thirteen) Reproduction sections. `gate_registry` (P-0023) checks
 * that a doc exists and that its evidence and guard paths resolve, and never reads
 * this section.
 *
 * Two rules, each with its own negative control:
 *   1. a `## Reproduction` section may not cite a `.tmp/` path;
 *   2. every repository path it cites exists.
 *
 * What the rules do not prove is written in the blind spot: a command can exist
 * and still no longer demonstrate the claim beside it.
 */

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

/** The `## Reproduction` body, or null when the doc has no such section. */
export function reproductionSection(text: string): string | null {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+Reproduction\s*$/.test(line))
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  return lines.slice(start + 1, end === -1 ? lines.length : end).join('\n')
}

/** Paths that name a file in this repository, in the order they appear. */
export function citedPaths(section: string): string[] {
  const found = new Set<string>()
  const pattern = /\b((?:scripts|tests|packages|docs|data)\/[A-Za-z0-9_./-]+)/g
  for (const match of section.matchAll(pattern)) {
    const token = (match[1] ?? '').replace(/[.,;:)\]}`]+$/, '')
    // A wildcard or an angle-bracket placeholder is not a file a reader can open.
    if (token === '' || /[*<>]/.test(token) || token.endsWith('-')) continue
    // Only check what looks like a complete path: a file extension or a real directory.
    if (!/\.(ts|js|mjs|json|md|yml|yaml)$/.test(token) && !existsSync(new URL(token, root))) continue
    found.add(token)
  }
  return [...found]
}

export interface Violation {
  kind: 'tmp' | 'missing'
  token: string
}

/** Every way a section fails the two rules, as data so the negative control can read it. */
export function violations(section: string): Violation[] {
  const found: Violation[] = []
  for (const match of section.matchAll(/\.tmp[\\/]/g)) found.push({ kind: 'tmp', token: match[0] })
  for (const token of citedPaths(section)) {
    if (!existsSync(new URL(token, root))) found.push({ kind: 'missing', token })
  }
  return found
}

const docs = readdirSync(new URL('docs/patches/', root))
  .filter((name) => name.endsWith('.md'))
  .sort()

test('every patch doc Reproduction section is re-runnable from the repository', () => {
  const failed: string[] = []
  for (const name of docs) {
    const section = reproductionSection(read(`docs/patches/${name}`))
    if (section === null) continue
    const found = violations(section)
    if (found.length === 0) continue
    const tmp = found.filter((item) => item.kind === 'tmp').length
    const missing = found.filter((item) => item.kind === 'missing').map((item) => item.token).join(', ')
    failed.push(
      `${name}: ${tmp} .tmp/ path(s)${missing === '' ? '' : `; missing ${missing}`}`,
    )
  }
  assert.deepEqual(failed, [], failed.join('\n'))
})

test('the rules fail on the shapes they were written for', () => {
  const tmpDoc = '## Reproduction\n\n```powershell\nnode .tmp/r57-setup.mjs --home .tmp/r57-home\n```\n'
  const okDoc = '## Reproduction\n\n```powershell\nnode --test tests/unit/turn-answer.test.ts\n```\n'
  const missingDoc = '## Reproduction\n\n```powershell\nnode --test tests/unit/no-such-file.test.ts\n```\n'
  const noSection = '# P-9999\n\nNothing to run.\n'

  assert.equal(reproductionSection(noSection), null)
  assert.deepEqual(
    reproductionSection(tmpDoc)?.includes('r57-setup.mjs'),
    true,
    'the section reader stops before the body',
  )
  assert.deepEqual(violations(tmpDoc).map((item) => item.kind), ['tmp', 'tmp'])
  assert.deepEqual(violations(okDoc), [], 'a shipped test must pass both rules')
  assert.deepEqual(
    violations(missingDoc).map((item) => item.token),
    ['tests/unit/no-such-file.test.ts'],
    'an invented path must be reported, not resolved silently',
  )
})
