#!/usr/bin/env node
/**
 * Copy the canonical tool-call fixtures into the plugin package before packing.
 *
 * The CLI's `verify` command must work from an installed tarball, not only from a
 * source checkout. `pnpm pack` runs this through `prepack`; the generated
 * directory is gitignored so the canonical bytes stay in `data/fixtures`.
 *
 * `--check` compares the canonical bytes against the generated copy without
 * writing anything, so CI can prove they did not drift. Exit codes:
 *   0  in sync
 *   1  drift (the differing files are printed)
 *   3  no canonical fixtures (same as the default mode)
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs } from './lib/kit.mjs'

const CHECK = process.argv.includes('--check')
const SOURCE_LABEL = 'data/fixtures/toolcall-fusion'
const source = abs(SOURCE_LABEL)
const target = abs('packages/plugin/fixtures/toolcall-fusion')
const checksumsPath = abs('packages/plugin/fixtures/checksums.json')

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const files = readdirSync(source)
  .filter((name) => name.endsWith('.json'))
  .sort()
if (files.length === 0) {
  process.stderr.write('sync_fixtures: no canonical fixtures found\n')
  process.exit(3)
}

if (CHECK) {
  const drift = []
  const packed = existsSync(target) ? readdirSync(target).filter((name) => name.endsWith('.json')).sort() : []

  for (const name of files) {
    const canonical = join(source, name)
    const copy = join(target, name)
    if (!packed.includes(name)) {
      drift.push(`missing from packages/plugin/fixtures/toolcall-fusion: ${name}`)
      continue
    }
    if (!readFileSync(copy).equals(readFileSync(canonical))) {
      drift.push(`bytes drifted: ${name} (${sha256(copy)} != ${sha256(canonical)})`)
    }
  }
  for (const name of packed) {
    if (!files.includes(name)) drift.push(`not a canonical fixture: ${name}`)
  }

  if (!existsSync(checksumsPath)) {
    drift.push('missing: packages/plugin/fixtures/checksums.json')
  } else {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(checksumsPath, 'utf8'))
    } catch (error) {
      drift.push(`unreadable: packages/plugin/fixtures/checksums.json (${error instanceof Error ? error.message : String(error)})`)
    }
    const sums = manifest?.files ?? {}
    if (manifest !== undefined) {
      if (manifest.source !== SOURCE_LABEL) drift.push(`checksums.json source is ${JSON.stringify(manifest.source)}; expected ${JSON.stringify(SOURCE_LABEL)}`)
      for (const name of files) {
        const recorded = sums[name]
        if (recorded === undefined) {
          drift.push(`checksums.json is missing ${name}`)
          continue
        }
        const actual = sha256(join(source, name))
        if (recorded !== actual) drift.push(`checksum drift: ${name} (${recorded} != ${actual})`)
      }
      for (const name of Object.keys(sums)) {
        if (!files.includes(name)) drift.push(`checksums.json lists a non-canonical fixture: ${name}`)
      }
    }
  }

  if (drift.length > 0) {
    for (const line of drift) process.stderr.write(`sync_fixtures --check: ${line}\n`)
    process.stderr.write(`sync_fixtures --check: ${drift.length} problem(s); run scripts/sync_fixtures.mjs to regenerate\n`)
    process.exit(1)
  }
  process.stdout.write(`sync_fixtures --check: ${files.length} fixture(s) in sync with ${SOURCE_LABEL}\n`)
  process.exit(0)
}

mkdirSync(target, { recursive: true })

const checksums = {}
for (const name of files) {
  const bytes = readFileSync(join(source, name))
  cpSync(join(source, name), join(target, name))
  checksums[name] = createHash('sha256').update(bytes).digest('hex')
}

mkdirSync(abs('packages/plugin/fixtures'), { recursive: true })
writeFileSync(checksumsPath, `${JSON.stringify({ source: SOURCE_LABEL, files: checksums }, null, 2)}\n`, 'utf8')
process.stdout.write(`sync_fixtures: ${files.length} fixture(s) -> packages/plugin/fixtures/toolcall-fusion\n`)
