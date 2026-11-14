#!/usr/bin/env node
/**
 * One intake pass over the registered sources.
 *
 *   node scripts/collect_leads.mjs --stamp 2026-11-21T09:00:00.000Z [--reddit]
 *
 * What it writes: `data/results/intake-<stamp>.json` plus its `.sha256`, with
 * one row per source that answered and one row per source that did not. A
 * source that could not be read is `ok: false` with `counts: null` and a
 * reason — never `counts: 0`, because zero reads as "nothing there" when the
 * truth is "nobody looked" (see `scripts/lib/intake.mjs`).
 *
 * What it does NOT do: it never edits `docs/research/leads.md`. Candidates are
 * printed with the discussion numbers that are not already in the ledger, and a
 * later hand (or a later patch) decides what they mean. The ledger stays the
 * one place where a lead gets a status.
 *
 * Sources:
 *   --dsh      GitHub Discussions search (needs `gh` and a login)
 *   --self     this repository's own issues and pull requests
 *   --npm      downloads of both packages, last month
 *   --reddit   best-effort: Reddit is known to refuse TLS from this machine,
 *              so the failure is recorded as unreadable instead of guessed
 *   --census   counts from the built CLI over a session directory
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { abs, isoStamp, repoRoot } from './lib/kit.mjs'
import {
  candidatesFromDiscussions,
  knownNumbers,
  okSource,
  summarize,
  unreadableSource,
} from './lib/intake.mjs'

const argv = process.argv.slice(2)
const has = (name) => argv.includes(`--${name}`)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('collect_leads: --stamp must be ISO-8601\n')
  process.exit(2)
}

const only = new Set(['dsh', 'self', 'npm', 'reddit', 'census'].filter((name) => has(name)))
const runnable = (name) => only.size === 0 || only.has(name)

const TERMS = flag('terms', 'MALFORMED,STREAM_CLOSED,empty tool,parallel tool,session resume').split(',')
const REPO = 'deepseek-ai/deepseek-harness'
const SELF = 'jjjjjjjjnnjnn/dsh-remedy'
const sources = []
const notes = []

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options })
}

/** Windows resolves gh and npm only through .cmd shims, so those two need a shell. */
function runTool(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options })
}

function ghJson(restArgs) {
  const result = run('gh', restArgs)
  if (result.status !== 0) throw new Error(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim() || 'gh failed')
  return JSON.parse(result.stdout)
}

// --- S-DSH: Discussions search, one call per term, merged by number -------------
if (runnable('dsh')) {
  try {
    const byNumber = new Map()
    const perTerm = []
    for (const term of TERMS) {
      const query = `repo:${REPO} ${term}`
      const body = JSON.stringify({
        query: `{ search(type: DISCUSSION, query: ${JSON.stringify(query)}, first: 20) { discussionCount nodes { ... on Discussion { number title url updatedAt } } } }`,
      })
      const result = run('gh', ['api', 'graphql', '--input', '-'], { input: body })
      if (result.status !== 0) throw new Error(`${result.stderr ?? ''}`.trim() || 'gh graphql failed')
      const payload = JSON.parse(result.stdout)
      const count = payload.data?.search?.discussionCount ?? null
      const nodes = payload.data?.search?.nodes ?? []
      perTerm.push({ term, discussionCount: count, returned: nodes.length })
      for (const node of nodes) byNumber.set(node.number, node)
    }
    const leadsText = existsSync(abs('docs/research/leads.md'))
      ? readFileSync(abs('docs/research/leads.md'), 'utf8')
      : ''
    const known = knownNumbers(leadsText)
    const candidates = candidatesFromDiscussions([...byNumber.values()]).filter((node) => !known.has(node.number))
    sources.push(
      okSource('S-DSH', {
        terms: perTerm.length,
        discussions_by_term: perTerm,
        unique_discussions: byNumber.size,
        already_in_ledger: [...byNumber.keys()].filter((number) => known.has(number)).length,
        new_candidates: candidates.length,
      }, { candidates }),
    )
    notes.push(`S-DSH: ${candidates.length} candidate(s) not yet in leads.md`)
  } catch (error) {
    sources.push(unreadableSource('S-DSH', error instanceof Error ? error.message : String(error)))
  }
}

// --- S-SELF: our own issues and PRs, bots counted separately -------------------
if (runnable('self')) {
  try {
    const issues = ghJson(['api', '-X', 'GET', `repos/${SELF}/issues`, '-f', 'state=open', '-f', 'per_page=50'])
    const users = issues.filter((item) => item.pull_request === undefined && item.user?.type !== 'Bot')
    const botPrs = issues.filter((item) => item.pull_request !== undefined && item.user?.type === 'Bot')
    const userPrs = issues.filter((item) => item.pull_request !== undefined && item.user?.type !== 'Bot')
    sources.push(
      okSource('S-SELF', {
        open_total: issues.length,
        user_issues: users.length,
        user_prs: userPrs.length,
        bot_prs: botPrs.length,
      }, { user_issues: users.map((item) => ({ number: item.number, title: item.title })) }),
    )
  } catch (error) {
    sources.push(unreadableSource('S-SELF', error instanceof Error ? error.message : String(error)))
  }
}

