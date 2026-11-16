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
