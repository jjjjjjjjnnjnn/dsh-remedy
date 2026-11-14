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

test('the market index names where a version bytes actually come from', () => {
  // P-0020: the first version of this index pinned a git commit while declaring a
  // published version number. Those cannot both be true — the commit carried
  // nineteen patches and 0.3.8 shipped thirteen — so a market trusting the entry
  // would install something the version does not describe. A source is now either
  // the registry (no commit, because there is none) or git (with a commit and an
  // explicit `unreleased` marker so a working tree cannot pose as a release).
  const index = readJson<{
    format: number
    head?: { en?: string; zh?: string }
    plugins: {
      name: string
      versions: {
        version: string
        publishTimestamp: number
        unreleased?: boolean
        source: { type: string; commit?: string; path?: string }
      }[]
    }[]
  }>('docs/market-index.json')
  assert.equal(index.format, 1)

  const version = index.plugins[0]?.versions[0]
  assert.ok(version !== undefined, 'the index must carry at least one version')

  if (version.source.type === 'npm') {
    assert.equal(version.source.commit, undefined, 'an npm source has no commit to point at')
    assert.equal(version.source.path, undefined, 'an npm source has no in-repo path')
    assert.equal(version.unreleased, undefined, 'an npm source is a published artifact by definition')
  } else {
    assert.equal(version.source.type, 'git')
    assert.match(String(version.source.commit), /^[0-9a-f]{40}$/, 'a git source must pin a full sha')
    assert.equal(version.source.path, 'packages/plugin')
    assert.equal(version.unreleased, true, 'a git pin may only describe unreleased bytes')
  }

  // The publish timestamp is a measurement, not a placeholder: 0.4.5 landed on
  // the registry at 2026-11-14T12:52:29.667Z, which is epoch 1794660749. The
  // older entries stay in the index with their own measured timestamps.
  assert.equal(version.publishTimestamp, 1794660749)

  // And the unreleased head is stated once, in words, so a reader of the index
  // learns what the repository contains without mistaking it for the artifact.
  assert.equal(typeof index.head?.en, 'string')
  assert.equal(typeof index.head?.zh, 'string')
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
