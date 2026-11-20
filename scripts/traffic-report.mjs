#!/usr/bin/env node
/**
 * One page of reach numbers, measured now, with machine traffic separated.
 *
 *   node scripts/traffic-report.mjs [--json]
 *
 * Ported from ai-terminal-pet's promotion pipeline. The rule that matters:
 * npm download totals are not users. Crawlers fetch every version evenly;
 * humans concentrate on the two newest. `latestShare` is the derived number
 * worth watching. GitHub clones are mostly our own CI, so the report subtracts
 * a CI-clone baseline before saying anything about clones.
 *
 * Every source is read-only. An unreachable source is reported as `unreachable`,
 * never as zero. Exit 0 for a report, 2 when a required source cannot be read.
 *
 * `newest` comes from the registry, not from the download window: a release made
 * after the window closed has no row yet and is named in `missing`, so the share
 * never quietly compares a different pair of versions from one day to the next.
 * The arithmetic itself lives in scripts/lib/reach.mjs (pure, no I/O).
 */

import { execFileSync } from 'node:child_process'
import { latestShare } from './lib/reach.mjs'

const REPO = 'jjjjjjjjnnjnn/dsh-remedy'
const PACKAGES = ['dsh-remedy', 'dsh-remedy-core']
const PERIOD = 'last-week'

const argv = process.argv.slice(2)
const jsonOnly = argv.includes('--json')

function gh(endpoint) {
  const out = execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 32 << 20 })
  return JSON.parse(out)
}

async function npmJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** Published versions and their timestamps, from the registry packument. */
async function registryMeta(name) {
  const packument = await npmJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
  return { published: Object.keys(packument.versions ?? {}), time: packument.time ?? {} }
}

/** Release assets grouped by kind, with per-release rate to expose self-verification. */
export function assetSummary(assets) {
  const kinds = [
    { name: 'plugin tarball', match: (n) => /^dsh-remedy-\d+\.\d+\.\d+\.tgz$/.test(n) },
    { name: 'core tarball', match: (n) => /^dsh-remedy-core-\d+\.\d+\.\d+\.tgz$/.test(n) },
  ]
  return kinds.map((kind) => {
    const files = assets.filter((a) => kind.match(a.name))
    const downloads = files.reduce((sum, a) => sum + (Number(a.downloads) || 0), 0)
    return { name: kind.name, releases: files.length, downloads, perRelease: files.length ? downloads / files.length : 0 }
  })
}

const errors = []
const fail = (label, error) => { errors.push(`${label}: ${String(error.message ?? error).slice(0, 120)}`); return null }

const npm = {}
for (const name of PACKAGES) {
  try {
    const perVersion = await npmJson(`https://api.npmjs.org/versions/${name}/${PERIOD}`)
    const versions = perVersion.downloads && typeof perVersion.downloads === 'object' ? perVersion.downloads : {}
    const point = await npmJson(`https://api.npmjs.org/downloads/point/${PERIOD}/${name}`)
    let meta = null
    try { meta = await registryMeta(name) } catch (error) { fail(`registry:${name}`, error) }
    const window = { start: point.start ?? null, end: point.end ?? null }
    npm[name] = {
      period: PERIOD,
      window,
      downloads: typeof point.downloads === 'number' ? point.downloads : null,
      versions,
      published: meta ? meta.published : null,
      latestShare: latestShare(versions, meta?.published ?? null, window.end, meta?.time ?? {}),
    }
  } catch (error) { fail(`npm:${name}`, error) }
}

let views = null
let clones = null
let referrers = null
let releases = null
let ciRuns = null
let meta = null
try {
  meta = gh(`repos/${REPO}`)
} catch (error) { fail('repo metadata', error) }
try {
  views = gh(`repos/${REPO}/traffic/views`)
  clones = gh(`repos/${REPO}/traffic/clones`)
  referrers = gh(`repos/${REPO}/traffic/referrers`)
} catch (error) { fail('github traffic', error) }
try {
  const raw = gh(`repos/${REPO}/releases?per_page=20`)
  releases = raw.map((r) => ({ tag: r.tag_name, published: r.published_at, assets: r.assets.map((a) => ({ name: a.name, downloads: a.download_count })) }))
} catch (error) { fail('github releases', error) }
try {
  const raw = gh(`repos/${REPO}/actions/runs?per_page=100`)
  ciRuns = (raw.workflow_runs ?? []).length
} catch (error) { fail('github actions', error) }

const ciCloneBaseline = ciRuns === null ? null : ciRuns * 4
const cloneCount = typeof clones?.count === 'number' ? clones.count : null
const report = {
  schema_version: 1,
  produced_by: 'scripts/traffic-report.mjs',
  generated_at: new Date().toISOString(),
  repo: REPO,
  window: PERIOD,
  npm,
  github: {
    stars: typeof meta?.stargazers_count === 'number' ? meta.stargazers_count : null,
    forks: typeof meta?.forks_count === 'number' ? meta.forks_count : null,
    watchers: typeof meta?.subscribers_count === 'number' ? meta.subscribers_count : null,
    open_issues: typeof meta?.open_issues_count === 'number' ? meta.open_issues_count : null,
    views: views === null ? 'unreachable' : { count: views.count, unique: views.unique },
    clones: clones === null ? 'unreachable' : { count: cloneCount, unique: clones.unique, ciCloneBaseline, humanish: cloneCount === null ? null : Math.max(0, cloneCount - (ciCloneBaseline ?? 0)) },
    referrers: referrers === null ? 'unreachable' : referrers.slice(0, 10).map((r) => ({ source: r.referrer, views: r.count })),
    releases: releases === null ? 'unreachable' : releases.slice(0, 8),
    assets: releases === null ? [] : assetSummary(releases.flatMap((r) => r.assets)),
  },
  unreachable: errors,
  honesty: [
    'npm totals are not users; only latestShare with a window is comparable',
    'newest means the two newest published versions, not the newest keys that happen to have download rows',
    'a version published after the window closed is named in missing, never counted as zero',
    'a share with missing entries is not comparable with another day',
    'GitHub clones include CI checkout traffic; the baseline is run count x 4 jobs',
    'release assets are downloaded back for verification; perRelease near 2 is us',
    'a missing source is recorded as unreachable, never as zero',
  ],
}

if (jsonOnly) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write(`dsh-remedy reach — ${PERIOD} — ${report.generated_at}\n`)
  for (const name of PACKAGES) {
    const p = npm[name]
    if (!p) continue
    const share = p.latestShare
    const note = share?.missing.length
      ? `; missing ${share.missing.map((m) => `${m.version} (${m.reason})`).join(', ')}; not comparable`
      : ''
    process.stdout.write(`${name}: downloads ${String(p.downloads)} · latestShare ${share === null ? 'n/a' : (share.share * 100).toFixed(1) + '%'} (${share?.newest.join(', ') ?? 'n/a'}${note})\n`)
  }
  process.stdout.write(`github views ${JSON.stringify(report.github.views)} · clones ${JSON.stringify(report.github.clones)}\n`)
  process.stdout.write(`referrers ${JSON.stringify(report.github.referrers)}\n`)
  if (errors.length) process.stdout.write(`unreachable: ${errors.join('; ')}\n`)
}
if (errors.length > 0 && Object.keys(npm).length === 0) process.exit(2)
