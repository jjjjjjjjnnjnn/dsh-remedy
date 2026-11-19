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

async function devto() {
  try {
    const r = await fetch(`https://dev.to/api/articles?username=${DEVTO_USER}&per_page=10`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return { error: `HTTP ${r.status}` }
    const items = await r.json()
    return items.map((a) => ({ title: a.title, url: a.url, published: a.published_at, reactions: a.public_reactions_count, comments: a.comments_count }))
  } catch (error) { return { error: error.name === 'TimeoutError' ? 'timeout' : String(error.message || error) } }
}

const t = traffic()
const u = upstream()
const d = await devto()
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

const lines = [
  `# Reach ${day}`,
  '',
  `generated_at: ${stamp}`,
  `repo: ${REPO}`,
  '',
  '## Machine-checkable half',
  '',
  `- npm window: ${t.window ?? 'unknown'}`,
  ...Object.entries(t.npm ?? {}).map(([name, p]) => `- ${name}: downloads ${String(p.downloads)} · latestShare ${p.latestShare === null ? 'n/a' : (p.latestShare.share * 100).toFixed(1) + '%'} · newest ${p.latestShare?.newest.join(', ') ?? 'n/a'}`),
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
  const prior = existsSync(daily) ? readFileSync(daily, 'utf8') : '# Reach\n'
  writeFileSync(daily, `${prior.trimEnd()}\n\n${block}\n`, 'utf8')
  const latest = join(dir, 'latest.md')
  writeFileSync(latest, `${block}\n`, 'utf8')
  process.stdout.write(`wrote docs/reach/${day}.md and docs/reach/latest.md\n`)
}
