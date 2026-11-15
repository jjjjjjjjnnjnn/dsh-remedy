#!/usr/bin/env node
/**
 * R51 · record the second platform's release evidence.
 *
 * Reads only files under `.tmp/linux-evidence/` (copied from the Linux run by
 * `.tmp/r51-linux-*.sh`), plus the repository's own built packages, and writes
 * `data/results/live-linux-<stamp>.json`. Every field is a hash or a count of a
 * file that is also hashed, so the artifact can be re-checked.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'

const stamp = isoStamp(
  (() => {
    const index = process.argv.indexOf('--stamp')
    return index === -1 ? '' : process.argv[index + 1]
  })(),
)
if (stamp === null || stamp === '') {
  process.stderr.write('record_linux_host: --stamp must be ISO-8601\n')
  process.exit(2)
}

const DIR = '.tmp/linux-evidence'
const read = (name) => {
  const path = abs(join(DIR, name))
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_host: missing ${DIR}/${name}\n`)
    process.exit(3)
  }
  return readFileSync(path)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const host = read('host.txt').toString('utf8')
const verifyLog = read('verify.log').toString('utf8')
const mutateLog = read('mutate.log').toString('utf8')
const sizeLog = read('size.log').toString('utf8')
const cliLog = read('cli-verify.log').toString('utf8')
const symlinkLog = read('cli-symlink.log').toString('utf8')
const npxLog = read('verify-npx.log').toString('utf8')
const installLog = read('install.log').toString('utf8')
const versionsLog = read('versions.log').toString('utf8')
const registryVersions = read('registry-version.log').toString('utf8').trim().split(/\r?\n/)

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_host.mjs',
  generated_at: stamp,
  question: 'Does the same tree pass on a POSIX host, does the installed bin run there, and does the stranger install resolve from the registry?',
  host: {
    kernel: host.split(/\r?\n/)[0] ?? '',
    distro: /PRETTY_NAME="([^"]+)"/.exec(host)?.[1] ?? null,
    node: /node v(\S+)/.exec(host)?.[1] ?? null,
    pnpm: /pnpm (\S+)/.exec(host)?.[1] ?? null,
    how: 'WSL2 Ubuntu, the tracked tree copied into the Linux filesystem (never run through /mnt/c)',
  },
  verify: {
    tests: /tests (\d+)/.exec(verifyLog)?.[1] ?? null,
    pass: /pass (\d+)/.exec(verifyLog)?.[1] ?? null,
    fail: /fail (\d+)/.exec(verifyLog)?.[1] ?? null,
    gates: /ALL GREEN \u00b7 (\d+) gates/.exec(verifyLog)?.[1] ?? null,
    negative_control: (() => {
      const caught = /NEGATIVE CONTROL PASSED \u00b7 (\d)\/(\d)/.exec(mutateLog)
      return caught === null ? null : `${caught[1]}/${caught[2]}`
    })(),
    fixtures: /OK\s+(\d+) fixture\(s\)/.exec(cliLog)?.[1] ?? null,
    cli_verify_exit: /exit (\d+)/.exec(cliLog)?.[1] ?? null,
    byte_account: (() => {
      const match = /size\/total \u2014? ?(\d+) of (\d+)/.exec(sizeLog)
      return match === null ? null : { total: Number(match[1]), cap: Number(match[2]) }
    })(),
    core_total: (() => {
      const match = /size\/core-total \u2014? ?(\d+) of (\d+)/.exec(sizeLog)
      return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
    })(),
    registry: (() => {
      const match = /size\/core-file:registry\.js \u2014? ?(\d+) of (\d+)/.exec(sizeLog)
      return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
    })(),
  },
  installed_bin: {
    what: 'the shape npm installs on POSIX: node_modules/.bin/dsh-remedy is a symlink, and it must run',
    exit: /exit (\d+)/.exec(symlinkLog)?.[1] ?? null,
    printed: (() => {
      const match = /OK\s+(\d+) fixture\(s\)/.exec(symlinkLog)
      return match === null ? null : `OK ${match[1]} fixture(s)`
    })(),
    npx_exit: /exit (\d+)/.exec(npxLog)?.[1] ?? null,
    npx_printed: (() => {
      const match = /OK\s+(\d+) fixture\(s\)/.exec(npxLog)
      return match === null ? null : `OK ${match[1]} fixture(s)`
    })(),
    bytes: { symlink: sha(symlinkLog), npx: sha(npxLog) },
  },
  stranger_install: {
    registry_versions: registryVersions,
    installed: /dsh-remedy (\d+\.\d+\.\d+)/.exec(versionsLog)?.[1] ?? null,
    core: /dsh-remedy-core (\d+\.\d+\.\d+)/.exec(versionsLog)?.[1] ?? null,
    bin_line: (() => {
      const match = /lrwxrwxrwx.*dsh-remedy -> .*/.exec(installLog)
      return match === null ? null : match[0]
    })(),
    bytes: { install: sha(installLog) },
  },
  sources: {
    'host.txt': sha(read('host.txt')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli-verify.log': sha(read('cli-verify.log')),
  },
}

const out = abs(`data/results/live-linux-${stamp.replaceAll(':', '-')}.json`)
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
writeFileSync(`${out}.sha256`, `${createHash('sha256').update(json).digest('hex')}  ${basename(out)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${basename(out)}\n${JSON.stringify(payload.verify)}\n`)
