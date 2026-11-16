#!/usr/bin/env node
/**
 * R56 · the Linux half, read from the logs the WSL2 run wrote.
 *
 * Every field is a count or a hash of a file under `.tmp/r56-linux/`, copied out
 * of the Linux filesystem by `.tmp/r56-linux.sh`. Nothing is remembered: what was
 * not measured is null with its reason.
 *
 * Usage:
 *   node scripts/record_linux_r56.mjs --stamp 2026-11-16T16:40:00.000Z
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r56: --stamp must be ISO-8601 like 2026-11-16T16:40:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r56-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r56: missing ${DIR}/${name}\n`)
    process.exit(3)
  }
  return readFileSync(path)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const versions = read('versions.log').toString('utf8')
const verifyLog = read('verify.log').toString('utf8')
const mutateLog = read('mutate.log').toString('utf8')
const sizeLog = read('size.log').toString('utf8')
const cliLog = read('cli.log').toString('utf8')
const installLog = read('install.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} [^0-9]*(\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r56.mjs',
  generated_at: stamp,
  question:
    'Does the R56 tree pass on a POSIX host, does the installed dist CLI run there, and is the byte account the same number it is on Windows?',
  host: {
    kernel: versions.split(/\r?\n/).find((line) => line.startsWith('Linux')) ?? '',
    node: (/v(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null),
    pnpm: (/^12\.\d+\.\d+/m.exec(versions)?.[0] ?? null),
    how: 'WSL2 Ubuntu 26.04; the tracked tree copied into the Linux filesystem and never run through /mnt/c',
    note: 'the `pnpm` shim on this box looks for pnpm.cjs, which is absent; a one-line wrapper points it at pnpm.mjs, so package.json scripts run unchanged. That is a harness fix, not a product claim.',
  },
  verify: {
    tests: Number(/tests (\d+)/.exec(verifyLog)?.[1] ?? -1),
    pass: Number(/pass (\d+)/.exec(verifyLog)?.[1] ?? -1),
    fail: Number(/fail (\d+)/.exec(verifyLog)?.[1] ?? -1),
    gates: Number(/ALL GREEN [^0-9]*(\d+) gates/.exec(verifyLog)?.[1] ?? -1),
    negative_control: (() => {
      const caught = /NEGATIVE CONTROL PASSED [^0-9]*(\d)\/(\d)/.exec(mutateLog)
      return caught === null ? null : `${caught[1]}/${caught[2]}`
    })(),
  },
  installed_dist_cli: {
    what: 'node packages/plugin/dist/cli.js verify on this host, against the fixture set the package ships',
    printed: /OK\s+(\d+) fixture\(s\)/.exec(cliLog)?.[0] ?? null,
    exit: Number(/cli exit=(\d+)/.exec(cliLog)?.[1] ?? -1),
  },
  byte_account: {
    total: sizeOf('size/total'),
    residency: sizeOf('size/residency'),
    cli: sizeOf('size/cli'),
    core_total: sizeOf('size/core-total'),
    registry: sizeOf('size/core-file:registry\\.js'),
    note: 'measured by gate_size on this host, so the Linux and Windows accounts are compared rather than assumed equal',
  },
  install: {
    exit: Number(/install exit=(\d+)/.exec(installLog)?.[1] ?? -1),
    lockfile: installLog.includes('Lockfile is up to date') ? 'up to date' : 'not reported',
  },
  not_measured: {
    cold_directory_install: 'not re-run this round: R56 changed the registry data and one listener, and the install path was measured on 0.4.15. A cold install of 0.4.16 follows the publish.',
    npx: 'not re-run this round for the same reason.',
    desktop_app: 'the desktop profile is not on this host; it stays on 0.4.15 until the publish.',
  },
  sources: Object.fromEntries(
    ['versions.log', 'verify.log', 'mutate.log', 'size.log', 'cli.log', 'install.log'].map((name) => [name, sha(read(name))]),
  ),
  limits: [
    'one Linux host (WSL2 Ubuntu 26.04) and one node build; this is not a distribution matrix',
    'the `pnpm` wrapper is a harness detail: the Linux box has the pnpm.mjs file and not the pnpm.cjs the shim expects',
    'no cold install and no npx this round, and the desktop app was not driven here',
  ],
}

const out = abs(`data/results/live-linux-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(out)) {
  process.stderr.write(`record_linux_r56: refusing to overwrite ${out}\n`)
  process.exit(2)
}
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
writeFileSync(`${out}.sha256`, `${sha(json)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\n${JSON.stringify(payload.verify)}\n`)
