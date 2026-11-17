import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PATCHES } from 'dsh-remedy-core'

/**
 * R68: remedy sits on a Cordis waterfall, and nothing recorded who else does.
 * A new plugin could prepend itself (or veto the chain) and every gate stayed
 * green while the wrapper silently stopped running.
 *
 * The compatibility page is the answer a reader acts on, so it may not describe
 * a smaller project than the registry does: every seam the registry declares has
 * to be named there, and the two commands that produce the evidence have to be
 * runnable from the page.
 */

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const page = read('docs/compatibility.md')

/** Seams the registry declares, in the order first seen. */
export function registrySurfaces(): string[] {
  return [...new Set(PATCHES.map((patch) => patch.surface))]
}

export function missingSurfaces(text: string, surfaces: readonly string[]): string[] {
  return surfaces.filter((surface) => !text.includes(surface))
}

test('the compatibility page names every seam the registry declares', () => {
  const surfaces = registrySurfaces()
  assert.ok(surfaces.length >= 6, `the registry declares ${surfaces.length} surfaces`)
  const missing = missingSurfaces(page, surfaces)
  assert.deepEqual(missing, [], `docs/compatibility.md never names ${missing.join(', ')}`)

  // The negative control, on the measured shape: the page that started this
  // round named only the two resident seams and would have passed a rule that
  // checked `llm/stream` alone.
  assert.deepEqual(missingSurfaces('only llm/stream and agent/request-error', surfaces), [
    'scripts',
    'agent/error',
    'cli',
    'profile',
  ])
})

test('the page names the two commands that produce its evidence', () => {
  for (const script of ['scripts/scan_plugin_seams.mjs', 'scripts/bench_repair_overhead.mjs']) {
    assert.ok(page.includes(script), `docs/compatibility.md does not name ${script}`)
  }
  // A reader has to be able to find the artifacts without the page growing a
  // stamp that goes stale: the family name is the stable part.
  assert.match(page, /data\/results\/seam-inventory-/, 'the page must point at the seam-inventory artifact family')
  assert.match(page, /data\/results\/bench-repair-/, 'the page must point at the bench-repair artifact family')

  // The negative control: a page without the commands must be reported.
  const stale = 'waterfall is outermost-first, see the scan.'
  assert.deepEqual(
    ['scripts/scan_plugin_seams.mjs', 'scripts/bench_repair_overhead.mjs'].filter((script) => !stale.includes(script)),
    ['scripts/scan_plugin_seams.mjs', 'scripts/bench_repair_overhead.mjs'],
  )
})

test('the page states the order rule and the veto, not just the topology', () => {
  // The table alone would read as "this is the order"; the rule is what tells a
  // reader the table can change.
  assert.match(page, /outermost-first/i, 'the page must state the waterfall order rule')
  assert.match(page, /next\(\)/, 'the page must state that a listener which skips next() vetoes the rest')
  assert.match(page, /prepend/, 'the page must state that prepend jumps the queue')
})
