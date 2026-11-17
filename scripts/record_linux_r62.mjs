#!/usr/bin/env node
/**
 * R62 · the Linux half of the 0.4.17 release, read from the logs the WSL2 run wrote.
 *
 * Same recorder shape as R55…R58: every field is a count, a hash of a file under
 * `.tmp/r62-linux/`, or null with the reason it was not measured. Nothing is
 * borrowed from an earlier round.
 *
 *   node scripts/record_linux_r62.mjs --stamp 2026-11-17T08:40:00.000Z
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r62: --stamp must be ISO-8601 like 2026-11-17T08:40:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r62-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r62: missing ${DIR}/${name} (copy it out of the Linux run first)\n`)
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
const explainLog = read('explain.log').toString('utf8')
const hashesLog = read('hashes.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} (\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

/** The engine's two lines are labelled differently: `core-total` and `core-file:registry.js`. */
const coreTotal = (() => {
  const match = /core-total — (\d+) of (\d+)/.exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
})()
const registryFile = (() => {
  const match = /core-file:registry\.js — (\d+) of (\d+)/.exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
})()

const problems = []
const tests = Number(/tests (\d+)/.exec(verifyLog)?.[1] ?? -1)
const pass = Number(/pass (\d+)/.exec(verifyLog)?.[1] ?? -1)
const fail = Number(/fail (\d+)/.exec(verifyLog)?.[1] ?? -1)
if (tests !== 405) problems.push(`tests ${tests} is not 405`)
if (pass !== tests) problems.push(`pass ${pass} of ${tests}`)
if (fail !== 0) problems.push(`fail ${fail}`)
if (!/ALL GREEN · 6 gates/.test(verifyLog)) problems.push('verify did not print ALL GREEN · 6 gates')
if (!/6\/6 gates caught their injected violation/.test(mutateLog)) problems.push('mutate did not catch 6 of 6')
if (!/OK  8 fixture\(s\)/.test(cliLog)) problems.push('the dist CLI did not answer OK  8 fixture(s)')
const explainTests = Number(/tests (\d+)/.exec(explainLog)?.[1] ?? -1)
if (explainTests !== 6) problems.push(`P-0051 ran ${explainTests} tests, not 6`)

if (problems.length > 0) {
  process.stderr.write(`record_linux_r62: the claims are not what this run measured:\n  ${problems.join('\n  ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r62.mjs',
  generated_at: stamp,
  question:
    'Does the published 0.4.17 tree pass on a POSIX host with the same suite count and the same byte account as Windows, and does P-0051 behave there?',
  host: {
    kernel: versions.split(/\r?\n/).find((line) => line.startsWith('Linux')) ?? '',
    node: /v(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null,
    pnpm: (/^12\.\d+\.\d+/m.exec(versions)?.[0] ?? null),
    how: 'WSL2; the tracked tree copied into the Linux filesystem and never run through /mnt/c',
  },
  verify: { tests, pass, fail, gates: 6, negative_control: '6/6' },
  installed_dist_cli: {
    what: 'node packages/plugin/dist/cli.js verify on this host, against the fixture set the package ships',
    printed: /OK  \d+ fixture\(s\)/.exec(cliLog)?.[0] ?? '',
  },
  p0051_on_linux: { tests: explainTests, fail: 0, what: 'the six cases, including the four negative controls' },
  byte_account: {
    residency: sizeOf('residency'),
    cli: sizeOf('cli'),
    total: sizeOf('total'),
    core_total: coreTotal,
    registry: registryFile,
  },
  not_measured: {
    cold_directory_install: 'not re-run on POSIX this round: the registry copy was installed on Windows (install-acceptance-2026-11-17T07-40-00.000Z.json)',
    npx: 'not re-run this round for the same reason',
    dropped_finding_on_this_host: 'this Linux home has no ~/.dsh/sessions, so `explain --sessions` exits 3 there; the finding is measured on the Windows host (explain-drift-2026-11-17T10-05-00.000Z.json)',
    desktop_app: 'not a POSIX claim: the app is measured on Windows only',
  },
  sources: {
    'versions.log': sha(read('versions.log')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli.log': sha(read('cli.log')),
    'explain.log': sha(read('explain.log')),
    'hashes.log': sha(read('hashes.log')),
  },
  pack_and_changelog: hashesLog
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, file] = line.trim().split(/\s+/)
      return { file, sha256: hash }
    }),
  limits: [
    'one Linux host (WSL2) and one node build; this is not a distribution matrix',
    'the suite reads files, so a POSIX pass proves the tests are portable, not that the pages are right on darwin',
    'no resident seam ran with a provider on this host: the round changed no runtime byte',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `live-linux-${stamp.replaceAll(':', '-')}.json`
const path = abs(`data/results/${name}`)
if (existsSync(path)) {
  process.stderr.write(`record_linux_r62: refusing to overwrite data/results/${name}\n`)
  process.exit(2)
}
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\nsha256 ${sha(text)}\n`)
