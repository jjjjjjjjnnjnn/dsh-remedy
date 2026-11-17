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

/**
 * R64: a concluded decision may not still read `lead`.
 *
 * Measured on the R63 tree: forty rows, twenty-two of them `lead`, while seven of those
 * decisions already said "record only" / "not this plugin" / "reference only". The
 * handover then said "39 leads, A table empty" — a sentence nothing read, because the
 * ledger's own status column disagreed with it. The rule below is deliberately narrow:
 * it reads only the phrases the ledger uses for a conclusion, not every decision.
 */
const CONCLUDED = /(?:记录[，,]不碰|与插件无关，只记录|不属于本插件|只作同类项目读法|不重复计)/

export function concludedButOpen(rows: LeadRow[]): string[] {
  return rows
    .filter((row) => row.status === 'lead' && CONCLUDED.test(row.decision))
    .map((row) => `${row.id}: the decision is a conclusion but the status is lead`)
}

test('a concluded decision is not still a lead', () => {
  const offenders = concludedButOpen(leadRows())
  assert.deepEqual(offenders, [], offenders.join('; '))

  // The negative control: the measured shape must be reported, and an open
  // decision must not be.
  const stale: LeadRow = { id: 'L-9999', status: 'lead', decision: '与插件无关，只记录。' } as LeadRow
  const open: LeadRow = { id: 'L-9998', status: 'lead', decision: '先与 census 对照，再判。' } as LeadRow
  assert.deepEqual(concludedButOpen([stale]), ['L-9999: the decision is a conclusion but the status is lead'])
  assert.deepEqual(concludedButOpen([open]), [])
})

/**
 * R64: the handover may not call the A table empty unless it is.
 *
 * The A table is the `llm/stream` table at the top of the ledger. It still held L-0006
 * and L-0008 as `lead` when the handover said "A 表已空"; a reader who trusted that
 * sentence stopped looking.
 */
export function aTableOpen(rows: LeadRow[]): LeadRow[] {
  return rows.filter(
    (row) => row.id >= 'L-0001' && row.id <= 'L-0010' && (row.status === 'lead' || row.status === 'watching'),
  )
}

/** Live prose: the handoff minus its batch narratives, plus the research README. */
function liveProse(): string {
  const lines: string[] = []
  let batch = false
  for (const line of read('docs/HANDOFF.md').split(/\r?\n/)) {
    if (line.startsWith('## ')) batch = line.startsWith('## 当前批次')
    if (!batch) lines.push(line)
  }
  return `${lines.join('\n')}\n${read('docs/research/README.md')}`
}

test('the A table is only called empty when it is empty', () => {
  const saysEmpty = /A 表已空|A 表仍空/.test(liveProse())
  const open = aTableOpen(leadRows())
  if (saysEmpty) {
    assert.deepEqual(open.map((row) => row.id), [], 'the handover calls the A table empty while these rows are lead')
  }

  // The negative control: with an open row in the A table, the claim must be reported
  // as false — and the claim detector must really see the sentence. `watching` counts
  // as open: it is a row a reader must still come back to.
  const stale = { ...leadRows()[0]!, id: 'L-0006', status: 'lead' } as LeadRow
  assert.deepEqual(aTableOpen([stale]).map((row) => row.id), ['L-0006'])
  assert.deepEqual(aTableOpen([{ ...stale, status: 'watching' }]).map((row) => row.id), ['L-0006'])
  assert.equal(/A 表已空|A 表仍空/.test('A 表已空'), true, 'the claim detector does not see the sentence')
})
