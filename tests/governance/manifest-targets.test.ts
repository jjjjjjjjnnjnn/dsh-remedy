import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T
const exists = (path: string) => existsSync(new URL(path, root))

test('every manifest entry points at a file that exists inside the repository', () => {
  // A release-notes entry once pointed at `.tmp/release-notes-v0.3.7.md`, which
  // is gitignored: the manifest claimed provenance for a file no clone can see.
  const manifest = readJson<{ entries: { name: string; target: string; output_sha256: string }[] }>(
    'docs/copy/manifest.json',
  )
  for (const entry of manifest.entries) {
    assert.ok(exists(entry.target), `${entry.name} points at a missing path: ${entry.target}`)
    assert.ok(!entry.target.startsWith('.tmp/'), `${entry.name} points into the gitignored .tmp: ${entry.target}`)
    assert.ok(!entry.target.startsWith('local/'), `${entry.name} points into local/: ${entry.target}`)
  }
})

test('the release notes in the manifest are the ones the last release shipped', () => {
  const manifest = readJson<{ entries: { name: string; target: string }[] }>('docs/copy/manifest.json')
  const entries = manifest.entries.filter((entry) => entry.name === 'release-notes')
  assert.equal(entries.length, 1, 'exactly one release-notes entry')
  const target = entries[0]?.target ?? ''
  assert.match(target, /^docs\/copy\/release-notes\/v\d+\.\d+\.\d+\.md$/, `unexpected release-notes path: ${target}`)
  const text = read(target)
  assert.match(text, /^## dsh-remedy \d+\.\d+\.\d+/m, 'the notes must open with the version heading')
  for (const section of ['### Added', '### Changed', '### Fixed', '### Package size', '### Notes']) {
    assert.match(text, new RegExp(`^${section}$`, 'm'), `release notes missing ${section}`)
  }
})
