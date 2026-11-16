#!/usr/bin/env node
/**
 * R57 · the Linux half, read from the logs the WSL2 run wrote.
 *
 * The same recorder shape as R56's: every field is a count or a hash of a file
 * under `.tmp/r57-linux/`; what was not measured is null with its reason.
 *
 *   node scripts/record_linux_r57.mjs --stamp 2026-11-16T19:10:00.000Z
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r57: --stamp must be ISO-8601 like 2026-11-16T19:10:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r57-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r57: missing ${DIR}/${name}\n`)
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
const scanLog = read('scan-p0047.log').toString('utf8')
const installLog = read('install.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} [^0-9]*(\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r57.mjs',
  generated_at: stamp,
  question:
    'Does the R57 tree pass on a POSIX host, does the installed dist CLI run there, and does P-0047 report the same `completed_without_answer` answer on a POSIX payload?',
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
  p0047_on_linux: {
    payload: 'the reasoning-only session the Windows probe recorded, scanned by this host\'s dist scanner',
    printed: /turns=\d+ completed=\d+ max_tokens=\d+ aborted=\d+ error=\d+ truncated_without_answer=\d+ completed_without_answer=\d+/.exec(scanLog)?.[0] ?? null,
    note: 'the same rule the Windows run measured: the reasoning-only completion is counted, the text control is not',
  },
  byte_account: {
    total: sizeOf('size/total'),
    residency: sizeOf('size/residency'),
    cli: sizeOf('size/cli'),
    core_total: sizeOf('size/core-total'),
    registry: sizeOf('size/core-file:registry\\.js'),
  },
  install: { exit: Number(/install exit=(\d+)/.exec(installLog)?.[1] ?? -1) },
  not_measured: {
    cold_directory_install: 'not re-run this round: 0.4.17 is unpublished; the install path is measured at publish time.',
    npx: 'not re-run this round for the same reason.',
    desktop_app: 'the desktop profile is not on this host; it stays on 0.4.16.',
  },
  sources: Object.fromEntries(
    ['versions.log', 'verify.log', 'mutate.log', 'size.log', 'cli.log', 'install.log', 'scan-p0047.log'].map((name) => [name, sha(read(name))]),
  ),
  limits: [
    'one Linux host (WSL2 Ubuntu 26.04) and one node build; this is not a distribution matrix',
    'the P-0047 scan reads a session produced on Windows, not a session produced here: the rule is platform-independent, the payload is not',
    'no cold install and no npx this round, and the desktop app was not driven here',
  ],
}

const out = abs(`data/results/live-linux-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(out)) {
  process.stderr.write(`record_linux_r57: refusing to overwrite ${out}\n`)
  process.exit(2)
}
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
writeFileSync(`${out}.sha256`, `${sha(json)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\n${JSON.stringify(payload.verify)} ${JSON.stringify(payload.byte_account.total)}\n`)
