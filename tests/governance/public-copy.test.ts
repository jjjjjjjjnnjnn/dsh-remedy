import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T
const exists = (path: string) => existsSync(new URL(path, root))
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const PUBLIC_FILES = [
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  'docs/copy/repo-metadata.json',
]

const manifest = readJson<{
  model_default: string
  entries: { name: string; target: string; model: string; output_sha256: string; facts_sha256: string }[]
}>('docs/copy/manifest.json')

test('every public file has a manifest entry whose bytes are unchanged', () => {
  // The writer used to be pinned to an external model, because that was how the
  // project kept numbers out of memory. What that pinning really protected is
  // checked directly now: the numbers are in the fact pack (gate_copy), and the
  // bytes are unchanged here. A live entry must say it was written in session.
  assert.equal(manifest.model_default, 'in-session')
  for (const file of PUBLIC_FILES) {
    const entry = manifest.entries.find((item) => item.target === file)
    assert.ok(entry !== undefined, `${file} has no manifest entry`)
    const frozen = typeof (entry as { frozen_at?: string }).frozen_at === 'string'
    if (!frozen) assert.equal(entry.model, 'in-session', `${file} came from ${entry.model}`)
    assert.equal(entry.output_sha256, sha256(read(file)), `${file} drifted from its recorded bytes`)
  }
})

test('the fact pack is current for every live entry', () => {
  // A frozen entry is a published record (the GitHub release notes), not a
  // description of the current pack: rewriting it after the pack moves on would
  // silently change a page that is already public. Live entries must track it.
  const factsHash = sha256(read('docs/copy/facts/public-repo-facts.md'))
  const frozen = new Set(
    manifest.entries.filter((entry) => typeof (entry as { frozen_at?: string }).frozen_at === 'string').map((entry) => entry.name),
  )
  for (const entry of manifest.entries) {
    if (frozen.has(entry.name)) continue
    assert.equal(entry.facts_sha256, factsHash, `${entry.target} cites a stale fact pack`)
  }
  assert.ok(frozen.size > 0, 'the release notes must be recorded as frozen')
})

test('the English README carries every required section', () => {
  const text = read('README.md')
  for (const heading of [
    '## What it fixes',
    '## Install',
    '## How it works',
    '## Safety guarantees',
    '## What it does not do',
    '## Verify it yourself',
    '## Status',
    '## Development',
    '## Contributing',
    '## Security',
    '## License',
  ]) {
    assert.match(text, new RegExp(`^${heading}$`, 'm'), `missing ${heading}`)
  }
  assert.match(text, /README\.zh-CN\.md/)
  // The README must cite a live artifact, and the file it names must exist. It deliberately
  // does not pin a stamp: every new verification adds a newer artifact and demotes the old one.
  const liveLinks = [...text.matchAll(/data\/results\/live-[^\s()[\]]+\.json/g)]
    .map((match) => match[0])
  assert.ok(liveLinks.length > 0, 'the README must cite at least one live artifact')
  for (const target of liveLinks) assert.ok(exists(target), `missing live artifact: ${target}`)
  assert.match(text, /#4427/)
})

test('the Chinese README carries every required section', () => {
  const text = read('README.zh-CN.md')
  for (const heading of ['## 它修什么', '## 安装', '## 工作方式', '## 安全保证', '## 它不做什么', '## 自己验证', '## 状态', '## 开发', '## 贡献', '## 安全', '## 许可证']) {
    assert.match(text, new RegExp(`^${heading}$`, 'm'), `missing ${heading}`)
  }
  assert.match(text, /README\.md/)
})

test('the README local links resolve', () => {
  const text = read('README.md')
  const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? '')
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.replace(/#.*$/, ''))
  assert.ok(targets.length > 0)
  for (const target of targets) assert.ok(exists(target), `broken local link: ${target}`)
})

test('the repository metadata is bounded and matches the packages', () => {
  const metadata = readJson<{
    description: string
    plugin_description: string
    core_description: string
    topics: string[]
    release_blurb: string
    social_preview: string
  }>('docs/copy/repo-metadata.json')
  assert.ok(metadata.description.length <= 160)
  assert.ok(metadata.topics.length >= 8 && metadata.topics.length <= 12)
  for (const topic of metadata.topics) assert.match(topic, /^[a-z0-9-]+$/)
  // The blurb must point at a live artifact, and the artifact must actually exist.
  // It deliberately does not pin a stamp: every verification adds a newer one.
  const liveLinks = [
    ...metadata.release_blurb.matchAll(/data\/results\/live-[^\s()[\]]+\.json/g),
  ].map((match) => match[0])
  assert.ok(liveLinks.length > 0, 'the release blurb must cite a live artifact')
  for (const target of liveLinks) assert.ok(exists(target), `release blurb cites a missing path: ${target}`)
  assert.ok(metadata.social_preview.length > 20)

  const plugin = readJson<{ description: string }>('packages/plugin/package.json')
  const core = readJson<{ description: string }>('packages/core/package.json')
  assert.equal(plugin.description, metadata.plugin_description)
  assert.equal(core.description, metadata.core_description)
})

test('the issue forms require the environment fields and point at the security policy', () => {
  const bug = read('.github/ISSUE_TEMPLATE/bug_report.yml')
  assert.ok((bug.match(/required: true/g) ?? []).length >= 7)
  for (const id of ['remedy_version', 'dsh_version', 'os', 'provider_route']) {
    assert.match(bug, new RegExp(`id: ${id.replace('_', '[-_]')}`))
  }
  assert.doesNotMatch(bug, /id: confirmation[\s\S]*?\n    validations:/, 'checkboxes must not carry a top-level validations key')
  const config = read('.github/ISSUE_TEMPLATE/config.yml')
  assert.match(config, /blank_issues_enabled: false/)
  assert.match(config, /https:\/\/github\.com\/jjjjjjjjnnjnn\/dsh-remedy\/security\/policy/)
  const feature = read('.github/ISSUE_TEMPLATE/feature_request.yml')
  assert.match(feature, /one seam per patch/i)
})

test('no generated Markdown file contains a placeholder', () => {
  for (const file of PUBLIC_FILES.filter((path) => path.endsWith('.md'))) {
    const text = read(file)
    assert.doesNotMatch(text, /\b(TODO|TBD|FIXME|YOUR_[A-Z_]+|lorem ipsum)\b/i, `${file} contains a placeholder`)
  }
})

test('the copy channel document names the writer and the forbid rule', () => {
  // The writer used to be a pinned external model; pinning it was a proxy for
  // "no number may come from memory". The channel now records `in-session`, and
  // the rule that a registered artifact is never hand-edited still stands.
  const text = read('docs/copy/README.md')
  assert.match(text, /in-session/, 'the channel must name the writer it records')
  assert.match(text, /Never edit a registered artifact by hand/)
})
