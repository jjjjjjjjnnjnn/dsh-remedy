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
 * the profile. It reads `package.json` and the built JavaScript, classifies what
 * it sees (see `scripts/lib/seam-inventory.mjs`), and records the result. A
 * registration it cannot read is `skipped` with the reason, never `0`.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { buildInventory, registrationsIn, reservedUsesIn } from './lib/seam-inventory.mjs'

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

/** Remedy's own names; a claim on one by another package is a finding. */
const RESERVED = ['remedy_unattributed']

/** Reading a 46 MB bundle to find one string costs more than the answer is worth. */
const MAX_FILE_BYTES = 4 * 1024 * 1024

const profileDir = join(homedir(), '.dsh', 'profiles', profileName)
if (!existsSync(join(profileDir, 'package.json'))) {
  process.stderr.write(`scan_plugin_seams: no profile at ${profileDir}\n`)
  process.exit(3)
}

const profilePkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
const bundles = Array.isArray(profilePkg?.dsh?.profile?.bundles) ? profilePkg.dsh.profile.bundles : []
const loadIndex = (name) => {
  const index = bundles.indexOf(name)
  return index === -1 ? null : index
}

function packageDirs(root) {
  const dirs = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const full = join(root, entry.name)
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(full, { withFileTypes: true })) {
        if (sub.isDirectory() && existsSync(join(full, sub.name, 'package.json'))) dirs.push(join(full, sub.name))
      }
    } else if (existsSync(join(full, 'package.json'))) {
      dirs.push(full)
    }
  }
  return dirs
}

function sourceFiles(dir) {
  const files = []
  const walk = (path, depth) => {
    if (depth > 4) return
    let entries = []
    try {
      entries = readdirSync(path, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (/\.(js|mjs|cjs)$/.test(entry.name)) files.push(full)
    }
  }
  walk(join(dir, 'dist'), 0)
  if (files.length === 0) walk(join(dir, 'lib'), 0)
  return files
}

const packages = []
const read = { files: 0, bytes: 0, skipped_large: [], skipped_dirs: [] }

for (const dir of packageDirs(join(profileDir, 'node_modules'))) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    read.skipped_dirs.push(relative(profileDir, dir).replaceAll('\\', '/'))
    continue
  }
  if (typeof pkg.name !== 'string') continue

  const registrations = new Map()
  const reserved = new Set()
  for (const file of sourceFiles(dir)) {
    let size = 0
    try {
      size = statSync(file).size
    } catch {
      continue
    }
    if (size > MAX_FILE_BYTES) {
      read.skipped_large.push(`${pkg.name}:${relative(dir, file).replaceAll('\\', '/')}`)
      continue
    }
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    read.files += 1
    read.bytes += size
    for (const name of reservedUsesIn(text, RESERVED)) reserved.add(name)
    for (const registration of registrationsIn(text)) {
      const previous = registrations.get(registration.seam)
      registrations.set(registration.seam, {
        seam: registration.seam,
        // A package that both wraps and observes is a wrapper for this report.
        mode: previous?.mode === 'on' || registration.mode === 'on' ? 'on' : 'emit',
        prepend: (previous?.prepend ?? false) || registration.prepend,
        file: relative(dir, file).replaceAll('\\', '/'),
      })
    }
  }

  packages.push({
    name: pkg.name,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    load_index: loadIndex(pkg.name),
    registrations: [...registrations.values()],
    reserved: [...reserved],
  })
}

const inventory = buildInventory(packages)
const payload = {
  schema_version: 1,
  produced_by: 'scripts/scan_plugin_seams.mjs',
  generated_at: stamp,
  question: 'Which installed packages register on which DSH seam, and in what order does the llm/stream waterfall run them?',
  profile: {
    name: profileName,
    dir: profileDir,
    packages: packages.length,
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
    files: read.files,
    bytes: read.bytes,
    skipped_large_files: read.skipped_large,
    unreadable_dirs: read.skipped_dirs,
  },
  limits: [
    'one profile on one machine; it describes the packages installed now, not a compatibility matrix',
    'it reads built JavaScript for the strings a registration uses; a plugin that registers through an indirection is reported as absent, not as compatible',
    'it records order, not behaviour: whether a listener mutates chunks is not decidable by reading call sites',
  ],
}

const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)
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
  process.stdout.write(`profile ${profileName}: ${packages.length} packages, ${read.files} source files read\n`)
  for (const row of inventory.seams) {
    const registrants = row.registrants.map((entry) => `${entry.name}${entry.prepend ? '(prepend)' : ''}`).join(' -> ')
    process.stdout.write(`${row.same_seam ? 'SAME' : '    '}  ${row.seam.padEnd(24)} ${registrants}\n`)
  }
  for (const warning of inventory.warnings) process.stdout.write(`WARN  ${warning}\n`)
}
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact)}\n`)
