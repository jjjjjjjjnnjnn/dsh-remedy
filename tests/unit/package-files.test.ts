import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T

const PACKAGES = ['packages/plugin', 'packages/core'] as const
const MAP_RULE = 'dist/**/*.map'

test('every package ignores dist sourcemaps in .npmignore', () => {
  for (const pkg of PACKAGES) {
    const lines = read(`${pkg}/.npmignore`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
    assert.ok(lines.includes(MAP_RULE), `${pkg}/.npmignore must list ${MAP_RULE}`)
  }
})

test('the files whitelist drops sourcemaps itself, because npm ignores .npmignore inside a whitelist', () => {
  // npm 11 does not consult a package-root .npmignore for paths already admitted
  // by `files`; the published tarball is filtered by the `!` negation instead.
  for (const pkg of PACKAGES) {
    const files = readJson<{ files?: string[] }>(`${pkg}/package.json`).files
    assert.ok(Array.isArray(files), `${pkg}/package.json must keep its files whitelist`)
    assert.ok(files.includes(`!${MAP_RULE}`), `${pkg}/package.json files must contain !${MAP_RULE}`)
    assert.ok(files.includes('dist'), `${pkg}/package.json files must still ship dist`)
    assert.ok(files.includes('README.md'), `${pkg}/package.json files must still ship README.md`)
  }
})

test('the shipped entry points still resolve to files inside dist', () => {
  const plugin = readJson<{ main: string; bin: Record<string, string>; exports: Record<string, unknown> }>(
    'packages/plugin/package.json',
  )
  assert.equal(plugin.main, './dist/index.js')
  assert.deepEqual(Object.values(plugin.bin), ['./dist/cli.js', './dist/cli.js'])
  for (const [subpath, value] of Object.entries(plugin.exports)) {
    if (subpath === './package.json') {
      assert.equal(value, './package.json')
      continue
    }
    const target = value as { types?: string; default?: string }
    assert.match(String(target.types ?? ''), /^\.\/dist\/[a-z-]+\.d\.ts$/, `${subpath} types`)
    assert.match(String(target.default ?? ''), /^\.\/dist\/[a-z-]+\.js$/, `${subpath} default`)
  }
  const core = readJson<{ main: string; types: string }>('packages/core/package.json')
  assert.equal(core.main, './dist/index.js')
  assert.equal(core.types, './dist/index.d.ts')
})

test('declarations stay on so the negation cannot break the types', () => {
  const base = readJson<{ compilerOptions: Record<string, unknown> }>('tsconfig.base.json').compilerOptions
  assert.equal(base.declaration, true, 'declaration must stay true; the map files are the only thing dropped')
})
