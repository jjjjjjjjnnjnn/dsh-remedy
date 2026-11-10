import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { packedManifest, publishProblems, unpublishableDependencies } from '../../scripts/publish_packages.mjs'

const manifestOf = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { version: string }
const version = manifestOf('packages/plugin/package.json').version

const base = {
  root: { private: true },
  core: { name: 'dsh-remedy-core', version, publishConfig: { access: 'public' } },
  plugin: { name: 'dsh-remedy', version, publishConfig: { access: 'public' } },
  distExists: { core: true, plugin: true },
}

const first = (problems: string[]) => String(problems[0] ?? '')

test('a ready workspace has no publish problem', () => {
  assert.deepEqual(publishProblems(base), [])
})

test('a public workspace root is refused, because npm would ship the whole monorepo', () => {
  const problems = publishProblems({ ...base, root: { private: false } })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /private/)
})

test('a version skew between core and plugin is refused', () => {
  const problems = publishProblems({
    ...base,
    core: { ...base.core, version: '0.2.0' },
  })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /0\.2\.0.*0\.3\.1/)
})

test('a missing build is refused before npm sees an empty tarball', () => {
  const problems = publishProblems({ ...base, distExists: { core: false, plugin: false } })
  assert.equal(problems.length, 2)
  assert.match(first(problems), /pnpm run build/)
})

test('a package without public access is refused', () => {
  const problems = publishProblems({
    ...base,
    plugin: { ...base.plugin, publishConfig: { access: 'restricted' } },
  })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /publishConfig/)
})

test('a caller-reported packed dependency problem stops the publish', () => {
  const problems = publishProblems({ ...base, packed: { plugin: 'dependencies.dsh-remedy-core is "workspace:*"' } })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /workspace:\*/)
})

test('a packed dependency that still names a local protocol is refused', () => {
  // The exact 0.1.0 prototype: the tracked manifest says `workspace:*` (pnpm needs
  // it), and an unpacked-but-published tarball must never contain it.
  assert.match(String(unpublishableDependencies({ dependencies: { 'dsh-remedy-core': 'workspace:*' } })[0]), /workspace:\*/)
  assert.match(String(unpublishableDependencies({ dependencies: { x: 'file:../x' } })[0]), /file:/)
  assert.match(String(unpublishableDependencies({ peerDependencies: { y: 'link:../y' } })[0]), /link:/)
  assert.match(String(unpublishableDependencies({ optionalDependencies: { z: 'portal:../z' } })[0]), /portal:/)
})

test('a packed dependency pinned to a version is accepted', () => {
  assert.deepEqual(unpublishableDependencies({ dependencies: { 'dsh-remedy-core': version } }), [])
  assert.deepEqual(unpublishableDependencies({}), [])
  assert.deepEqual(unpublishableDependencies({ dependencies: null }), [])
})

test('the manifest as packed by pnpm is the manifest we publish', () => {
  // The 0.1.0 regression: npm published `workspace:*` verbatim and every registry
  // install of that tarball failed with EUNSUPPORTEDPROTOCOL. Reading the packed
  // manifest is the only check that sees the protocol after pnpm has rewritten it.
  const tgz = `.tmp/pack11/dsh-remedy-${version}.tgz`
  let manifest
  try {
    manifest = packedManifest(tgz) as { dependencies?: Record<string, string> } | null
  } catch (error) {
    // The tarball is a local build artifact, not a fixture; skip when it is absent
    // so a fresh clone can still run the test suite.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  assert.ok(manifest !== null)
  assert.equal(manifest.dependencies?.['dsh-remedy-core'], version)
})

test('the tracked workspace manifest still uses the workspace protocol', () => {
  // pnpm workspace resolution is what makes the monorepo installable; the pack
  // step is what turns it into a registry version. If this ever reads a literal
  // version, the source manifest was hand-edited and the two packages can drift.
  const manifest = JSON.parse(readFileSync('packages/plugin/package.json', 'utf8')) as {
    dependencies: Record<string, string>
  }
  assert.equal(manifest.dependencies['dsh-remedy-core'], 'workspace:*')
})
