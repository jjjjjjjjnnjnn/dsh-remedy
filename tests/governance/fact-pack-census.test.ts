import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PATCHES } from 'dsh-remedy-core'

/**
 * P-0049: the fact pack describes a project, and nothing compared it with the
 * project's own registry.
 *
 * Measured on the R57 tree: the pack said `41 patches are registered` while the
 * registry held 48, put P-0013 on `agent/request-error` after P-0045 had moved it
 * to `agent/error`, listed 8 CLI ids against 10 and 21 build-side ids against 24,
 * and said `37 tested` against 39. `gate_copy` compares outward files with the
 * pack and the pack's bytes with the manifest; `facts-truth` reads four kinds of
 * claim from it and none of them is a count. The pack is the file every other
 * number is checked against, so it was the one page nothing measured.
 *
 * Two rules, each with its own negative control:
 *   1. every patch id in the registry appears in the pack;
 *   2. the pack's counts are the registry's counts — the total, the verified and
 *      tested split, and each seam bullet's count and id list.
 *
 * The changelog half of the same defect lives in
 * `tests/governance/facts-truth.test.ts`, where the release-history rules are.
 */

const root = new URL('../../', import.meta.url)
const pack = readFileSync(new URL('docs/copy/facts/public-repo-facts.md', root), 'utf8')

/** The seam census: the bullets between the opening sentence and the verdict line. */
function censusBullets(text: string): string[] {
  const start = text.indexOf('The project is a patch set')
  assert.notEqual(start, -1, 'the pack must keep its seam census paragraph')
  const end = text.indexOf('- 9 patches are `verified`')
  const block = text.slice(start, end === -1 ? undefined : end)
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}

/** Count words the pack uses, plus digits; anything else is null, never a guess. */
const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

function statedCount(token: string): number | null {
  const lower = token.trim().toLowerCase()
  if (/^\d+$/.test(lower)) return Number(lower)
  if (lower in UNITS) return UNITS[lower]!
  if (lower in TEENS) return TEENS[lower]!
  if (lower in TENS) return TENS[lower]!
  const compound = /^([a-z]+)-([a-z]+)$/.exec(lower)
  if (compound !== null && compound[1]! in TENS && compound[2]! in UNITS) return TENS[compound[1]!]! + UNITS[compound[2]!]!
  return null
}

/** Ids named in one bullet, in the order the bullet writes them. */
function idsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/P-\d{4}/g)].map((match) => match[0]))]
}

/** Registry ids per surface, the set a bullet has to reproduce. */
function bySurface(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const patch of PATCHES) {
    out.set(patch.surface, [...(out.get(patch.surface) ?? []), patch.id])
  }
  return out
}

/** The bullet that owns one surface, found by the token the pack names it with. */
function bulletFor(bullets: readonly string[], surface: string): string | undefined {
  const tokens: Record<string, string> = {
    'llm/stream': '`llm/stream`',
    'agent/request-error': '`agent/request-error`',
    'agent/error': '`agent/error`',
    cli: 'CLI half',
    scripts: 'build-side',
    profile: 'measurement rather than a mount',
  }
  const token = tokens[surface]
  return bullets.find((line) => token !== undefined && line.includes(token))
}

test('the fact pack names every patch in the registry', () => {
  const missing = PATCHES.map((patch) => patch.id).filter((id) => !pack.includes(id))
  assert.deepEqual(missing, [], `the fact pack never names ${missing.join(', ')}`)
})

test('the pack registers the number of patches the registry holds', () => {
  const stated = /(\d+) patches are registered/.exec(pack)?.[1]
  assert.notEqual(stated, undefined, 'the pack must keep the "N patches are registered" sentence')
  assert.equal(Number(stated), PATCHES.length, `the pack says ${String(stated)} patches are registered`)

  const verified = PATCHES.filter((patch) => patch.status === 'verified').length
  const tested = PATCHES.filter((patch) => patch.status === 'tested').length
  const verifiedClaim = /(\d+) patches are `verified`/.exec(pack)?.[1]
  const testedClaim = /The other (\d+) are `tested`/.exec(pack)?.[1]
  assert.equal(Number(verifiedClaim), verified, 'the pack counts the verified patches')
  assert.equal(Number(testedClaim), tested, 'the pack counts the tested patches')
  assert.equal(verified + tested, PATCHES.length, 'every patch is verified or tested')
})

test('each seam bullet counts and names exactly the patches on that seam', () => {
  const bullets = censusBullets(pack)
  const surfaces = bySurface()
  for (const [surface, expected] of surfaces) {
    const bullet = bulletFor(bullets, surface)
    assert.ok(typeof bullet === 'string', `the pack has no census bullet for the ${surface} seam`)
    const actual = idsIn(bullet)
    assert.deepEqual(
      [...actual].sort(),
      [...expected].sort(),
      `the ${surface} bullet names ${actual.join(', ')}; the registry holds ${expected.join(', ')}`,
    )
    // The number is a second claim and it must equal the list beside it, or a
    // bullet can drop an id and keep its count.
    const stated = /^(\S+)\s+(?:patch|patches)\b/.exec(bullet)
    assert.notEqual(stated, undefined, `the ${surface} bullet must start with its count`)
    assert.equal(
      statedCount(stated![1]!),
      expected.length,
      `the ${surface} bullet says "${stated![1]!}" and lists ${expected.length}`,
    )
  }
})

test('the rules fail on the shape they were written for', () => {
  // Negative control per rule. If these pass, the rules above prove nothing.
  assert.deepEqual(
    ['P-0001', 'P-0049'].filter((id) => !'P-0001 is here'.includes(id)),
    ['P-0049'],
    'the missing-id rule must see a page that drops one id',
  )
  assert.equal(Number(undefined), Number.NaN, 'an absent count must not compare equal')
  const droppedBullet = 'Ten patches sit on the resident `llm/stream` seam: P-0001, P-0002, P-0003, P-0005, P-0027, P-0030, P-0033, P-0034, P-0036'
  assert.equal(statedCount('Ten'), 10)
  assert.equal(idsIn(droppedBullet).length, 9, 'the bullet drops P-0037 while still saying Ten')
  assert.notEqual(idsIn(droppedBullet).length, statedCount('Ten'), 'a count that disagrees with its list must be visible')
  assert.equal(statedCount('Twenty-one'), 21)
  assert.equal(statedCount('Twenty-four'), 24)
  assert.equal(statedCount('banana'), null, 'an unknown word is null, never a guess')
  assert.equal(statedCount('One'), 1)
})
