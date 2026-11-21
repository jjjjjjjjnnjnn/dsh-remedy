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
    '跨项目',
    '7 天',
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

test('the reach ledger records windows, manual checks and unreachable sources', async () => {
  const readme = read('docs/reach/README.md')
  assert.ok(readme.includes('latest share'), 'the ledger must name the derived metric')
  assert.ok(readme.includes('unreachable'), 'a missing source must not become zero')
  const latest = read('docs/reach/latest.md')
  assert.match(latest, /generated_at: \d{4}-\d{2}-\d{2}T/)
  assert.ok(latest.includes('## Manual checks'), 'the signed-in half must stay visible')
  const { readdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const dir = fileURLToPath(new URL('../../docs/reach/', import.meta.url))
  const dated = readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .at(-1)
  assert.notEqual(dated, undefined, 'there must be at least one daily reach file')
  const daily = read(`docs/reach/${String(dated)}`)
  const heading = daily.split(/\r?\n/)[0]?.trim() ?? ''
  const day = String(dated).replace(/\.md$/, '')
  assert.equal(heading, `# Reach ${day}`, 'a daily file must start with its own dated heading, not a bootstrap stub')
  assert.match(daily, /generated_at: \d{4}-\d{2}-\d{2}T/)
  assert.ok(daily.includes('## Manual checks'), 'the daily file must keep the signed-in half')
  // Negative control: the old writer's leading "# Reach" stub must fail the rule.
  assert.notEqual('# Reach', `# Reach ${day}`, 'a bare stub is not a dated heading')
})

test('latestShare separates a crawler fleet from human concentration', async () => {
  // Import the pure module, not traffic-report.mjs: the reporter performs I/O
  // at import time and exits 2 when every source is unreachable.
  const url = new URL('../../scripts/lib/reach.mjs', import.meta.url)
  const mod = await import(url.href) as {
    latestShare: (
      versions: Record<string, number>,
      published?: string[] | null,
      windowEnd?: string | null,
      publishedAt?: Record<string, string>,
    ) => {
      share: number
      newest: string[]
      newestSource: string
      missing: Array<{ version: string; reason: string }>
      comparable: boolean
    } | null
    versionRank: (version: string) => number
  }
  assert.equal(mod.versionRank('0.4.20'), mod.versionRank('0.4.20'))
  assert.ok(mod.versionRank('0.4.20') > mod.versionRank('0.4.9'), 'numeric ordering, not string ordering')
  const flat = mod.latestShare({ '0.4.20': 100, '0.4.19': 100, '0.4.18': 100, '0.4.17': 100 })
  const concentrated = mod.latestShare({ '0.4.20': 800, '0.4.19': 100, '0.4.18': 50, '0.4.17': 50 })
  assert.ok(flat !== null && concentrated !== null)
  assert.ok(concentrated.share > flat.share + 0.3, 'humans concentrate on the newest two versions')
  assert.equal(mod.latestShare({}), null, 'no data is not a zero share')

  // The measured R81 shape: 0.4.20 is published but after the window closed.
  const published = ['0.4.18', '0.4.19', '0.4.20']
  const times = { '0.4.19': '2026-11-18T17:16:14.472Z', '0.4.20': '2026-11-19T07:22:05.341Z' }
  const lagged = mod.latestShare({ '0.4.19': 135, '0.4.18': 241 }, published, '2026-11-18', times)
  assert.deepEqual(lagged?.newest, ['0.4.20', '0.4.19'], 'newest comes from the registry')
  assert.deepEqual(lagged?.missing, [{ version: '0.4.20', reason: 'published_after_window_end' }])
  assert.equal(lagged?.comparable, false, 'a missing row makes the share a lower bound')
  assert.equal(lagged?.newestSource, 'registry')
  const complete = mod.latestShare({ '0.4.20': 1000, '0.4.19': 135 }, published, '2026-11-20', times)
  assert.equal(complete?.comparable, true, 'with both rows present the share is comparable')
  assert.deepEqual(complete?.missing, [])
  const fallback = mod.latestShare({ '0.4.19': 135, '0.4.18': 241 })
  assert.equal(fallback?.newestSource, 'downloads', 'without a registry the source is named')
  assert.equal(fallback?.comparable, false, 'a window-derived pair is not comparable')
  const wrongWindow = mod.latestShare({ '0.4.19': 135 }, published, null, times)
  assert.deepEqual(wrongWindow?.missing, [{ version: '0.4.20', reason: 'no_row_in_window' }])
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
  assert.ok(read('docs/AGENT-WORKFLOW.md').includes('agent-promotion'), 'posting must be delegated to the KB agent-promotion')
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
  assert.ok(snap.social.reddit.length > 0, 'reddit records from PROMOTION.md must reach the bus')
  assert.ok(
    (snap.catalogue as Array<{ name?: string }>).some((item) => item.name === 'dsh-remedy'),
    'docs/market-index.json must reach the bus as catalogue'
  )
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
