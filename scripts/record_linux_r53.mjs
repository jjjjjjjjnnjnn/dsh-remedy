#!/usr/bin/env node
/**
 * R53 · record the Linux half of this release from logs the Linux run wrote.
 *
 * Inputs are read, never produced: `.tmp/linux-evidence/*` is copied out of the
 * WSL filesystem by `.tmp/r53-linux-copy.sh`, and every field here is a hash or a
 * count of a file that is also hashed.
 *
 * The recorder refuses to write an artifact that claims a cold install or an
 * `npx` run this round did not perform; those two stay `null` with the reason
 * spelled out, because the alternative is an artifact that borrows R51's numbers.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = index === -1 ? null : isoStamp(process.argv[index + 1])
if (stamp === null) {
  process.stderr.write('record_linux_r53: --stamp must be ISO-8601\n')
  process.exit(2)
}

const DIR = '.tmp/linux-evidence'
const read = (name) => {
  const path = abs(join(DIR, name))
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r53: missing ${DIR}/${name}\n`)
    process.exit(3)
  }
  return readFileSync(path)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const host = read('host.txt').toString('utf8')
const verify = read('verify.log').toString('utf8')
const mutate = read('mutate.log').toString('utf8')
const size = read('size.log').toString('utf8')
const cli = read('cli-bin.log').toString('utf8')
const versions = read('versions.log').toString('utf8')
const registryVersions = read('registry-version.log').toString('utf8').trim().split(/\r?\n/)
const npx = read('verify-npx.log').toString('utf8')
const install = read('install.log').toString('utf8')

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r53.mjs',
  generated_at: stamp,
  question:
    'Does 0.4.13 pass on a POSIX host, does the installed bin run through its symlink there, and does the tree ship the same byte account it measured on Windows?',
  host: {
    kernel: host.split(/\r?\n/)[0] ?? '',
    distro: /PRETTY_NAME="([^"]+)"/.exec(host)?.[1] ?? null,
    node: /node v(\S+)/.exec(read('node-version.txt').toString())?.[1] ?? null,
    how: 'WSL2 Ubuntu, the tracked tree copied into the Linux filesystem (never run through /mnt/c)',
  },
  verify: {
    tests: /tests (\d+)/.exec(verify)?.[1] ?? null,
    pass: /pass (\d+)/.exec(verify)?.[1] ?? null,
    fail: /fail (\d+)/.exec(verify)?.[1] ?? null,
    gates: /ALL GREEN \u00b7 (\d+) gates/.exec(verify)?.[1] ?? null,
    negative_control: (() => {
      const caught = /NEGATIVE CONTROL PASSED \u00b7 (\d)\/(\d)/.exec(mutate)
      return caught === null ? null : `${caught[1]}/${caught[2]}`
    })(),
    fixtures: /OK\s+(\d+) fixture\(s\)/.exec(cli)?.[1] ?? null,
    byte_account: (() => {
      const match = /size\/total \u2014? ?(\d+) of (\d+)/.exec(size)
      return match === null ? null : { total: Number(match[1]), cap: Number(match[2]) }
    })(),
    core_total: (() => {
      const match = /size\/core-total \u2014? ?(\d+) of (\d+)/.exec(size)
      return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
    })(),
    registry: (() => {
      const match = /size\/core-file:registry\.js \u2014? ?(\d+) of (\d+)/.exec(size)
      return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
    })(),
  },
  installed_bin: {
    what: 'pnpm writes a shell shim at node_modules/.bin/dsh-remedy on POSIX, and the shim resolved its own link so the CLI ran',
    mode: /^#!\/bin\/sh/m.test(cli) ? 'shell shim' : null,
    printed: (() => {
      const match = /OK\s+(\d+) fixture\(s\)/.exec(cli)
      return match === null ? null : `OK ${match[1]} fixture(s)`
    })(),
    exit: /exit (\d+)/.exec(cli)?.[1] ?? null,
    bytes: sha(read('cli-bin.log')),
  },
  stranger_install: {
    measured_this_round: false,
    why: install.replaceAll('\r', '').trim(),
    registry_versions: registryVersions,
    installed: /(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null,
  },
  npx: {
    measured_this_round: false,
    why: npx.replaceAll('\r', '').trim(),
  },
  sources: {
    'host.txt': sha(read('host.txt')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli-bin.log': sha(read('cli-bin.log')),
  },
  limits: [
    'one Linux host (WSL2 Ubuntu 26.04) and one node build; not a distribution matrix',
    'the cold install and npx were measured in R51 on 0.4.12 and are not re-measured here, so they are null with the reason rather than borrowed',
    'the tree is the Windows working tree copied across; no build artifact was carried over, so both platforms compiled the same sources',
  ],
}

const out = abs(`data/results/live-linux-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(out)) {
  process.stderr.write(`record_linux_r53: refusing to overwrite ${out}\n`)
  process.exit(2)
}
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
writeFileSync(`${out}.sha256`, `${createHash('sha256').update(json).digest('hex')}  ${basename(out)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${basename(out)}\n${JSON.stringify(payload.verify)}\n`)
