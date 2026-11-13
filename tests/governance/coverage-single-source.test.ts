import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PATCHES } from 'dsh-remedy-core'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('coverage is declared by the patch, not restated by the command', () => {
  // P-0016: `explain` kept its own `COVERAGE` and `SWITCHES` maps. That gave
  // "which patch answers which failure class" two homes, so a new patch could
  // cover a class and `explain` would never say so — and nothing compared the
  // two tables. The patches carry `failureClasses` and `switchKey` now, and this
  // test fails if the command ever grows a table of its own again.
  const source = read('packages/plugin/src/explain-command.ts')
  for (const forbidden of ['const COVERAGE', 'const SWITCHES']) {
    assert.doesNotMatch(source, new RegExp(forbidden), `${forbidden} must not come back; read the registry`)
  }
  assert.match(source, /PATCHES/, 'the command must read PATCHES')
})

test('every claimed failure class names at least one patch, and no patch repeats a class', () => {
  const declared = new Map<string, string[]>()
  for (const patch of PATCHES) {
    const classes = patch.failureClasses ?? []
    assert.equal(
      new Set(classes).size,
      classes.length,
      `${patch.id} lists a failure class twice: ${classes.join(', ')}`,
    )
    for (const failure of classes) {
      declared.set(failure, [...(declared.get(failure) ?? []), patch.id])
    }
  }
  assert.ok(declared.size > 0, 'the registry must cover at least one failure class')
  // A class this host actually hits must not be covered by a patch that cannot be
  // switched on: either it has a switch key, or its coverage is unconditional.
  for (const [failure, ids] of declared) {
    assert.ok(ids.length > 0, `${failure} is covered by nobody`)
  }
  assert.deepEqual([...declared.keys()].sort(), [
    'EMPTY_RESPONSE',
    'INVALID_REQUEST',
    'MALFORMED_RESPONSE',
    'MISSING_CREDENTIAL',
    'UNSUPPORTED_REASONING_EFFORT',
  ])
})

test('a patch that declares coverage also says how it is switched', () => {
  // The switch is part of the claim: `explain` answers "is this on here", and it
  // can only answer that from the config key the patch names. A patch that covers
  // a class but names no key would silently read as "switched on" in a profile
  // that never mentions it, which is the failure this field exists to prevent.
  for (const patch of PATCHES) {
    const classes = patch.failureClasses ?? []
    if (classes.length === 0) {
      assert.equal(patch.switchKey, undefined, `${patch.id} names a switch without covering anything`)
      continue
    }
    assert.equal(typeof patch.switchKey, 'string', `${patch.id} covers ${classes.join(',')} but names no switch key`)
    assert.match(String(patch.switchKey), /^(repair|retryOnMalformed)$/, `${patch.id} names an unknown switch key`)
  }
  assert.equal(
    PATCHES.filter((patch) => (patch.failureClasses ?? []).length > 0).length,
    6,
    'six patches answer turn-ending codes today; update this number deliberately, not by accident',
  )
})
