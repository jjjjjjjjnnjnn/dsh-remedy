import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

/**
 * P-0028 — a published sample carried this machine's home path.
 *
 * The fused-call fixture quotes the shell command a real session ran, and that
 * command begins with the real workspace path. Redaction ran on `data/results/`
 * artifacts, never on `data/fixtures/`, so every tarball since 0.1.0 shipped the
 * account name inside `fixtures/toolcall-fusion/session-9045e2ec-seq-526.json`.
 * The dshopen maintainer reported it on 2026-11-14 (issue #472).
 *
 * The rule below is deliberately blunt: no file that ships in a tarball, and no
 * page npm renders, may contain an absolute `…:/Users/<name>` segment. Our own
 * redactor replaces the whole segment with `<home>`, so a clean file has no
 * `Users` followed by a separator at all.
 */

const root = new URL('../../', import.meta.url)
const shipped = /[A-Za-z]:[\\/]{1,2}Users[\\/]/i

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

/** Every file that travels with a published artifact or is rendered by npm. */
function candidates() {
  const files = [
    'README.md',
    'README.zh-CN.md',
    'CHANGELOG.md',
    'packages/plugin/README.md',
    'packages/plugin/README.zh.md',
    'packages/core/README.md',
    'packages/plugin/cordis.patch.yml',
    'docs/copy/facts/public-repo-facts.md',
  ]
  const dirs = ['data/fixtures', 'packages/plugin/fixtures']
  for (const dir of dirs) {
    const url = new URL(`${dir}/`, root)
    if (!existsSync(url)) continue
    for (const file of walk(fileURLToPath(url))) {
      files.push(file.slice(fileURLToPath(root).length).replaceAll('\\', '/'))
    }
  }
  return files
}

test('no file that ships with the tarball names this machine', () => {
  const offenders = []
  let checked = 0
  for (const file of candidates()) {
    const url = new URL(file, root)
    if (!existsSync(url)) continue
    checked += 1
    const text = readFileSync(url, 'utf8')
    if (shipped.test(text)) offenders.push(file)
  }
  assert.ok(checked > 6, `the scan must cover more than a handful of files, covered ${checked}`)
  assert.deepEqual(offenders, [], `these shipped files contain an absolute home path: ${offenders.join(', ')}`)
})

test('the detector actually detects the shape it forbids', () => {
  // Without this, a regex typo would make the rule above pass on everything.
  const sample = 'cd "C:/Users/someone/Desktop/project" && ls'
  assert.match(sample, shipped, 'the detector must catch a forward-slash home path')
  assert.match('cd "C:\\\\Users\\\\someone\\\\project"', shipped, 'and a backslash one')
  assert.doesNotMatch('cd "<home>/Desktop/project" && ls', shipped, 'and must not flag the placeholder')
})
