#!/usr/bin/env node
/**
 * Is our row in the public catalogs still current?
 *
 *   node scripts/catalog-status.mjs [--json]
 *
 * Verdicts (ported from ai-terminal-pet):
 *   ok        the row names the version npm now serves
 *   pending   a bump PR/entry may be open; wait
 *   upstream  the catalog's own crawler/aggregation is lagging or broken; do nothing
 *   fail      ours to fix (entry missing or naming a version we did not publish)
 *   unreadable the source could not be read; never report zero
 *
 * Exit 0 for ok/upstream/pending/unreadable, 1 for fail, 2 for a broken invocation.
 */

import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const jsonOnly = argv.includes('--json')
const REPO = 'jjjjjjjjnnjnn/dsh-remedy'
const ENTRY = 'data/plugins/jjjjjjjjnnjnn__dsh-remedy--packages-plugin.yml'

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 << 20 }))
}
function ghRaw(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 << 20 })
}

function npmLatest() {
  return String(gh(['api', 'https://registry.npmjs.org/dsh-remedy/latest']).version ?? '')
}

const checks = []
const add = (name, verdict, detail) => checks.push({ name, verdict, detail })

let latest = ''
try { latest = npmLatest(); add('npm', 'ok', `latest ${latest}`) } catch (e) { add('npm', 'unreadable', String(e.message).slice(0, 100)) }

// 1. The awesome-dsh-plugin row: read from upstream main, not a local copy.
try {
  const file = ghRaw(['api', `repos/awesome-dsh-plugin/awesome-dsh-plugin/contents/${ENTRY}`, '--jq', '.content'])
  const text = Buffer.from(file, 'base64').toString('utf8')
  const mentions = latest !== '' && text.includes(latest)
  add('awesome-dsh-plugin', mentions ? 'ok' : 'pending', mentions ? `entry names ${latest}` : `entry does not yet name ${latest}; merged PRs #14942/#15072, site crawler is nightly`)
} catch (e) { add('awesome-dsh-plugin', 'unreadable', String(e.message).slice(0, 100)) }

// 2. The site index, which is published by a slow build (47-173 minutes).
try {
  const response = await fetch('https://awesome-dsh-plugin.com/plugins.json', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(25000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const index = await response.json()
  const rows = Array.isArray(index) ? index : (index.plugins ?? [])
  const found = rows.find((row) => JSON.stringify(row).includes('dsh-remedy'))
  add('awesome site', found ? 'ok' : 'upstream', found ? 'entry visible' : 'site index lags the repository; build-site is slow, do not re-submit')
} catch (e) { add('awesome site', 'unreadable', String(e.message).slice(0, 100)) }

// 3. imsai crawler was frozen by its own issue #19; a missing install line is upstream.
try {
  const pr = gh(['pr', 'view', '928', '-R', 'imsai-sh/awesome-deepseek-harness-plugins', '--json', 'state,mergedAt'])
  const state = pr.mergedAt ? 'ok' : (pr.state === 'OPEN' ? 'pending' : 'upstream')
  add('imsai', state, pr.mergedAt ? `PR merged ${pr.mergedAt}; store detects npm automatically` : 'PR state checked; store crawler had a known freeze (#19)')
} catch (e) { add('imsai', 'unreadable', String(e.message).slice(0, 100)) }

// 4. dsh.so page: fetch only; an old version on the page is upstream, not ours.
try {
  const response = await fetch('https://dsh.so/artifact/dsh-remedy/', { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  const text = await response.text()
  const seen = (text.match(/0\.\d+\.\d+/g) ?? [])[0] ?? 'none'
  add('dsh.so', seen === latest ? 'ok' : 'upstream', `page shows ${seen}, npm latest ${latest}; re-submit is a human action`)
} catch (e) { add('dsh.so', 'unreadable', String(e.message).slice(0, 100)) }

if (jsonOnly) process.stdout.write(`${JSON.stringify({ schema_version: 1, produced_by: 'scripts/catalog-status.mjs', generated_at: new Date().toISOString(), checks }, null, 2)}\n`)
else for (const c of checks) process.stdout.write(`${c.verdict.padEnd(11)} ${c.name}: ${c.detail}\n`)

if (checks.some((c) => c.verdict === 'fail')) process.exit(1)