// --- S-NPM: downloads are the closest thing to "someone installed it" ----------
if (runnable('npm')) {
  try {
    const packages = ['dsh-remedy', 'dsh-remedy-core']
    const detail = {}
    for (const name of packages) {
      const result = runTool('npm', ['view', name, 'dist-tags.latest'])
      if (result.status !== 0) throw new Error(`npm view ${name} failed`)
      const response = await fetch(`https://api.npmjs.org/downloads/point/last-month/${name}`)
      if (!response.ok) throw new Error(`npm downloads ${name}: HTTP ${response.status}`)
      detail[name] = { latest: String(result.stdout).trim(), downloads: await response.json() }
    }
    sources.push(
      okSource('S-NPM', {
        packages: packages.length,
        downloads_last_month: Object.fromEntries(
          packages.map((name) => [name, detail[name].downloads.downloads ?? null]),
        ),
        latest: Object.fromEntries(packages.map((name) => [name, detail[name].latest ?? null])),
      }, detail),
    )
  } catch (error) {
    sources.push(unreadableSource('S-NPM', error instanceof Error ? error.message : String(error)))
  }
}

// --- S-REDDIT: attempt the read, record the refusal instead of guessing --------
if (runnable('reddit')) {
  const urls = [
    'https://www.reddit.com/r/DeepSeek/search.json?q=harness&restrict_sr=1&sort=new&limit=5',
    'https://api.reddit.com/r/DeepSeek/search.json?q=harness&restrict_sr=1&limit=5',
  ]
  const failures = []
  let answered = null
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'dsh-remedy-intake/1 (+https://github.com/jjjjjjjjnnjnn/dsh-remedy)' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      answered = { url, body: await response.json() }
      break
    } catch (error) {
      const cause = error?.cause?.code ?? error?.message ?? String(error)
      failures.push({ url, reason: String(cause) })
    }
  }
  if (answered === null) {
    sources.push(unreadableSource('S-REDDIT', failures.map((failure) => `${failure.url}: ${failure.reason}`).join('; ')))
    notes.push('S-REDDIT: unreadable from this machine; a summary-level read has to come from search or a human')
  } else {
    const children = answered.body?.data?.children ?? []
    sources.push(
      okSource('S-REDDIT', { posts: children.length }, {
        url: answered.url,
        titles: children.map((child) => child.data?.title ?? ''),
      }),
    )
  }
}

// --- S-CENSUS: the mirror of every report, read offline ---------------------------
if (runnable('census')) {
  const dir = flag('sessions', '')
  if (dir === '') {
    sources.push(unreadableSource('S-CENSUS', 'no --sessions directory was given'))
  } else if (!existsSync(dir)) {
    sources.push(unreadableSource('S-CENSUS', `no session directory at ${dir}`))
  } else {
    const cli = abs(join('packages/plugin/dist/cli.js'))
    if (!existsSync(cli)) {
      sources.push(unreadableSource('S-CENSUS', 'packages/plugin/dist/cli.js is missing; run the build first'))
    } else {
      const result = run(process.execPath, [cli, 'scan', dir, '--json'])
      // Exit 1 means "a finding was reported", not "the read failed"; exit 3 is
      // the CLI's own "could not read" code. Parse the report first, then judge.
      let report = null
      try {
        report = JSON.parse(result.stdout)
      } catch {
        report = null
      }
      if (report === null) {
        sources.push(
          unreadableSource('S-CENSUS', `scan exited ${result.status} without JSON: ${String(result.stderr ?? '').trim().slice(0, 200)}`),
        )
      } else {
        sources.push(
          okSource(
            'S-CENSUS',
            {
              files: report.files ?? null,
              attempts: report.attempts ?? null,
              fusion_failures: report.fusion_failures ?? null,
              fused_calls: report.fused_calls ?? null,
              unreadable_lines: report.unreadable_lines ?? null,
            },
            { exit_code: result.status },
          ),
        )
      }
    }
  }
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/collect_leads.mjs',
  generated_at: stamp,
  source: {
    git_head: run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot() }).stdout?.trim() ?? null,
    terms: TERMS,
  },
  intake: summarize(sources),
  notes,
}
const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `intake-${stamp.replaceAll(':', '-')}.json`
const path = abs(join('data/results', name))
if (existsSync(path)) {
  process.stderr.write(`refusing to overwrite existing evidence: data/results/${name}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${createHash('sha256').update(text).digest('hex')}\n`, 'utf8')

process.stdout.write(`RECORDED data/results/${name}\n`)
for (const source of sources) {
  process.stdout.write(
    `${source.ok ? 'OK  ' : 'MISS'} ${source.id}  ${source.ok ? JSON.stringify(source.counts) : source.unreadable_reason}\n`,
  )
}
process.stdout.write(`${payload.intake.note}\n`)
