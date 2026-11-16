/**
 * R55 · the Linux half, read from the logs the Linux run wrote.
 *
 * Every field here is a count or a hash of a file under `.tmp/linux-evidence/`,
 * which is copied out of the WSL2 filesystem by the shell script that produced
 * it. Nothing is remembered: the cold install and the `npx` run are declared
 * not-measured with their reason, rather than borrowed from R53.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r55: --stamp must be ISO-8601 like 2026-11-16T12:40:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/linux-evidence'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r55: missing ${DIR}/${name}\n`)
    process.exit(3)
  }
  return readFileSync(path)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const host = read('host.txt').toString('utf8')
const verifyLog = read('verify.log').toString('utf8')
const mutateLog = read('mutate.log').toString('utf8')
const sizeLog = read('size.log').toString('utf8')
const cliLog = read('cli-bin.log').toString('utf8')
const scanLog = read('scan-p0044.log').toString('utf8')
const nodeVersion = read('node-version.txt').toString('utf8').trim()
const pnpmVersion = read('pnpm-version.txt').toString('utf8').trim()
const registryVersions = read('registry-version.log').toString('utf8').trim().split(/\r?\n/)

const sizeOf = (label) => {
  const match = new RegExp(`${label} [^0-9]*(\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r55.mjs',
  generated_at: stamp,
  question:
    'Does the R55 tree pass on a POSIX host, does the installed bin run there, and does P-0044 report the same answer census on a POSIX payload?',
  host: {
    kernel: host.split(/\r?\n/)[0] ?? '',
    distro: /PRETTY_NAME="([^"]+)"/.exec(host)?.[1] ?? null,
    node: nodeVersion.replace(/^v/, ''),
    pnpm: pnpmVersion,
    how: 'WSL2 Ubuntu 26.04, the tracked tree (working tree, uncommitted R55 changes included) copied into the Linux filesystem and never run through /mnt/c',
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
  installed_bin: {
    what: 'node_modules/dsh-remedy/dist/cli.js on this host, with the fixture set the package ships',
    printed: (/OK\s+(\d+) fixture\(s\)/.exec(cliLog)?.[1] ?? null) === null ? null : `OK ${/OK\s+(\d+) fixture\(s\)/.exec(cliLog)[1]} fixture(s)`,
    exit: Number(/exit (\d+)/.exec(cliLog)?.[1] ?? -1),
  },
  p0044_on_linux: {
    synthetic_session: 'data/fixtures-driven: one truncated turn with reasoning only, one truncated turn with text, one completed turn',
    printed: (/turns=(\d+) completed=(\d+) max_tokens=(\d+) aborted=(\d+) error=(\d+) truncated_without_answer=(\d+)/.exec(scanLog) ?? []).slice(1).map(Number),
    note: 'the same rule the Windows run measured: the reasoning-only truncation is counted, the one that wrote text is not',
  },
  byte_account: {
    total: sizeOf('size/total'),
    residency: sizeOf('size/residency'),
    cli: sizeOf('size/cli'),
    core_total: sizeOf('size/core-total'),
    registry: sizeOf('size/core-file:registry\\.js'),
    note: 'measured on this host by gate_size, so the Linux and Windows accounts are compared rather than assumed equal',
  },
  registry: {
    versions: registryVersions,
  },
  stranger_install: {
    measured_this_round: false,
    why: read('install.log').toString('utf8').replaceAll('\r', '').trim(),
  },
  npx: {
    measured_this_round: false,
    why: read('verify-npx.log').toString('utf8').replaceAll('\r', '').trim(),
  },
  sources: Object.fromEntries(
    [
      'host.txt',
      'verify.log',
      'mutate.log',
      'size.log',
      'cli-bin.log',
      'scan-p0044.log',
      'node-version.txt',
      'pnpm-version.txt',
      'registry-version.log',
    ].map((name) => [name, sha(read(name))]),
  ),
  limits: [
    'one Linux host (WSL2 Ubuntu 26.04) and one node build; not a distribution matrix',
    'the cold install and npx were measured on 0.4.12/0.4.13 in earlier rounds and are not re-measured here, so they are null with the reason rather than borrowed',
    'the P-0044 scan on this host uses a synthetic session payload, not a live desktop session: the rule is platform-independent, the session is not',
  ],
}

const out = abs(`data/results/live-linux-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(out)) {
  process.stderr.write(`record_linux_r55: refusing to overwrite ${out}\n`)
  process.exit(2)
}
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
writeFileSync(`${out}.sha256`, `${sha(json)}  ${basename(out)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${basename(out)}\n${JSON.stringify(payload.verify)} ${JSON.stringify(payload.byte_account.total)}\n`)
