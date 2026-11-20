#!/usr/bin/env node
/**
 * R81 / P-0055 · one live reading of the reach metric's definition.
 *
 *   node scripts/record_reach_truth.mjs --stamp <ISO>
 *
 * Refuses to write unless every claim holds for both published packages:
 *   - `newest` is the two newest registry versions, not two download-window keys
 *   - a published version with no row in the window is named in `missing`
 *   - `comparable` is true only when nothing is missing
 *   - the window's end day is named, so "published after the window" is provable
 *
 * The unit test covers the same rule on fixtures; this recorder covers the live
 * npm state at one stamp. Every source is read-only and a failure exits 4.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { latestShare, versionRank } from './lib/reach.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_reach_truth: --stamp must be ISO-8601\n')
  process.exit(2)
}

const PACKAGES = ['dsh-remedy', 'dsh-remedy-core']
const PERIOD = 'last-week'
const before = ['docs/reach/2026-11-19.md', 'docs/reach/2026-11-20.md']
const problems = []

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

const packages = {}
for (const name of PACKAGES) {
  try {
    const packument = await getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
    const perVersion = await getJson(`https://api.npmjs.org/versions/${name}/${PERIOD}`)
    const point = await getJson(`https://api.npmjs.org/downloads/point/${PERIOD}/${name}`)
    const published = Object.keys(packument.versions ?? {})
    const publishedAt = packument.time ?? {}
    const counts = perVersion.downloads ?? {}
    const window = { start: point.start ?? null, end: point.end ?? null }
    const share = latestShare(counts, published, window.end, publishedAt)

    if (published.length === 0) problems.push(`${name}: no published versions`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(window.end ?? ''))) problems.push(`${name}: no window end`)
    if (share === null) problems.push(`${name}: no download data`)
    if (share) {
      if (share.newestSource !== 'registry') problems.push(`${name}: newest was not read from the registry`)
      const expected = published.slice().sort((a, b) => versionRank(b) - versionRank(a)).slice(0, 2)
      if (JSON.stringify(share.newest) !== JSON.stringify(expected)) {
        problems.push(`${name}: newest ${share.newest.join(',')} != ${expected.join(',')}`)
      }
      for (const item of share.missing) {
        if (!share.newest.includes(item.version)) problems.push(`${name}: ${item.version} is not in newest`)
        if (!['published_after_window_end', 'no_row_in_window'].includes(item.reason)) {
          problems.push(`${name}: unknown missing reason ${item.reason}`)
        }
        const stampDay = String(publishedAt[item.version] ?? '').slice(0, 10)
        if (item.reason === 'published_after_window_end' && !(stampDay > window.end)) {
          problems.push(`${name}: ${item.version} cannot be after ${window.end}`)
        }
        if (item.reason === 'no_row_in_window' && Object.prototype.hasOwnProperty.call(counts, item.version)) {
          problems.push(`${name}: ${item.version} has a row but is called missing`)
        }
      }
      if (share.comparable !== (share.missing.length === 0)) problems.push(`${name}: comparable does not follow missing`)
      const summed = Object.keys(counts).reduce((sum, v) => sum + (Number(counts[v]) || 0), 0)
      if (share.total !== summed) problems.push(`${name}: total does not sum the window`)
    }

    packages[name] = {
      window,
      published: published.length,
      downloads: typeof point.downloads === 'number' ? point.downloads : null,
      rows: Object.keys(counts).length,
      latestShare: share,
    }
  } catch (error) {
    problems.push(`${name}: ${String(error.message ?? error).slice(0, 120)}`)
  }
}

const earlier = {}
for (const path of before) {
  if (!existsSync(abs(path))) {
    problems.push(`${path}: missing`)
    continue
  }
  const lines = readFileSync(abs(path), 'utf8').split(/\r?\n/).filter((line) => line.includes('latestShare'))
  earlier[path] = lines
}
const day20 = earlier['docs/reach/2026-11-20.md'] ?? []
if (day20.length === 0 || !day20[0].includes('newest 0.4.19, 0.4.18')) {
  problems.push('the 2026-11-20 reach file no longer shows the old mislabeled pair')
}

if (problems.length > 0) {
  process.stderr.write(`record_reach_truth: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_reach_truth.mjs',
  generated_at: stamp,
  claim: 'latestShare must name the two newest published versions; a version outside the download window is missing, not a silent zero',
  packages,
  before: earlier,
  sources: {
    pure_module: 'scripts/lib/reach.mjs',
    reporter: 'scripts/traffic-report.mjs',
    ledger: 'docs/reach/README.md',
  },
  not_proven: [
    'a snapshot of npm at one stamp; the per-version window rolls forward daily and a missing row may appear later',
    'the unit test checks the same rule on fixtures, so a live source failure cannot turn into a green artifact',
    'this does not measure users: download totals and latest share are machine readings',
  ],
}
const artifact = `${JSON.stringify(payload, null, 2)}\n`
const out = flag('out') ?? `data/results/live-reach-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_reach_truth: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
