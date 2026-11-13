import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T

const ENTRY = 'docs/distribution/awesome-dsh-plugin-entry.yml'

test('the market entry pinpoints the subpackage that declares dsh.bundle', () => {
  // awesome-dsh-plugin resolves an installable bundle from `dsh.bundle` in the
  // package.json the entry points at. This repository is a monorepo, so the entry
  // must point at `packages/plugin` and must use the `owner/repo#subname` form —
  // pointing at the repository root would resolve the private workspace shell and
  // the gate would reject it.
  const entry = read(ENTRY)
  const plugin = readJson<{ dsh?: { bundle?: { patch?: string } } }>('packages/plugin/package.json')
  assert.equal(typeof plugin.dsh?.bundle?.patch, 'string', 'packages/plugin must declare dsh.bundle.patch')

  const url = entry.match(/^url:\s*(\S+)$/m)?.[1] ?? ''
  assert.match(url, /\/tree\/main\/packages\/plugin$/, 'the entry must point at the subpackage directory')
  const name = entry.match(/^name:\s*(\S+)$/m)?.[1] ?? ''
  assert.match(name, /^jjjjjjjjnnjnn\/dsh-remedy#[a-z-]+$/, 'a monorepo subpackage uses owner/repo#subname')
  assert.match(entry, /^category:\s*dev$/m)
})

test('the market entry carries no digits, because that list checks each sentence against the code', () => {
  // Its gate reads the description as a claim about the source: a number in it
  // has to be verifiable there. Keeping the entry number-free is the same rule
  // this repository applies to its own outward text, one layer out.
  const entry = read(ENTRY)
  const withoutUrls = entry.replace(/https?:\/\/[^\n]*/g, '')
  assert.doesNotMatch(withoutUrls, /\d/, 'the entry must not state a number')
  assert.match(entry, /  en: /, 'the English description is the required half')
  assert.match(entry, /  zh: /, 'the Chinese half is optional for them but required here')
})

test('the market index pins a commit and a real publish timestamp', () => {
  const index = readJson<{
    format: number
    plugins: { name: string; versions: { version: string; publishTimestamp: number; source: { commit: string; path: string } }[] }[]
  }>('docs/market-index.json')
  assert.equal(index.format, 1)
  const plugin = index.plugins[0]
  assert.ok(plugin !== undefined)
  const version = plugin.versions[0]
  assert.ok(version !== undefined)
  // A pinned commit is the whole point of `format: 1`: a listing must not drift
  // away from the bytes that were tested.
  assert.match(version.source.commit, /^[0-9a-f]{40}$/, 'the index must pin a full commit sha')
  assert.equal(version.source.path, 'packages/plugin')
  // The timestamp is a measurement, not a placeholder: 0.3.8 landed on the
  // registry at 2026-11-12T17:40:02.359Z, which is epoch 1794505202.
  assert.equal(version.publishTimestamp, 1794505202)
})

test('the package manifest declares the blocks the ecosystem indexes read', () => {
  const plugin = readJson<{
    dsh?: { catalog?: { category?: string; summary?: { en?: string; zh?: string }; capabilities?: string[] }; marketplace?: { profiles?: string[] } }
  }>('packages/plugin/package.json')
  const catalog = plugin.dsh?.catalog
  assert.equal(typeof catalog?.category, 'string')
  assert.equal(typeof catalog?.summary?.en, 'string')
  assert.equal(typeof catalog?.summary?.zh, 'string')
  assert.ok((catalog?.capabilities ?? []).length > 0, 'capabilities must name what the bundle does')
  assert.ok((plugin.dsh?.marketplace?.profiles ?? []).includes('desktop'), 'a profile the bundle installs into')
})
