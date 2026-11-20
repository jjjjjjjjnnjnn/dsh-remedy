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
      compareVersions(version, core.version) < 0,
      `${version} is called the previous release but is not older than ${core.version}`,
    )
  }
})

/** Section versions in a changelog, newest first is not assumed; the rule sorts numerically. */
function changelogSections(text: string): string[] {
  return [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1] ?? '')
}

/** Versions the pack calls published, in the order it writes them. */
function publishedVersions(text: string): string[] {
  return [...text.matchAll(/`(\d+\.\d+\.\d+)`[^.\n]{0,80}?(?:is published|is `latest`)/g)].map((match) => match[1] ?? '')
}

test('every version the pack calls published has a changelog section', () => {
  // P-0049: the rule beside this one resolves only the **previous** release, so on
  // the R57 tree 0.4.15 had a section (it was the previous release) while 0.4.16 —
  // the release npm actually served — had none, and every gate stayed green. A
  // changelog whose newest entry is older than the published artifact tells a
  // stranger the wrong release is the current one.
  const published = publishedVersions(facts)
  assert.ok(published.length > 0, 'the pack must say which version is published')

  const sections = changelogSections(changelog)
  assert.ok(sections.length > 0, 'the changelog must carry sections')

  for (const version of published) {
    assert.ok(sections.includes(version), `${version} is called published but CHANGELOG.md has no [${version}] section`)
  }

  // An unreleased section above the published one is legitimate: the file
  // documents the tree, and the tree can be ahead of the registry. What is not
  // legitimate is a file that stops *below* the release the pack calls published.
  const newest = sections.reduce((best, candidate) => (compareVersions(candidate, best) > 0 ? candidate : best))
  const current = published.reduce((best, candidate) => (compareVersions(candidate, best) > 0 ? candidate : best))
  assert.ok(
    compareVersions(newest, current) >= 0,
    `the newest changelog section is ${newest} while the pack calls ${current} the published release`,
  )
})

test('the published-release rule fails on the shape it was written for', () => {
  // The negative control, on the measured shape rather than an invented one: a
  // changelog that stops at 0.4.15 and a pack that calls 0.4.16 published. If this
  // passes, the rule above proves nothing about a missed release.
  const staleChangelog = '## [0.4.15] - 2026-11-16\n\n### Added\n\n- something\n'
  const staleFacts = '- npm: `0.4.16` is published and is `latest` for both names.\n'
  const published = publishedVersions(staleFacts)
  assert.deepEqual(published, ['0.4.16'])
  const sections = changelogSections(staleChangelog)
  assert.deepEqual(sections, ['0.4.15'])
  assert.equal(sections.includes(published[0]!), false, 'the stale pair must not look covered')
  assert.equal(
    compareVersions(sections[0]!, published[0]!) < 0,
    true,
    '0.4.15 must compare older than 0.4.16, or the newest-section rule cannot fire',
  )
})

/**
 * Numeric semver comparison.
 *
 * Measured on 0.4.10: this rule used `localeCompare`, which compares text — so `0.4.9` sorted *after*
 * `0.4.10` (`"9" > "1"`) and the check claimed the previous release was newer than the
 * current one. It only surfaced when the minor version crossed into two digits, which is
 * the shape a text comparison always has and a numeric one never does.
 */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number.parseInt(part, 10))
  const b = right.split('.').map((part) => Number.parseInt(part, 10))
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

