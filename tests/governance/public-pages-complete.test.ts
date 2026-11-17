import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PATCHES } from 'dsh-remedy-core'

/**
 * P-0046: the first screens can be one patch short and every gate stays green.
 *
 * Measured on the 0.4.15 tree: `README.md` and `README.zh-CN.md` both claimed
 * forty-four patches and enumerated the tested ones, but **P-0043 appeared in
 * neither page**, and their "Package sizes" list started at 0.4.14 while the
 * release-status sentence above it called 0.4.15 the published release. `gate_copy`
 * checks that every number exists in the fact pack and that the bytes match the
 * recorded draft; it has no opinion about a page that omits a row it should carry.
 *
 * Two rules, each with its own negative control:
 *   1. every patch id in the registry appears on each first screen;
 *   2. the version the status sentence calls published has its package-size rows,
 *      and they are the first rows of that list.
 */

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

/** Ids from `ids` that `text` never names. Exported by being the only rule both tests use. */
function missingIds(text: string, ids: readonly string[]): string[] {
  return ids.filter((id) => !text.includes(id))
}

/** The version a status sentence calls published, and the first package-size row. */
function publishedVersionOf(text: string): string | null {
  const claim =
    /Release status: `(\d+\.\d+\.\d+)` is published/.exec(text) ?? /发布状态：`(\d+\.\d+\.\d+)` 已发布/.exec(text)
  return claim?.[1] ?? null
}

function firstSizeRowVersion(text: string): string | null {
  const row = /^- (\d+\.\d+\.\d+) plugin[:：]/m.exec(text)
  return row?.[1] ?? null
}

test('both first screens name every patch in the registry', () => {
  const ids = PATCHES.map((patch) => patch.id)
  for (const path of ['README.md', 'README.zh-CN.md']) {
    const missing = missingIds(read(path), ids)
    assert.deepEqual(missing, [], `${path} never names ${missing.join(', ')}`)
  }
})

test('the first screen names the published version it calls latest, with its sizes', () => {
  for (const path of ['README.md', 'README.zh-CN.md']) {
    const text = read(path)
    const published = publishedVersionOf(text)
    assert.notEqual(published, null, `${path} must keep the release-status sentence`)
    const first = firstSizeRowVersion(text)
    assert.equal(
      first,
      published,
      `${path} calls ${String(published)} the published release but its package-size list starts at ${String(first)}`,
    )
    // A size claim without the other package is half a claim: 0.4.15's core row is
    // what makes the plugin row verifiable against the pin.
    assert.ok(
      new RegExp(`^- ${String(published)} core[:：]`, 'm').test(text),
      `${path} lists the plugin tarball for ${String(published)} but not the engine's`,
    )
  }
})

/**
 * The opening count and the seam table, measured on the R65 tree.
 *
 * `README.md` and `README.zh-CN.md` both opened with "fifty-one defects" while
 * the same pages said 52 two paragraphs later and the registry held 52, and the
 * CLI row of the seam table named twelve patches while the registry and the fact
 * pack both put thirteen there (P-0042 appeared only in a limits sentence). The
 * rules above require every id to appear *somewhere*, which is satisfied by a
 * page whose count is wrong and whose table is one row short.
 */

/** Chinese numerals up to ninety-nine, which is all a patch count needs. */
const ZH_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

function parseChineseCount(token: string): number | null {
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10)
  const tens = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(token)
  if (tens !== null) {
    const high = tens[1] === undefined ? 1 : ZH_DIGITS[tens[1]]
    const low = tens[2] === undefined ? 0 : ZH_DIGITS[tens[2]]
    return high === undefined || low === undefined ? null : high * 10 + low
  }
  const single = ZH_DIGITS[token]
  return single === undefined ? null : single
}

/** The count the first sentence puts in front of the thing the project registers. */
function openingPatchCount(text: string): number | null {
  const en = /—\s+(?:an?\s+)?([A-Za-z]+(?:-[A-Za-z]+)?|\d+)\s+defects/.exec(text)
  if (en !== null) return statedEnglishCount(en[1] ?? '')
  const zh = /：([〇零一二三四五六七八九十\d]+)\s*个缺陷/.exec(text)
  if (zh !== null) return parseChineseCount(zh[1] ?? '')
  return null
}

const EN_UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}
const EN_TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

function statedEnglishCount(token: string): number | null {
  const lower = token.toLowerCase()
  if (/^\d+$/.test(lower)) return Number.parseInt(lower, 10)
  if (lower in EN_UNITS) return EN_UNITS[lower]!
  if (lower in EN_TEENS) return EN_TEENS[lower]!
  if (lower in EN_TENS) return EN_TENS[lower]!
  const compound = /^([a-z]+)-([a-z]+)$/.exec(lower)
  if (compound !== null) {
    const high = EN_TENS[compound[1]!]
    const low = EN_UNITS[compound[2]!]
    if (high !== undefined && low !== undefined) return high + low
  }
  return null
}

