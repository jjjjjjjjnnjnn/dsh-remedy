import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publishProblems } from '../../scripts/publish_packages.mjs'

const base = {
  root: { private: true },
  core: { name: 'dsh-remedy-core', version: '0.3.0', publishConfig: { access: 'public' } },
  plugin: { name: 'dsh-remedy', version: '0.3.0', publishConfig: { access: 'public' } },
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
  assert.match(first(problems), /0\.2\.0.*0\.3\.0/)
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
