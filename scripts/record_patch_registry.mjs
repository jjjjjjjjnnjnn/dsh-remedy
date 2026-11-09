#!/usr/bin/env node
/**
 * Record the built patch registry as SSOT.
 *
 *   node scripts/record_patch_registry.mjs [--stamp <ISO>]
 *
 * The snapshot is the comparison target for `gate_registry`: editing
 * `packages/core/src/registry.ts` without re-recording turns the gate red.
 * The write is atomic-by-refusal: an existing stamp is never overwritten.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, repoRoot, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const stampIndex = argv.indexOf('--stamp')
const rawStamp = stampIndex === -1 ? new Date().toISOString() : (argv[stampIndex + 1] ?? '')
const stamp = isoStamp(rawStamp)
if (stamp === null) {
  process.stderr.write(`invalid --stamp "${rawStamp}": expected ISO-8601, e.g. 2026-11-09T16:40:00.000Z\n`)
  process.exit(2)
}

const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)
const snapshot = core.patchRegistrySnapshot()

const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot(), encoding: 'utf8' })
const status = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot(), encoding: 'utf8' })
const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_patch_registry.mjs',
  generated_at: stamp,
  source: {
    git_head: head.status === 0 ? head.stdout.trim() : null,
    git_dirty: status.status === 0 ? status.stdout.trim() !== '' : null,
  },
  patches: snapshot.patches,
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `patch-registry-${stamp.replaceAll(':', '-')}.json`
const path = abs(join('data/results', name))
if (existsSync(path)) {
  process.stderr.write(`refusing to overwrite existing evidence: data/results/${name}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha256(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\nsha256 ${sha256(text)}\n`)
