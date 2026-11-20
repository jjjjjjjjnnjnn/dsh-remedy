#!/usr/bin/env node
/**
 * One inventory pass over an installed DSH profile.
 *
 *   node scripts/scan_plugin_seams.mjs --profile desktop --stamp 2026-11-18T08:00:00.000Z
 *
 * What it answers: on which DSH seams do the installed packages register, and in
 * what order will `llm/stream` (a Cordis waterfall) run them?
 *
 * What it does NOT do: it never loads a plugin, never starts DSH, never writes to
 * the profile. The read-only walker and the classifier both live in core
 * (`packages/core/src/seams-{fs,}.ts`) so this recorder and the shipped
 * `dsh-remedy seams` command cannot drift. A registration it cannot read is
 * reported under `read`, never as zero.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { scanProfile } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const has = (name) => argv.includes(`--${name}`)

const profileName = flag('profile', 'desktop')
const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('scan_plugin_seams: --stamp must be ISO-8601\n')
  process.exit(2)
}

const RESERVED = ['remedy_unattributed']
const profileDir = join(homedir(), '.dsh', 'profiles', profileName)
if (!existsSync(join(profileDir, 'package.json'))) {
  process.stderr.write(`scan_plugin_seams: no profile at ${profileDir}\n`)
  process.exit(3)
}

let bundles = []
try {
  const profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  bundles = Array.isArray(profile?.dsh?.profile?.bundles) ? profile.dsh.profile.bundles : []
} catch {
  // An unreadable bundle order is reported, not guessed.
}

const scan = scanProfile(profileDir)
const { buildInventory } = await import('../packages/core/dist/index.js')
const inventory = buildInventory(scan.packages)
const payload = {
  schema_version: 1,
  produced_by: 'scripts/scan_plugin_seams.mjs',
  generated_at: stamp,
  question: 'Which installed packages register on which DSH seam, and in what order does the llm/stream waterfall run them?',
  profile: {
    name: profileName,
    dir: profileDir,
    packages: scan.packages.length,
    bundle_order: bundles,
  },
  rule: {
    waterfall:
      'Cordis Context#waterfall runs listeners outermost-first; a listener that does not call next() vetoes the rest of the chain; register() unshifts when the registration passes prepend: true. So the latest prepend is outermost and, among plain registrations, the earliest load index is outermost.',
    reads: 'it reads registrations and options; it cannot see a listener that a plugin registers dynamically after load',
  },
  reserved: RESERVED,
  seams: inventory.seams,
  conflicts: inventory.conflicts,
  warnings: inventory.warnings,
  read: {
    files: scan.files_read,
    bytes: scan.bytes_read,
    skipped_large_files: scan.skipped_large_files,
    unreadable_dirs: scan.unreadable_dirs,
  },
  limits: [
    'one profile on one machine; it describes the packages installed now, not a compatibility matrix',
    'it reads built JavaScript for the strings a registration uses; a plugin that registers through an indirection is reported as absent, not as compatible',
    'it records order, not behaviour: whether a listener mutates chunks is not decidable by reading call sites',
  ],
}

const core = await import('../packages/core/dist/index.js')
const redacted = core.redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out', `data/results/seam-inventory-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(abs(out))) {
  process.stderr.write(`scan_plugin_seams: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')

if (!has('json')) {
  process.stdout.write(`profile ${profileName}: ${scan.packages.length} packages, ${scan.files_read} source files read\n`)
  for (const row of inventory.seams) {
    const registrants = row.registrants.map((entry) => `${entry.name}${entry.prepend ? '(prepend)' : ''}`).join(' -> ')
    process.stdout.write(`${row.same_seam ? 'SAME' : '    '}  ${row.seam.padEnd(24)} ${registrants}\n`)
  }
  for (const warning of inventory.warnings) process.stdout.write(`WARN  ${warning}\n`)
}
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact)}\n`)
