#!/usr/bin/env node
/**
 * Daily reach check: what happened to the things we published, in one file.
 *
 *   node scripts/daily-reach.mjs            # write docs/reach/<today>.md + latest.md
 *   node scripts/daily-reach.mjs --stdout   # print only, write nothing
 *
 * Ported from ai-terminal-pet. The machine-checkable half is here (npm latest
 * share, GitHub traffic, release assets, upstream PR state, dev.to). The half
 * that needs a signed-in browser (X replies, Reddit comments as the author,
 * HN/V2EX posting, dsh.so form) is printed as a checklist, because inventing an
 * API for those would be a worse lie than saying "check it by hand".
 *
 * Unreachable sources are reported as `unreachable`, never as zero. Exit 0 even
 * when a source fails: a daily job that fails because a site blocks TLS trains
 * people to ignore it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stdoutOnly = process.argv.includes('--stdout')
const REPO = 'jjjjjjjjnnjnn/dsh-remedy'
const DEVTO_USER = 'jjjjjjjjnnjnn'
const UPSTREAM = [
  { label: 'imsai #928', repo: 'imsai-sh/awesome-deepseek-harness-plugins', number: 928, kind: 'pr' },
  { label: 'awesome-dsh-plugin #14942', repo: 'awesome-dsh-plugin/awesome-dsh-plugin', number: 14942, kind: 'pr' },
  { label: 'awesome-dsh-plugin #15072', repo: 'awesome-dsh-plugin/awesome-dsh-plugin', number: 15072, kind: 'pr' },
  { label: 'dshopen #472', repo: 'polang233/dsh-plugin-index', number: 472, kind: 'issue' },
  { label: 'AllDSH #3', repo: 'alldsh/submissions', number: 3, kind: 'issue' },
]

function run(command, args, timeout = 180000) {
  try {
    return { ok: true, out: execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 32 << 20 }).trim() }
  } catch (error) {
    return { ok: false, out: String(error?.stderr || error?.message || error).trim() }
  }
}

function traffic() {
  const r = run(process.execPath, ['scripts/traffic-report.mjs', '--json'])
  if (!r.ok) return { error: r.out.slice(0, 200) }
  try { return JSON.parse(r.out) } catch { return { error: 'traffic-report JSON did not parse' } }
}

function upstream() {
  return UPSTREAM.map((item) => {
    const fields = item.kind === 'pr' ? 'state,mergedAt,updatedAt,title' : 'state,updatedAt,title'
    const r = run('gh', [item.kind, 'view', String(item.number), '-R', item.repo, '--json', fields])
    if (!r.ok) return { ...item, state: 'unreachable' }
    try { return { ...item, ...JSON.parse(r.out) } } catch { return { ...item, state: 'unreadable' } }
  })
}

function devto() {
  try {
    const out = execFileSync('curl', ['-sS', '--max-time', '15', '-H', 'accept: application/json', `https://dev.to/api/articles?username=${DEVTO_USER}&per_page=10`], { encoding: 'utf8', maxBuffer: 8 << 20 })
    const items = JSON.parse(out)
    return items.map((a) => ({ title: a.title, url: a.url, published: a.published_at, reactions: a.public_reactions_count, comments: a.comments_count }))
  } catch (error) { return { error: String(error?.message ?? error).slice(0, 120) } }
}

const t = traffic()
const u = upstream()
const d = devto()
const now = new Date()
const stamp = now.toISOString()
const day = stamp.slice(0, 10)
const manual = [
  '- [ ] X：登录页确认根帖与回复；oEmbed 验证文本。',
  '- [ ] Reddit：帖子 JSON 的 `removed_by_category`；`/new/` 是否可见；24h 内回评论。',
  '- [ ] HN / V2EX：本人写、本人发；只使用事实卡。',
  '- [ ] dsh.so：表单重提当前版本，记录是否 `Submitted`。',
  '- [ ] DSH Discussions：#13206 是否有新回复。',
]

if (process.argv.includes('--json')) {
  const gh = t.github || {}
  const unreachable = [...(t.unreachable ?? [])]
    .map((item) => String(item).split('\n')[0].slice(0, 160))
  if (d?.error) unreachable.push('devto')
  let pluginVersion = null
  try { pluginVersion = JSON.parse(readFileSync(join(root, 'packages', 'plugin', 'package.json'), 'utf8')).version } catch { pluginVersion = null }
  const catalogue = (() => {
    try {
      const doc = JSON.parse(readFileSync(join(root, 'docs', 'market-index.json'), 'utf8'))
      return (doc.plugins ?? []).map((plugin) => ({
        name: plugin.name,
        version: plugin.versions?.[0]?.version ?? null
      }))
    } catch { return [] }
  })()
  const reddit = (() => {
    try {
      const page = readFileSync(join(root, 'docs', 'PROMOTION.md'), 'utf8')
      return page.split(/\r?\n/)
        .filter((line) => line.includes('reddit.com/r/') && line.includes('/comments/'))
        .map((line) => {
          const url = (line.match(/https:\/\/www\.reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+\/[^)\s|]*/) || [])[0]
          if (!url) return null
          const outcome = /removed_by_category:\s*"reddit"|被过滤|filtered/i.test(line) ? 'filtered'
            : /removed_by_category:\s*"moderator"|被版主/i.test(line) ? 'removed'
              : /已发布|正常显示|visible/i.test(line) ? 'visible'
                : 'recorded'
          return { url, outcome }
        })
        .filter(Boolean)
    } catch { return [] }
  })()
  const x = (() => {
    try {
      const page = readFileSync(join(root, 'docs', 'PROMOTION.md'), 'utf8')
      return page.split(/\r?\n/)
        .filter((line) => /X \/ @JJjj1955714|https:\/\/x\.com\/JJjj1955714/.test(line))
        .map((line) => ({
          account: '@JJjj1955714',
          outcome: /已发布|posted/i.test(line) ? 'posted' : 'recorded'
        }))
    } catch { return [] }
  })()
  const snapshot = {
    schema: 'promotion-snapshot/v1',
    project_id: 'dsh-remedy',
    generated_at: stamp,
    release: { version: pluginVersion },
    github: {
      stars: gh.stars ?? null,
      forks: gh.forks ?? null,
      watchers: gh.watchers ?? null,
      open_issues: gh.open_issues ?? null,
      views: gh.views === 'unreachable' ? { unavailable: true } : { count: gh.views?.count, uniques: gh.views?.unique, window_days: 14 },
      clones: gh.clones === 'unreachable' ? { unavailable: true } : { count: gh.clones?.count, uniques: gh.clones?.unique, ci: gh.clones?.ciCloneBaseline, humanish: gh.clones?.humanish, window_days: 14 },
      referrers: gh.referrers === 'unreachable' ? [] : gh.referrers
    },
    npm: Object.entries(t.npm ?? {}).map(([name, p]) => ({
      package: name,
      week: p.downloads,
      newest: p.latestShare?.newest?.join(', ') ?? null,
      share: p.latestShare?.share ?? null,
      missing: p.latestShare?.missing ?? null,
      comparable: p.latestShare?.comparable ?? null,
      newest_source: p.latestShare?.newestSource ?? null,
      window_start: p.window?.start ?? null,
      window_end: p.window?.end ?? null,
      window: t.window
    })),
    catalogue,
    releases: gh.releases === 'unreachable' ? [] : gh.releases,
    social: {
      devto: Array.isArray(d) ? d : [],
      reddit,
      x
    },
    upstream: u,
    unreachable,
    source: { command: 'node scripts/daily-reach.mjs --json' }
  }
  process.stdout.write(JSON.stringify(snapshot, null, 2))
  process.exit(0)
}

