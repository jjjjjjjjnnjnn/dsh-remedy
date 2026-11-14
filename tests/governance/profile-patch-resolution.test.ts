import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T
const exists = (path: string) => existsSync(new URL(path, root))

/**
 * P-0035: a `name:` row in the patch layer is a promise that the loader can
 * import that module. Nothing in this repository checked that promise, and the
 * host does not check it either: it fails at load time with `never started`, and
 * the failure is only visible when a session needs a resume (upstream discussion
 * #12318: a config that kept `@deepseek-ai/dsh-tool-subagent-control/list-agents`
 * after that subpath was removed bricked every resume, while sessions kept open
 * in the UI were unaffected).
 *
 * So: every row this package ships must resolve inside its own manifest, and the
 * file the manifest points at must exist in the build. A row that names another
 * package is only accepted when that package is declared, because an undeclared
 * import is the same defect one step earlier.
 */

interface Row {
  readonly id: string
  readonly name: string
}

interface Manifest {
  readonly name: string
  readonly exports: Record<string, unknown>
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
}

/** Minimal reader for the shape this repository ships: `- insert:` then `name:`. */
export function rowsOf(text: string): Row[] {
  const rows: Row[] = []
  let current: { id: string; name: string } | null = null
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('- id:')) {
      current = { id: unquote(trimmed.slice('- id:'.length)), name: '' }
      rows.push(current)
      continue
    }
    if (current !== null && trimmed.startsWith('name:')) current.name = unquote(trimmed.slice('name:'.length))
  }
  return rows
}

/** YAML allows a quoted scalar; a scoped package name has to be quoted. */
function unquote(text: string): string {
  const value = text.trim()
  const first = value[0]
  if (value.length >= 2 && (first === "'" || first === '"') && value.endsWith(first)) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Resolve one row name against one manifest. Returns the build-relative target
 * the loader would import, or a reason it cannot be resolved.
 */
export function resolveRow(
  name: string,
  manifest: Manifest,
): { target: string } | { problem: string } {
  const slash = name.indexOf('/')
  const isScoped = name.startsWith('@')
  const packageName = isScoped ? name.split('/').slice(0, 2).join('/') : slash === -1 ? name : name.slice(0, slash)
  const subpath = isScoped
    ? name.startsWith(`${packageName}/`)
      ? `./${name.slice(packageName.length + 1)}`
      : '.'
    : slash === -1
      ? '.'
      : `./${name.slice(slash + 1)}`

  if (packageName !== manifest.name) {
    const declared = { ...manifest.dependencies, ...manifest.peerDependencies }
    return Object.hasOwn(declared, packageName)
      ? { target: packageName }
      : { problem: `"${name}" is not declared by ${manifest.name}` }
  }

  const entry = manifest.exports[subpath]
  if (entry === undefined) return { problem: `"${name}" has no export "${subpath}" in ${manifest.name}` }
  if (typeof entry !== 'object' || entry === null) return { problem: `"${name}" exports "${subpath}" as a bare string` }
  const target = (entry as { default?: unknown }).default
  if (typeof target !== 'string') return { problem: `"${name}" exports "${subpath}" with no default` }
  return { target }
}

function assertResolves(text: string, manifest: Manifest, builtFileOf: (target: string) => string | null): void {
  const rows = rowsOf(text)
  assert.ok(rows.length > 0, 'the patch layer must have at least one row')
  for (const row of rows) {
    assert.ok(row.name !== '', `row "${row.id}" has no module name`)
    const resolved = resolveRow(row.name, manifest)
    if ('problem' in resolved) assert.fail(`row "${row.id}": ${resolved.problem}`)
    const file = builtFileOf(resolved.target)
    if (file !== null) {
      assert.ok(exists(file), `row "${row.id}" imports ${resolved.target}, but ${file} is not built — run pnpm build`)
    }
  }
}

test('every row the shipped patch layer mounts resolves to a built module', () => {
  const manifest = readJson<Manifest>('packages/plugin/package.json')
  const text = read('packages/plugin/cordis.patch.yml')
  assertResolves(text, manifest, (target) => {
    if (target.startsWith('packages/') || !target.startsWith('.')) return null
    return `packages/plugin/${target.replace(/^\.\//, '')}`
  })
})

test('the resolver reports the upstream shape that bricked a resume', () => {
  // Negative control, and it is the exact #12318 case: a subpath export that no
  // longer exists. A resolver that always answers "fine" would make the test above
  // vacuous, so the same function must reject this row and accept its replacement.
  const manifest = readJson<Manifest>('packages/plugin/package.json')
  const removed = { ...manifest, name: '@deepseek-ai/dsh-tool-subagent-control', exports: { '.': { default: './lib/index.js' }, './src/*': { default: './src/*' } } }
  const broken = rowsOf("- insert:\n  - id: tool-subagent-list-agents\n    name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'")
  const problem = resolveRow(broken[0]!.name, removed)
  assert.ok('problem' in problem, 'a removed subpath export must not resolve')
  assert.match(problem.problem, /no export "\.\/list-agents"/)

  const fixed = rowsOf("- insert:\n  - id: tool-subagent-control\n    name: '@deepseek-ai/dsh-tool-subagent-control'")
  const ok = resolveRow(fixed[0]!.name, removed)
  assert.ok('target' in ok && ok.target === './lib/index.js', 'the main entry must resolve to the main export')
})

test('an undeclared package is refused before the host has to explain "never started"', () => {
  // A row naming a package this manifest never declares would resolve on the
  // author's machine (a stray node_modules) and fail on a stranger's. One build
  // step earlier, one clearer message.
  const manifest: Manifest = { name: 'dsh-remedy', exports: { './package.json': './package.json' } }
  const resolved = resolveRow('@tencent-connect/dsh-qqbot', manifest)
  assert.ok('problem' in resolved)
  assert.match(resolved.problem, /is not declared by dsh-remedy/)

  const declared: Manifest = { ...manifest, dependencies: { '@tencent-connect/dsh-qqbot': '1.0.0' } }
  assert.ok('target' in resolveRow('@tencent-connect/dsh-qqbot', declared))
})

test('the shipped row names the package itself, so it cannot drift into a subpath', () => {
  // The single row this bundle ships is `name: dsh-remedy`. If it ever grew a
  // subpath (`dsh-remedy/repair-stream`), a later release that renames the module
  // would break resume exactly like #12318 — the export map is the contract, and
  // the row has to be checked against it every build.
  const manifest = readJson<Manifest>('packages/plugin/package.json')
  const rows = rowsOf(read('packages/plugin/cordis.patch.yml'))
  for (const row of rows) assert.equal(row.name, manifest.name, `row "${row.id}" must mount the bare package name`)
})
