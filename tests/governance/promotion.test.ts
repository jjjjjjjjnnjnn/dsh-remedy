import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const facts = read('docs/copy/facts/public-repo-facts.md')
const manifest = JSON.parse(read('packages/plugin/package.json')) as { version: string }

test('the promotion playbook keeps the human-only and measured-number rules', () => {
  const play = read('docs/PROMOTION-PLAYBOOK.md')
  for (const needed of [
    '事实卡',
    'Hacker News / V2EX',
    '不代写',
    'latest share',
    'removed_by_category',
    'Action restricted',
    '24 小时',
    '不要复制',
  ]) {
    assert.ok(play.includes(needed), `the playbook lost the rule: ${needed}`)
  }
  assert.doesNotMatch(play, /下载总量当用户数[^\n]*是成绩/, 'the playbook must not turn totals into an achievement')
})

test('the project promotion page names only versions the fact pack knows', () => {
  const page = read('docs/PROMOTION.md')
  assert.ok(page.includes('docs/copy/facts/public-repo-facts.md'), 'the fact card must point at the fact pack')
  assert.ok(page.includes('scripts/copy_record.mjs'), 'outward copy must go through the copy channel')
  const versions = [...page.matchAll(/\b0\.\d+\.\d+\b/g)].map((m) => m[0] ?? '')
  assert.ok(versions.length > 0, 'the page must name the channel versions it is talking about')
  for (const version of versions) {
    assert.ok(facts.includes(version), `PROMOTION.md names ${version}, which the fact pack does not carry`)
  }
  for (const boundary of ['不改宿主', '不做插件市场', 'macOS']) {
    assert.ok(page.includes(boundary), `the honesty boundary is missing: ${boundary}`)
  }
})

test('the reach ledger records windows, manual checks and unreachable sources', () => {
  const readme = read('docs/reach/README.md')
  assert.ok(readme.includes('latest share'), 'the ledger must name the derived metric')
  assert.ok(readme.includes('unreachable'), 'a missing source must not become zero')
  const latest = read('docs/reach/latest.md')
  assert.match(latest, /generated_at: \d{4}-\d{2}-\d{2}T/)
  assert.ok(latest.includes('## Manual checks'), 'the signed-in half must stay visible')
  const days = read('docs/reach/2026-11-19.md')
  assert.ok(days.includes('# Reach'), 'the daily file must exist with a heading')
})

test('latestShare separates a crawler fleet from human concentration', async () => {
  const url = new URL('../../scripts/traffic-report.mjs', import.meta.url)
  const mod = await import(url.href) as {
    latestShare: (versions: Record<string, number>) => { share: number } | null
    versionRank: (version: string) => number
  }
  assert.equal(mod.versionRank('0.4.20'), mod.versionRank('0.4.20'))
  assert.ok(mod.versionRank('0.4.20') > mod.versionRank('0.4.9'), 'numeric ordering, not string ordering')
  const flat = mod.latestShare({ '0.4.20': 100, '0.4.19': 100, '0.4.18': 100, '0.4.17': 100 })
  const concentrated = mod.latestShare({ '0.4.20': 800, '0.4.19': 100, '0.4.18': 50, '0.4.17': 50 })
  assert.ok(flat !== null && concentrated !== null)
  assert.ok(concentrated.share > flat.share + 0.3, 'humans concentrate on the newest two versions')
  assert.equal(mod.latestShare({}), null, 'no data is not a zero share')
})

test('the repo defers status to the knowledge-base bus', () => {
  const page = read('docs/PROMOTION.md')
  const play = read('docs/PROMOTION-PLAYBOOK.md')
  const reach = read('docs/reach/README.md')
  const reddit = read('docs/reddit-outreach.md')
  assert.ok(page.includes('唯一宣传状态机'), 'PROMOTION.md must name the KB bus as the state machine')
  assert.ok(page.includes('kb promo status'), 'the bus commands must be discoverable from the repo')
  assert.ok(play.includes('宣传总线'), 'the playbook must keep the bus boundary')
  assert.ok(reach.includes('不是渠道状态机'), 'the local reach ledger must not claim to be status')
  assert.ok(reddit.includes('kb promo record'), 'real posts must be registered in the bus')
})

test('daily-reach --json speaks promotion-snapshot/v1 for the bus', async () => {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const r = spawnSync(process.execPath, ['scripts/daily-reach.mjs', '--json'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 32 << 20,
    timeout: 240000,
  })
  assert.equal(r.status, 0, String(r.stderr ?? '').slice(0, 300))
  const snap = JSON.parse(r.stdout) as {
    schema: string
    project_id: string
    generated_at: string
    release: { version: string }
    github: object
    npm: unknown[]
    catalogue: unknown[]
    releases: unknown[]
    social: { devto: unknown[]; reddit: unknown[]; x: unknown[] }
    upstream: unknown[]
    unreachable: unknown[]
    source: { command: string }
  }
  assert.equal(snap.schema, 'promotion-snapshot/v1')
  assert.equal(snap.project_id, 'dsh-remedy')
  assert.match(snap.release.version, /^\d+\.\d+\.\d+$/)
  for (const key of ['github', 'npm', 'catalogue', 'releases', 'social', 'upstream', 'unreachable', 'source'] as const) {
    assert.ok(key in snap, `snapshot is missing ${key}`)
  }
  assert.ok(snap.source.command.includes('daily-reach.mjs --json'))
})

test('the single-entry agent workflow is wired through the file chain', () => {
  const flow = read('docs/AGENT-WORKFLOW.md')
  const rules = read('PROJECT_RULES.md')
  const agents = read('AGENTS.md')
  const play = read('docs/PROMOTION-PLAYBOOK.md')
  const reach = read('docs/reach/README.md')
  const index = read('INDEX.md')
  assert.ok(flow.includes('开工第一屏'), 'the workflow must start with the green-check commands')
  assert.ok(flow.includes('需求与想法'), 'the workflow must own the agent needs/ideas protocol')
  assert.ok(flow.includes('知识库 Promotion Bus'), 'the workflow must name the KB bus as promotion state machine')
  assert.ok(flow.includes('发版流程'), 'the workflow must include the release chain')
  assert.ok(rules.includes('## 9. 工作流与需求入口'), 'PROJECT_RULES must carry the workflow rule')
  assert.ok(agents.includes('docs/AGENT-WORKFLOW.md'), 'AGENTS.md must point at the entry')
  assert.ok(play.includes('AGENT-WORKFLOW.md'), 'the playbook must point at the entry')
  assert.ok(reach.includes('docs/AGENT-WORKFLOW.md'), 'the reach ledger must point at the entry')
  assert.ok(index.includes('docs/AGENT-WORKFLOW.md'), 'INDEX must list the entry')
})