/** The seam a table row names, or null when the row is one the registry cannot answer for. */
function surfaceOfLabel(label: string): string | null {
  const ticked = /`([^`]+)`/.exec(label)?.[1]
  if (ticked !== undefined) {
    return ['llm/stream', 'agent/request-error', 'agent/error'].includes(ticked) ? ticked : null
  }
  const plain = label.replace(/\s+/g, ' ').trim()
  if (/^(CLI|命令行)$/i.test(plain)) return 'cli'
  if (/^(build side|构建侧)$/.test(plain)) return 'scripts'
  if (/^(measured, not mounted|测过但没挂)$/.test(plain)) return 'profile'
  return null
}

/** The rows of the seam table: its label and the ids it enumerates. */
function seamRows(text: string): { label: string; ids: string[] }[] {
  const lines = text.split(/\r?\n/)
  const header = lines.findIndex((line) => /^\| (seam \| patches|接缝 \| 补丁) /.test(line))
  assert.notEqual(header, -1, 'the page must keep a seam table with a patches column')
  const rows: { label: string; ids: string[] }[] = []
  for (let index = header + 2; index < lines.length && lines[index]!.startsWith('|'); index += 1) {
    const cells = lines[index]!.split('|').map((cell) => cell.trim())
    rows.push({ label: cells[1] ?? '', ids: [...new Set(cells[2]?.match(/P-\d{4}/g) ?? [])] })
  }
  return rows
}

test('both first screens open with the number of patches the registry holds', () => {
  for (const path of ['README.md', 'README.zh-CN.md']) {
    const text = read(path)
    const stated = openingPatchCount(text)
    assert.notEqual(stated, null, `${path} must keep an opening sentence that counts the patch set`)
    assert.equal(
      stated,
      PATCHES.length,
      `${path} opens with ${String(stated)} defects while the registry holds ${PATCHES.length}`,
    )
  }
})

test('each seam row names exactly the patches the registry puts on that seam', () => {
  const bySurface = new Map<string, string[]>()
  for (const patch of PATCHES) {
    const ids = bySurface.get(patch.surface) ?? []
    ids.push(patch.id)
    bySurface.set(patch.surface, ids)
  }
  const expectedIds = PATCHES.map((patch) => patch.id).sort()

  for (const path of ['README.md', 'README.zh-CN.md']) {
    const rows = seamRows(read(path))
    assert.ok(rows.length > 0, `${path} must keep its seam table`)
    const seen: string[] = []
    for (const row of rows) {
      const surface = surfaceOfLabel(row.label)
      assert.notEqual(surface, null, `${path}: the seam row "${row.label}" is not one the registry can answer for`)
      const expected = [...(bySurface.get(surface ?? '') ?? [])].sort()
      assert.deepEqual(
        [...row.ids].sort(),
        expected,
        `${path}: the ${String(surface)} row names ${row.ids.length} patches while the registry puts ${expected.length} there`,
      )
      seen.push(...row.ids)
    }
    assert.deepEqual([...seen].sort(), expectedIds, `${path}: the seam table does not cover the registry`)
  }
})

test('the count and seam rules fail on the shapes they were written for', () => {
  // Measured on the R65 tree: fifty-one in front of fifty-two, and a CLI row
  // missing P-0042. Both must be visible to the parsers, or the rules prove
  // nothing about the pages they read.
  assert.equal(openingPatchCount('dsh-remedy is a patch set — fifty-one defects, each registered'), 51)
  assert.equal(openingPatchCount('补丁集：五十一个缺陷，每一个都登记了'), 51)
  assert.equal(openingPatchCount('补丁集：52 个缺陷'), 52)
  assert.equal(openingPatchCount('no count here'), null)
  assert.notEqual(openingPatchCount('— fifty-one defects'), PATCHES.length)

  const stale = '| seam | patches | what |\n|---|---|---|\n| CLI | P-0004, P-0006 | x |\n'
  const row = seamRows(stale)[0]!
  assert.equal(surfaceOfLabel(row.label), 'cli')
  assert.deepEqual(row.ids, ['P-0004', 'P-0006'])
  assert.deepEqual(
    [...row.ids].sort(),
    ['P-0004', 'P-0006'],
    'the parser sees the row; the rule above is what compares it with the registry',
  )
  assert.notDeepEqual([...row.ids].sort(), ['P-0004', 'P-0006', 'P-0042'].sort())
  assert.equal(surfaceOfLabel('a row nobody can place'), null)
})

test('the rules fail on the shape they were written for', () => {
  // The negative control: a page that drops one id, and a page whose status row
  // names a version it has no sizes for. If these pass, the rules above prove
  // nothing about the pages.
  const ids = ['P-0001', 'P-0043']
  assert.deepEqual(missingIds('P-0001 is here', ids), ['P-0043'])
  const page = 'Release status: `0.4.16` is published and is the registry `latest`.\n\nPackage sizes:\n\n- 0.4.14 plugin: x\n'
  assert.equal(publishedVersionOf(page), '0.4.16')
  assert.equal(firstSizeRowVersion(page), '0.4.14')
  assert.notEqual(publishedVersionOf(page), firstSizeRowVersion(page), 'the mismatch must be visible')
})
