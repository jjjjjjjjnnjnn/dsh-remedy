import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const exists = (path: string) => existsSync(new URL(path, root))

const handoff = read('docs/HANDOFF.md')

/** Any `x-2026-...Z.json` token, with or without the `data/results/` prefix. */
const ARTIFACT = /(?:data\/results\/)?([a-z][a-z-]*-\d{4}-\d{2}-\d{2}T[\d.:-]+Z\.json)/g

const STAMP = /^.*?-(\d{4}-\d{2}-\d{2}T[\d.:-]+Z)\.json$/
const stampOf = (name: string): string => name.match(STAMP)?.[1] ?? name

/**
 * The handoff has two contracts, and they are checked differently.
 *
 *  - The **evidence index** is what a reader opens to verify a claim. Every row
 *    must resolve, and the hash beside a row must be that file's hash. It has no
 *    history: a row is either true now or marked `（已删）`.
 *  - The **batch sections** are a dated record. A row there may quote a hash or a
 *    stamp that was true when the batch closed, because rewriting yesterday's
 *    record to match today's file destroys the only account of what happened. The
 *    evidence files behind them have repeatedly been renamed to a newer stamp, so
 *    demanding that old prose resolves would mean deleting the history.
 *
 * The live part (the status table and "第一件事") belongs to the first contract:
 * it tells a successor what to do next, so it may not describe a state that has
 * moved on.
 */
const evidenceIndexStart = handoff.indexOf('## 证据索引')
if (evidenceIndexStart < 0) throw new Error('the handoff must keep its evidence index')

const tableStart = handoff.indexOf('\n|', evidenceIndexStart)
const tableEnd = handoff.indexOf('\n\n', tableStart)
const evidenceTable = handoff.slice(tableStart, tableEnd)

/** The `（已删）` rows, which the index itself declares are gone. */
function declaredGone(): Set<string> {
  const gone = new Set<string>()
  for (const line of evidenceTable.split(/\r?\n/)) {
    if (!line.includes('（已删）')) continue
    for (const match of line.matchAll(ARTIFACT)) gone.add(match[1] as string)
  }
  return gone
}

test('every evidence-index row resolves, or is declared deleted on its own row', () => {
  // The index is how a reader checks a claim without rerunning anything. A row
  // that points at a file nobody can open is worse than no row: it reads as
  // proof. `（已删）` keeps "gone on purpose" distinguishable from "wrong".
  const gone = declaredGone()
  const missing: string[] = []
  for (const line of evidenceTable.split(/\r?\n/)) {
    for (const match of line.matchAll(ARTIFACT)) {
      const name = match[1] as string
      if (gone.has(name) || line.includes('（已删）')) continue
      if (!exists(`data/results/${name}`)) missing.push(name)
    }
  }
  assert.deepEqual(missing, [], `the evidence index points at artifacts that do not exist: ${missing.join(', ')}`)
  assert.ok(gone.size > 0, 'the four historical rows must stay marked as deleted')
})

test('the hash beside an evidence-index row is the hash of that row\'s file', () => {
  // R21 wrote `patch-registry-...19-35...` and called its hash `900820ae…` while
  // the file hashes to `96f9144f…`. Nothing compared them: a hash in prose has no
  // sibling `.sha256` check, and the gate only reads `data/results`.
  const wrong: string[] = []
  let checked = 0
  for (const line of evidenceTable.split(/\r?\n/)) {
    if (!line.trim().startsWith('|') || line.includes('（已删）')) continue
    const names = [...line.matchAll(ARTIFACT)].map((match) => match[1] as string)
    const hashes = [...line.matchAll(/\b([0-9a-f]{8})[0-9a-f]{0,56}…/g)].map((match) => match[1] as string)
    if (names.length !== 1 || hashes.length !== 1) continue
    const name = names[0] as string
    if (!exists(`data/results/${name}`)) continue
    const actual = createHash('sha256').update(read(`data/results/${name}`)).digest('hex')
    checked += 1
    if (!actual.startsWith(hashes[0] as string)) {
      wrong.push(`${name}: index says ${hashes[0]}…, file is ${actual.slice(0, 8)}…`)
    }
  }
  assert.deepEqual(wrong, [], `the index quotes a hash that is not the artifact's: ${wrong.join('; ')}`)
  assert.ok(checked > 3, `the index must quote hashes for its snapshots, checked ${checked}`)
})

