import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { desktopVersionOf, readRuntimeVersion, runtimeCandidates } from '../../scripts/lib/runtime-version.mjs'

/** The version the runtime itself names, never a literal from prose. */

test('a runtime file declares its own desktop version', () => {
  assert.equal(desktopVersionOf({ desktopVersion: '0.2.2-rc.3' }), '0.2.2-rc.3')
})

test('a file without a version answers null instead of inventing one', () => {
  // The record this guards: `record_live_mount.mjs` carried `'0.2.2-rc.1'` as a
  // literal for eleven releases, so every artifact from rc.3 onward named a
  // runtime that never ran. A missing field must be null, not a fallback.
  for (const parsed of [null, {}, { desktopVersion: 3 }, { desktopVersion: '   ' }, 'not-json']) {
    assert.equal(desktopVersionOf(parsed), null, `invented a version from ${JSON.stringify(parsed)}`)
  }
})

test('the first candidate carrying a version wins, and the file it read is named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-version-'))
  const installed = join(dir, 'installed.json')
  const lagging = join(dir, 'lagging.json')
  writeFileSync(installed, JSON.stringify({ desktopVersion: '0.2.2-rc.3' }), 'utf8')
  writeFileSync(lagging, JSON.stringify({ desktopVersion: '0.2.2-rc.1' }), 'utf8')

  const answer = readRuntimeVersion([installed, lagging])
  assert.equal(answer.version, '0.2.2-rc.3')
  assert.equal(answer.source, installed)
  assert.match(String(answer.sha256), /^[0-9a-f]{64}$/)

  // The inverse order is the bug: the lagging copy under ~/.dsh would win and
  // the artifact would name a runtime that had already been replaced.
  assert.equal(readRuntimeVersion([lagging]).version, '0.2.2-rc.1')
})

test('an unreadable or versionless candidate is skipped, not accepted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-version-'))
  const broken = join(dir, 'broken.json')
  const good = join(dir, 'good.json')
  writeFileSync(broken, '{ not json', 'utf8')
  writeFileSync(good, JSON.stringify({ desktopVersion: '0.2.3' }), 'utf8')
  assert.equal(readRuntimeVersion([broken, good]).version, '0.2.3')
})

test('with nothing readable the answer is three nulls, not a guess', () => {
  const answer = readRuntimeVersion(['/definitely/not/here.json', ''])
  assert.deepEqual(answer, { version: null, source: null, sha256: null })
})

test('the candidates put the installed app before the lagging per-profile copy', () => {
  const candidates = runtimeCandidates({ LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local' }, 'C:\\Users\\alice\\.dsh')
  assert.equal(candidates.length, 2)
  assert.ok(candidates[0]?.includes('Programs'))
  assert.ok(candidates[1]?.includes('.dsh'))
  // A machine with no LOCALAPPDATA (Linux) still gets the per-profile answer.
  assert.equal(runtimeCandidates({}, '/home/alice/.dsh').length, 1)
})
