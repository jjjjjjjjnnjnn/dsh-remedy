#!/usr/bin/env node
/**
 * Copy the canonical tool-call fixtures into the plugin package before packing.
 *
 * The CLI's `verify` command must work from an installed tarball, not only from a
 * source checkout. `pnpm pack` runs this through `prepack`; the generated
 * directory is gitignored so the canonical bytes stay in `data/fixtures`.
 */

import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs } from './lib/kit.mjs'

const source = abs('data/fixtures/toolcall-fusion')
const target = abs('packages/plugin/fixtures/toolcall-fusion')
mkdirSync(target, { recursive: true })

const files = readdirSync(source)
  .filter((name) => name.endsWith('.json'))
  .sort()
if (files.length === 0) {
  process.stderr.write('sync_fixtures: no canonical fixtures found\n')
  process.exit(3)
}

const checksums = {}
for (const name of files) {
  const bytes = readFileSync(join(source, name))
  cpSync(join(source, name), join(target, name))
  checksums[name] = createHash('sha256').update(bytes).digest('hex')
}

mkdirSync(abs('packages/plugin/fixtures'), { recursive: true })
writeFileSync(
  abs('packages/plugin/fixtures/checksums.json'),
  `${JSON.stringify({ source: 'data/fixtures/toolcall-fusion', files: checksums }, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`sync_fixtures: ${files.length} fixture(s) -> packages/plugin/fixtures/toolcall-fusion\n`)
