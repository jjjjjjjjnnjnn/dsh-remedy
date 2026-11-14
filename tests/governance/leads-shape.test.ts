import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

interface LeadRow {
  id: string
  source: string
  kind: string
  depth: string
  reported: string
  version: string
  legClass: string
  seam: string
  status: string
  decision: string
}

/** The sources are registered in one place; a lead may not invent a new one. */
function registeredSources(): Set<string> {
  const text = read('docs/research/sources.md')
  const rows = text.split(/\r?\n/).filter((line) => line.startsWith('| S-'))
  return new Set(rows.map((row) => (row.split('|')[1] ?? '').trim()).filter(Boolean))
}

const SOURCE_KINDS = new Set(['dsh', 'reddit', 'npm', 'self', 'market', 'code', 'census'])
const DEPTHS = new Set(['full', 'summary', 'title'])

function leadRows(): LeadRow[] {
  return read('docs/research/leads.md')
    .split(/\r?\n/)
    .filter((line) => /^\| L-\d{4} \|/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim())
      return {
        id: cells[1] ?? '',
        source: cells[2] ?? '',
        kind: (cells[3] ?? '').replaceAll('`', ''),
        depth: (cells[4] ?? '').replaceAll('`', ''),
        reported: cells[5] ?? '',
        version: cells[6] ?? '',
        legClass: cells[7] ?? '',
        seam: cells[8] ?? '',
        status: cells[9] ?? '',
        decision: cells[10] ?? '',
      }
    })
}

test('every source kind is registered in sources.md', () => {
  const sources = registeredSources()
  assert.ok(sources.size >= 5, `sources.md registers ${sources.size} sources`)
  for (const row of leadRows()) {
    assert.ok(SOURCE_KINDS.has(row.kind), `${row.id} has an unknown source_kind "${row.kind}"`)
  }
})

test('the read depth is a closed vocabulary', () => {
  for (const row of leadRows()) {
    assert.ok(DEPTHS.has(row.depth), `${row.id} has an unknown read_depth "${row.depth}"`)
  }
})

test('a lead read only as a summary cannot claim a reproduction', () => {
  for (const row of leadRows()) {
    if (row.depth !== 'summary') continue
    assert.ok(
      !row.status.includes('reproduced') && !row.status.includes('patched'),
      `${row.id} is read only as a summary but claims ${row.status}`,
    )
  }
})

test('a patched lead names the patch that covers it', () => {
  for (const row of leadRows()) {
    if (!row.status.includes('patched')) continue
    assert.match(row.decision, /P-\d{4}/, `${row.id} is patched but its decision names no patch`)
  }
})

test('a lead that is read only as a summary says so in its decision', () => {
  for (const row of leadRows()) {
    if (row.depth === 'full') continue
    assert.match(
      row.decision,
      /摘要|summary|正文被|只读到/,
      `${row.id} is not read in full, so the decision must say what was actually read`,
    )
  }
})

test('the reddit rows exist and are counted', () => {
  const reddit = leadRows().filter((row) => row.kind === 'reddit')
  assert.ok(reddit.length >= 4, `expected at least four reddit leads, got ${reddit.length}`)
  for (const row of reddit) assert.equal(row.depth, 'summary')
})
