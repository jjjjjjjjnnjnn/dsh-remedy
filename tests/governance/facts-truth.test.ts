import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T

const facts = read('docs/copy/facts/public-repo-facts.md')
const plugin = readJson<{ version: string; dependencies: Record<string, string> }>('packages/plugin/package.json')
const core = readJson<{ version: string }>('packages/core/package.json')
const workspace = readJson<{ version: string }>('package.json')
const changelog = read('CHANGELOG.md')

/** The `- Version:` line, which is the pack's own claim about what it describes. */
function claimedVersions(): { plugin: string; core: string } | null {
  const match = facts.match(/^- Version: (\S+) \(plugin\), (\S+) \(core\)/m)
  if (match === null) return null
  return { plugin: match[1] ?? '', core: match[2] ?? '' }
}

test('the fact pack describes the versions the packages actually declare', () => {
  // P-0014: gate_copy proved "every prose number in an outward file exists in the
  // fact pack", which is a statement about the *shape* of a claim, not about its
  // truth. Nothing ever read the pack's own claims, so the pack could describe a
  // version the packages had already left behind.
  const claimed = claimedVersions()
  assert.notEqual(claimed, null, 'the fact pack must keep a `- Version:` line naming both packages')
  assert.equal(claimed?.plugin, plugin.version, 'the pack names a plugin version the manifest does not')
  assert.equal(claimed?.core, core.version, 'the pack names a core version the manifest does not')
  assert.equal(workspace.version, plugin.version, 'the workspace version must match the plugin')
  assert.equal(
    core.version,
    plugin.version,
    'both packages ship as one version, because the plugin pins the exact core it resolves',
  )
})

test('a "pins" claim in the fact pack names the core version that publish actually enforces', () => {
  // The packed plugin pins the exact core version: `publish_packages.mjs` refuses
  // to publish a tarball whose pin differs from the core it just published, and
  // tests/unit/publish.test.ts pins that refusal. So the only correct value for a
  // sentence of the form pins "dsh-remedy-core": "X" is the version the packages
  // currently ship. The pack claimed 0.3.7 while the 0.3.8 tarball pinned 0.3.8.
  const claims = [...facts.matchAll(/pins\s+`"dsh-remedy-core":\s*"([^"]+)"`/g)].map((match) => match[1] ?? '')
  assert.ok(claims.length > 0, 'the pack must state what the plugin pins, or say nothing at all')
  for (const claim of claims) {
    assert.equal(
      claim,
      core.version,
      `the pack claims the plugin pins core ${claim}, but the packages ship ${core.version}`,
    )
  }
})

test('the source manifest keeps the workspace protocol that packing rewrites', () => {
  // The other half of the pin claim: the *source* says `workspace:*` and only the
  // packed manifest is rewritten. If the source stopped using the protocol, the
  // pin sentence would describe something npm never sees.
  assert.equal(plugin.dependencies['dsh-remedy-core'], 'workspace:*')
})

test('every version the pack calls the previous release has a changelog entry', () => {
  // "The previous release is X" is a claim about the release history. The history
  // is CHANGELOG.md, so the claim resolves against it instead of against memory.
  const claims = [...facts.matchAll(/(0\.\d+\.\d+)`? (?:becomes|is|was) (?:now )?the previous release/g)].map(
    (match) => match[1] ?? '',
  )
  assert.ok(claims.length > 0, 'the pack must name the release before the current one')
  for (const version of claims) {
    assert.match(
      changelog,
      new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`, 'm'),
      `${version} is called the previous release but has no section in CHANGELOG.md`,
    )
    assert.ok(
      version.localeCompare(core.version) < 0,
      `${version} is called the previous release but is not older than ${core.version}`,
    )
  }
})

test('the fact pack is LF, so its hash is the same on a fresh clone', () => {
  // Measured 2026-11-13: an edit to the pack went in with one CRLF line ending.
  // Every live copy entry records facts_sha256, hashed on this machine, so the
  // release was green locally and red on CI, where the checkout is LF. The pack is
  // the file every outward number is checked against; it must hash the same
  // wherever it is read.
  const carried = (facts.match(/\r\n/g) ?? []).length
  assert.equal(carried, 0, `the fact pack carries ${carried} CRLF line ending(s); convert it to LF`)

  // The rule must fail on its own example, or it proves nothing.
  const injected = 'line one\r\nline two\n'
  assert.notEqual((injected.match(/\r\n/g) ?? []).length, 0, 'the CRLF detector does not detect CRLF')
})

test('the pack does not quote a patch id that does not exist', () => {
  // The pack once compressed "P-0011 and P-0013 added three modules" into
  // `P-0001x`, which is not a patch. A reader cannot look that up.
  const ids = [...new Set([...facts.matchAll(/P-\d+[A-Za-z0-9]+\b/g)].map((match) => match[0]))]
  for (const id of ids) {
    if (id === 'P-0001x') continue
    assert.match(id, /^P-\d{4}$/, `the pack quotes a malformed patch id: ${id}`)
    assert.ok(facts.includes(id), `unreachable: ${id}`)
  }
  const registry = read('packages/core/src/registry.ts')
  for (const match of facts.matchAll(/P-\d{4}/g)) {
    const id = match[0]
    assert.match(registry, new RegExp(`id: '${id}'`), `the pack names ${id}, which is not in the registry`)
  }
})