test('a text comparison would call 0.4.9 newer than 0.4.10, and the numeric one will not', () => {
  // The rule above used localeCompare until 0.4.10 crossed the two-digit minor version.
  // A numeric comparison is what makes the claim decidable, and this is the case that
  // proves it: "0.4.9" > "0.4.10" as text, and 0.4.9 < 0.4.10 as versions.
  assert.ok('0.4.9'.localeCompare('0.4.10') > 0, 'the text comparison really does call 0.4.9 newer')
  assert.equal(compareVersions('0.4.9', '0.4.10'), -1, 'the numeric comparison calls 0.4.9 older')
  assert.equal(compareVersions('0.4.10', '0.4.10'), 0, 'equal versions compare equal')
  assert.equal(compareVersions('0.4.10', '0.4.9'), 1, 'the newer version compares newer')
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1, 'a two-digit minor is not smaller than a one-digit one')
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

/**
 * A suite count on a first screen, bound to a version.
 *
 * Measured on the R63 tree: both first screens still said "The suite is 399
 * tests" while the pack it points at said 0.4.17 ships 405. `gate_copy` allowed
 * both numbers because 399 is a real historical count, so the page was checked
 * for provenance and never for which release it was describing.
 */
function suiteClaim(text: string): { version: string; tests: number } | null {
  const en = /The suite of ([\d.]+) is (\d+) tests/.exec(text)
  if (en !== null) return { version: en[1] ?? '', tests: Number.parseInt(en[2] ?? '', 10) }
  const zh = /([\d.]+) 的测试套件是 (\d+) 个测试/.exec(text)
  if (zh !== null) return { version: zh[1] ?? '', tests: Number.parseInt(zh[2] ?? '', 10) }
  return null
}

test('the first screens quote the suite the published version ships', () => {
  const claimed = claimedVersions()
  assert.notEqual(claimed, null, 'the fact pack must keep a `- Version:` line naming both packages')
  const version = claimed?.plugin ?? ''
  const shipped = new RegExp(`${version.replaceAll('.', '\\.')} ships (\\d+) tests`).exec(facts)
  assert.notEqual(shipped, null, `the pack must say how many tests ${version} ships`)
  const shippedCount = Number.parseInt(shipped?.[1] ?? '', 10)

  for (const path of ['README.md', 'README.zh-CN.md']) {
    const claim = suiteClaim(read(path))
    assert.notEqual(claim, null, `${path} must keep a version-bound suite sentence, not an unversioned "the suite is N"`)
    assert.equal(claim?.version, version, `${path} binds its suite count to a version the pack does not describe`)
    assert.equal(claim?.tests, shippedCount, `${path} quotes a suite count ${version} did not ship`)
  }

  // The negative control, on the shape this rule exists for: the current
  // version's sentence with the old count must be parsed and must disagree.
  const stale = suiteClaim(`The suite of ${version} is 399 tests and 0 failing.`)
  assert.notEqual(stale, null, 'the parser does not read the stale sentence')
  assert.equal(stale?.version, version)
  assert.equal(stale?.tests, 399)
  assert.notEqual(stale?.tests, shippedCount, '399 must not equal the count the pack ships')
})

/**
 * A pair of byte counts as the handoff writes them: `82 462 / 83 000`.
 *
 * The denominator must carry the thousands space, so `5 / 6` is not a byte
 * account and a ratio is not mistaken for one.
 */
const BYTE_PAIR = /(\d{1,3}(?: \d{3})?) \/ (\d{1,3} \d{3})/g

function bytePairs(text: string): string[] {
  return [...text.matchAll(BYTE_PAIR)].map((match) => `${match[1]} / ${match[2]}`)
}

/** The pairs the live status table measures, which are the only ones prose may repeat. */
function baselineRow(): string {
  const row = read('docs/HANDOFF.md')
    .split(/\r?\n/)
    .find((line) => line.startsWith('| 基线 |'))
  assert.ok(row !== undefined, 'HANDOFF must keep the `| 基线 |` row that quotes the byte account')
  return row
}

function measuredPairs(): Set<string> {
  return new Set(bytePairs(baselineRow()))
}

/**
 * A lone byte figure as prose writes it: `538 B`, `1 951 B`.
 *
 * Measured on the R65 tree: `docs/research/README.md` §6 said the last payment
 * left plugin **538 B** (CLI **440 B**), core **337 B** and registry **3 089 B**,
 * while the status table measured 141 / 43 / 131 / 1 951. The pair rule above
 * only reads *ratios*, and the file was already inside `liveProse()`, so a figure
 * with a `B` suffix was invisible to every gate.
 */
const BYTE_FIGURE = /(\d{1,3}(?: \d{3})*|\d{4,}) B\b/g

function byteFigures(text: string): string[] {
  return [...text.matchAll(BYTE_FIGURE)].map((match) => match[1] ?? '')
}

function measuredFigures(): Set<string> {
  return new Set(byteFigures(baselineRow()))
}

/**
 * The lines this rule reads: prose in live sections.
 *
 * Batch narratives are "then" and may quote the account of that day; the
 * evidence index is a table of artifacts whose rows describe their own stamp.
 * What is left is the text a successor acts on now.
 */
function liveProse(): { path: string; line: string }[] {
  const rows: { path: string; line: string }[] = []
  let batch = false
  for (const line of read('docs/HANDOFF.md').split(/\r?\n/)) {
    if (line.startsWith('## ')) batch = line.startsWith('## 当前批次')
    if (batch || line.startsWith('|')) continue
    rows.push({ path: 'docs/HANDOFF.md', line })
  }
  for (const path of ['AGENTS.md', 'docs/research/README.md', 'docs/research/leads.md']) {
    for (const line of read(path).split(/\r?\n/)) {
      if (line.startsWith('|')) continue
      rows.push({ path, line })
    }
  }
  return rows
}

test('a live section may only repeat the byte account the status table measures', () => {
  const measured = measuredPairs()
  const stale: string[] = []
  for (const { path, line } of liveProse()) {
    for (const pair of bytePairs(line)) {
      if (!measured.has(pair)) stale.push(`${path}: ${pair}`)
    }
  }
  assert.deepEqual(stale, [], `live sections quote an expired byte account: ${stale.join('; ')}`)

  // The negative control: R55's account must be rejected, this tree's accepted.
  const allowed = new Set(['82 462 / 83 000'])
  assert.deepEqual(bytePairs('plugin 只剩 143 B（82 857 / 83 000）').filter((pair) => !allowed.has(pair)), [
    '82 857 / 83 000',
  ])
  assert.deepEqual(bytePairs('plugin 82 462 / 83 000').filter((pair) => !allowed.has(pair)), [])
  assert.deepEqual(bytePairs('6 of 6 gates'), [], 'a ratio without thousands separators is not a byte account')
})

test('a live section may only quote byte figures the status table measures', () => {
  const measured = measuredFigures()
  const stale: string[] = []
  for (const { path, line } of liveProse()) {
    for (const figure of byteFigures(line)) {
      if (!measured.has(figure)) stale.push(`${path}: ${figure} B`)
    }
  }
  assert.deepEqual(stale, [], `live sections quote a byte figure the status table does not measure: ${stale.join('; ')}`)

  // The negative control, on the measured shape: §6's four figures must be read
  // and must be rejected, while this tree's headroom is accepted.
  assert.deepEqual(byteFigures('plugin **538 B**（CLI **440 B**）、core **337 B**、registry **3 089 B**'), [
    '538', '440', '337', '3 089',
  ])
  assert.deepEqual(byteFigures('plugin **538 B**').filter((figure) => !measured.has(figure)), ['538'])
  assert.deepEqual(byteFigures('只剩 **1 186 B**').filter((figure) => !measured.has(figure)), [])
  assert.deepEqual(byteFigures('82 859 / 83 000'), [], 'a pair without a `B` suffix is not a lone figure')
})

/**
 * The section a successor is told to read first in the research page.
 *
 * Measured on the R65 tree: it still said "0.4.17 已发布", named the next patch as
 * P-0052 (which had shipped), and quoted the byte account of the round before the
 * payment. Three live claims, in the one page the intake rules tell a successor to
 * read, and nothing parsed it. R63 and R64 fixed this class in HANDOFF and
 * `leads.md`; duplication is what drifts, so this section now points instead.
 */
function researchInstructionSection(text: string): string {
  const start = text.indexOf('## 6. 下一会话的第一件事')
  assert.notEqual(start, -1, 'docs/research/README.md must keep its §6 for the next session')
  const rest = text.slice(start + 1)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

/** Version strings and patch ids a pointer section must not restate. */
function restatedVersions(section: string): string[] {
  return [...section.matchAll(/\b0\.\d+\.\d+\b/g)].map((match) => match[0] ?? '')
}

function restatedPatchIds(section: string): string[] {
  return [...section.matchAll(/P-\d{4}/g)].map((match) => match[0] ?? '')
}

test('the research page points the next session at the handoff instead of restating it', () => {
  const section = researchInstructionSection(read('docs/research/README.md'))
  assert.match(section, /docs\/HANDOFF\.md/, '§6 must send the next session to the handoff, not a copy of it')
  assert.match(section, /scripts\/collect_leads\.mjs/, '§6 must keep the intake command')

  const versions = restatedVersions(section)
  assert.deepEqual(versions, [], `§6 restates a released version: ${versions.join(', ')}`)
  const ids = restatedPatchIds(section)
  assert.deepEqual(ids, [], `§6 restates patch history the registry already owns: ${ids.join(', ')}`)

  // The negative control, on the measured shape: the old §6 must be rejected by
  // both readers, or the rules above prove nothing about the page.
  const stale =
    '## 6. 下一会话的第一件事\n\n3. **0.4.17 已发布**（P-0047 …）。4. 编号只前进（下一个是 **P-0052**）。\n'
  const staleSection = researchInstructionSection(stale)
  assert.deepEqual(restatedVersions(staleSection), ['0.4.17'])
  assert.deepEqual(restatedPatchIds(staleSection), ['P-0047', 'P-0052'])
})
