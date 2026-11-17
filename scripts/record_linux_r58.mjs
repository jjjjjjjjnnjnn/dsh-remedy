#!/usr/bin/env node
/**
 * R58 · the Linux half, read from the logs the WSL2 run wrote.
 *
 * Same recorder shape as R55/R56/R57: every field is a count, a hash of a file
 * under `.tmp/r58-linux/`, or null with the reason it was not measured.
 *
 *   node scripts/record_linux_r58.mjs --stamp 2026-11-16T23:10:00.000Z
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r58: --stamp must be ISO-8601 like 2026-11-16T23:10:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r58-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r58: missing ${DIR}/${name}\n`)
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
const censusLog = read('census.log').toString('utf8')
const hashesLog = read('hashes.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} (\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

// The claims this artifact exists to answer, each checked before it is written:
// a green suite is not evidence of a number, and a number is not evidence of a run.
const problems = []
const tests = Number(/tests (\d+)/.exec(verifyLog)?.[1] ?? -1)
const pass = Number(/pass (\d+)/.exec(verifyLog)?.[1] ?? -1)
const fail = Number(/fail (\d+)/.exec(verifyLog)?.[1] ?? -1)
if (tests !== 388) problems.push(`tests ${tests} is not 388`)
if (pass !== tests) problems.push(`pass ${pass} of ${tests}`)
if (fail !== 0) problems.push(`fail ${fail}`)
if (!/ALL GREEN · 6 gates/.test(verifyLog)) problems.push('verify did not print ALL GREEN · 6 gates')
if (!/6\/6 gates caught their injected violation/.test(mutateLog)) problems.push('mutate did not catch 6 of 6')
const censusTests = Number(/tests (\d+)/.exec(censusLog)?.[1] ?? -1)
const censusFail = Number(/fail (\d+)/.exec(censusLog)?.[1] ?? -1)
if (censusTests !== 13) problems.push(`the P-0049 rules ran ${censusTests} tests, not 13`)
if (censusFail !== 0) problems.push(`${censusFail} of the P-0049 rules failed on this host`)
if (!/OK  8 fixture\(s\)/.test(cliLog)) problems.push('the dist CLI did not answer OK  8 fixture(s)')

if (problems.length > 0) {
  process.stderr.write(`record_linux_r58: the five claims are not what this run measured:\n  ${problems.join('\n  ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r58.mjs',
  generated_at: stamp,
  question:
    'Does the R58 tree pass on a POSIX host, are the engine and registry byte accounts the same as on Windows, and do P-0049\'s rules pass on the pack as this host reads it?',
  host: {
    kernel: versions.split(/\r?\n/).find((line) => line.startsWith('Linux')) ?? '',
    node: (/v(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null),
    pnpm: (/^12\.\d+\.\d+/m.exec(versions)?.[0] ?? null),
    how: 'WSL2; the tracked tree copied into the Linux filesystem and never run through /mnt/c',
    note: 'this box has node 24.10.0 and pnpm 12.15.0 on PATH; package.json scripts ran unchanged',
  },
  verify: { tests, pass, fail, gates: 6, negative_control: '6/6' },
  installed_dist_cli: {
    what: "node packages/plugin/dist/cli.js verify on this host, against the fixture set the package ships",
    printed: (/OK  \d+ fixture\(s\)/.exec(cliLog)?.[0] ?? ''),
    exit: 0,
  },
  p0049_on_linux: {
    payload: 'the two test files this round added or extended, run against the pack and the changelog as this host reads them',
    tests: censusTests,
    fail: censusFail,
  },
  byte_account: {
    residency: sizeOf('residency'),
    cli: sizeOf('cli'),
    total: sizeOf('total'),
    core_total: sizeOf('core'),
    registry: sizeOf('registry'),
  },
  not_measured: {
    cold_directory_install: 'not re-run this round: 0.4.17 is unpublished, so there is no registry copy to install',
    npx: 'not re-run this round for the same reason',
    desktop_app: 'not a POSIX claim: the app is measured on Windows only',
  },
  sources: {
    'versions.log': sha(read('versions.log')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli.log': sha(read('cli.log')),
    'census.log': sha(read('census.log')),
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
    'the P-0049 rules read files, so a POSIX pass proves the rules are portable, not that the pages are right on darwin',
    'no resident seam ran on this host: the round changed no runtime byte',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `live-linux-${stamp.replaceAll(':', '-')}.json`
const path = abs(`data/results/${name}`)
if (existsSync(path)) {
  process.stderr.write(`record_linux_r58: refusing to overwrite data/results/${name}\n`)
  process.exit(2)
}
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\nsha256 ${sha(text)}\n`)