test('each artifact family marks exactly one row as current, and it is the newest one recorded', () => {
  // Three rows were marked **当前** at once after 0.3.8: two registry snapshots and
  // a gate record from the release before. A reader cannot tell which artifact the
  // project stands on, and the newest one was missing from the index entirely.
  const familyOf = (name: string): string | null => {
    if (name.startsWith('patch-registry-')) return 'patch-registry'
    if (name.startsWith('gates-mutate-')) return 'gates-mutate'
    if (name.startsWith('gates-')) return 'gates'
    return null
  }

  const newest = new Map<string, string>()
  for (const entry of readdirSync(new URL('data/results/', root))) {
    if (!/\.json$/.test(entry)) continue
    const family = familyOf(entry)
    if (family === null) continue
    const best = newest.get(family)
    if (best === undefined || stampOf(entry).localeCompare(best) > 0) newest.set(family, stampOf(entry))
  }

  const marked = new Map<string, string[]>()
  for (const line of evidenceTable.split(/\r?\n/)) {
    if (!line.includes('**当前**')) continue
    for (const match of line.matchAll(ARTIFACT)) {
      const name = match[1] as string
      const family = familyOf(name)
      if (family === null) continue
      marked.set(family, [...(marked.get(family) ?? []), name])
    }
  }
  assert.ok(marked.size > 0, 'the index must mark the current artifact of each family')
  for (const [family, names] of marked) {
    assert.equal(
      names.length,
      1,
      `${family}: ${names.length} rows are marked current (${names.join(', ')}); only one may be`,
    )
    assert.equal(
      stampOf(names[0] as string),
      newest.get(family),
      `${names[0]} is marked current but the newest ${family} artifact is ${newest.get(family)}`,
    )
  }
})

/** The part of the handoff a successor acts on, as opposed to the batch history. */
function liveSections(): string {
  // The status table and "第一件事" only: the batch sections are a dated record
  // (their stamps are the stamps of that day, not of today's directory), so they
  // belong to the second contract and are not checked for resolvability here.
  const statusEnd = handoff.indexOf('## 当前批次（R')
  const firstThing = handoff.indexOf('## 下一位 agent 的第一件事')
  assert.ok(statusEnd > 0, 'the handoff must keep its batch sections')
  assert.ok(firstThing > 0, 'the handoff must keep "下一位 agent 的第一件事"')
  return `${handoff.slice(0, statusEnd)}\n${handoff.slice(firstThing, evidenceIndexStart)}`
}

test('every artifact cited in the live sections is listed in the evidence index', () => {
  // The index is the table a reader trusts. A successor who is told "see
  // data/results/foo.json" and cannot find it in the index has no way to check the
  // claim without walking the directory. After 0.3.8 five artifacts were cited in
  // the status table and absent from the index.
  const live = liveSections()
  const cited = new Set([...live.matchAll(ARTIFACT)].map((match) => match[1] as string))
  assert.ok(cited.size > 0, 'the live sections must cite at least one artifact')
  const missing = [...cited].filter((name) => !evidenceTable.includes(name))
  assert.deepEqual(missing, [], `the live sections cite artifacts the evidence index does not list: ${missing.join(', ')}`)
})

test('the live sections do not describe a state that has moved on', () => {
  const stale = [
    { pattern: /两个 profile (?:仍|还)?装(?:着|的是) 0\.3\.[0-7]\b/, what: 'profiles on an older release' },
    { pattern: /`?latest`?(?: 是| =) 0\.3\.[0-7]\b/, what: 'a registry latest from a release that has moved on' },
    { pattern: /\.tmp\/pack(?:1[0-9]|20)\/dsh-remedy-0\.3\.[0-7][\w-]*\.tgz/, what: 'a profile tarball from an older release' },
  ]
  const offenders = liveSections()
    .split(/\r?\n/)
    .filter((line) => stale.some((rule) => rule.pattern.test(line)))
    .map((line) => line.trim().slice(0, 90))
  assert.deepEqual(offenders, [], 'the live handoff tells a new session to redo finished work')
})