const lines = [
  `# Reach ${day}`,
  '',
  `generated_at: ${stamp}`,
  `repo: ${REPO}`,
  '',
  '## Machine-checkable half',
  '',
  `- npm window: ${t.window ?? 'unknown'}`,
  ...Object.entries(t.npm ?? {}).map(([name, p]) => {
    const s = p.latestShare
    const note = s?.missing.length
      ? ` · ${s.missing.map((m) => `${m.version} missing (${m.reason})`).join(', ')} · lower bound, not comparable`
      : ''
    return `- ${name}: downloads ${String(p.downloads)} · latestShare ${s === null ? 'n/a' : (s.share * 100).toFixed(1) + '%'} · newest ${s?.newest.join(', ') ?? 'n/a'} · window ${p.window?.start ?? '?'}..${p.window?.end ?? '?'}${note}`
  }),
  `- GitHub views: ${JSON.stringify(t.github?.views ?? 'unreachable')}`,
  `- GitHub clones: ${JSON.stringify(t.github?.clones ?? 'unreachable')}`,
  `- Referrers: ${JSON.stringify(t.github?.referrers ?? 'unreachable')}`,
  `- Release assets: ${JSON.stringify(t.github?.assets ?? [])}`,
  '',
  '## Upstream channels',
  '',
  ...u.map((x) => `- ${x.label}: ${x.state}${x.mergedAt ? ` (merged ${x.mergedAt})` : ''}`),
  '',
  '## dev.to',
  '',
  ...(Array.isArray(d) && d.length ? d.map((a) => `- ${a.title}: ${a.url} — ${String(a.reactions)} reactions / ${String(a.comments)} comments`) : [`- ${typeof d?.error === 'string' ? `unreachable: ${d.error}` : 'no articles'}`]),
  '',
  '## Manual checks (signed-in browser)',
  '',
  ...manual,
  '',
  '## Honesty',
  '',
  '- npm totals are not users; only latestShare with a window is compared.',
  '- newest comes from the registry; a release outside the download window is missing, never a zero, and makes the share a lower bound.',
  '- Unreachable sources are recorded as unreachable, never as zero.',
  '- A quiet day is a valid result: it is recorded as "no change".',
  '',
]
const block = lines.join('\n')
if (stdoutOnly) {
  process.stdout.write(`${block}\n`)
} else {
  const dir = join(root, 'docs', 'reach')
  mkdirSync(dir, { recursive: true })
  const daily = join(dir, `${day}.md`)
  const prior = existsSync(daily) ? readFileSync(daily, 'utf8').trimEnd() : ''
  writeFileSync(daily, prior === '' ? `${block}\n` : `${prior}\n\n${block}\n`, 'utf8')
  const latest = join(dir, 'latest.md')
  writeFileSync(latest, `${block}\n`, 'utf8')
  process.stdout.write(`wrote docs/reach/${day}.md and docs/reach/latest.md\n`)
}
