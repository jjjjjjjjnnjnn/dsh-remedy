#!/usr/bin/env node
/**
 * R70 · the Linux half of this tree, read from the logs the WSL2 run wrote.
 *
 *   node scripts/record_linux_r70.mjs --stamp 2026-11-18T20:50:00.000Z
 *
 * R70 adds scripts, a probe plugin and tests, and changes no runtime byte, so the
 * claim is narrower than R69's: the same suite, the same gates and the same byte
 * account on a POSIX host as on Windows. Every field is a count, a hash of a file
 * under `.tmp/r70-linux/`, or null with the reason it was not measured.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r70: --stamp must be ISO-8601 like 2026-11-18T20:50:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r70-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r70: missing ${DIR}/${name} (copy it out of the Linux run first)\n`)
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
const rulesLog = read('rules.log').toString('utf8')
const hostileLog = read('hostile.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} — (\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}

const problems = []
const tests = Number(/tests (\d+)/.exec(verifyLog)?.[1] ?? -1)
const pass = Number(/pass (\d+)/.exec(verifyLog)?.[1] ?? -1)
const fail = Number(/fail (\d+)/.exec(verifyLog)?.[1] ?? -1)
if (tests !== 447) problems.push(`tests ${tests} is not 447`)
if (pass !== tests) problems.push(`pass ${pass} of ${tests}`)
if (fail !== 0) problems.push(`fail ${fail}`)
if (!/ALL GREEN · 6 gates/.test(verifyLog)) problems.push('verify did not print ALL GREEN · 6 gates')
if (!/6\/6 gates caught their injected violation/.test(mutateLog)) problems.push('mutate did not catch 6 of 6')
if (!/OK  8 fixture\(s\)/.test(cliLog)) problems.push('the dist CLI did not answer OK  8 fixture(s)')

const ruleTests = Number(/tests (\d+)/.exec(rulesLog)?.[1] ?? -1)
const ruleFail = Number(/fail (\d+)/.exec(rulesLog)?.[1] ?? -1)
if (!(ruleTests > 0)) problems.push(`the five governance files ran ${ruleTests} tests`)
if (ruleFail !== 0) problems.push(`the five governance files reported ${ruleFail} failure(s)`)

const hostileTests = Number(/tests (\d+)/.exec(hostileLog)?.[1] ?? -1)
const hostileFail = Number(/fail (\d+)/.exec(hostileLog)?.[1] ?? -1)
if (hostileTests !== 14) problems.push(`the R69 unit files ran ${hostileTests} tests, not 14`)
if (hostileFail !== 0) problems.push(`the R69 unit files reported ${hostileFail} failure(s)`)

const account = {
  residency: sizeOf('size/residency'),
  cli: sizeOf('size/cli'),
  total: sizeOf('size/total'),
  core_total: sizeOf('size/core-total'),
  registry: sizeOf('size/core-file:registry\\.js'),
}
const expected = { residency: 39632, cli: 41957, total: 81589, core_total: 103518, registry: 67782 }
for (const [key, bytes] of Object.entries(expected)) {
  if (account[key]?.bytes !== bytes) problems.push(`byte account ${key} is ${String(account[key]?.bytes)}, not ${bytes}`)
}

if (problems.length > 0) {
  process.stderr.write(`record_linux_r70: the claims are not what this run measured:\n  ${problems.join('\n  ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r70.mjs',
  generated_at: stamp,
  question:
    'Does the R70 tree pass on a POSIX host with the same suite, the same six gates and the same byte account as Windows, given that R70 added scripts, a probe plugin and tests but no runtime byte?',
  host: {
    kernel: versions.split(/\r?\n/).find((line) => line.startsWith('Linux')) ?? '',
    node: /v(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null,
    pnpm: /^12\.\d+\.\d+/m.exec(versions)?.[0] ?? null,
    how: 'WSL2; the tracked tree copied into the Linux filesystem and never run through /mnt/c; node_modules, dist and *.tsbuildinfo excluded so tsc -b could emit on this host',
  },
  verify: { tests, pass, fail, gates: 6, negative_control: '6/6' },
  installed_dist_cli: {
    what: 'node packages/plugin/dist/cli.js verify on this host, against the fixture set the package ships',
    printed: /OK  \d+ fixture\(s\)/.exec(cliLog)?.[0] ?? '',
  },
  governance_files_on_posix: {
    tests: ruleTests,
    fail: ruleFail,
    files: [
      'tests/governance/facts-truth.test.ts',
      'tests/governance/handoff-truth.test.ts',
      'tests/governance/fact-pack-census.test.ts',
      'tests/governance/public-pages-complete.test.ts',
      'tests/governance/ledgers.test.ts',
    ],
    what: 'the fact pack, the handoff evidence index, the patch census, both first screens and the four ledgers',
  },
  r69_unit_files_on_posix: {
    tests: hostileTests,
    fail: hostileFail,
    files: ['tests/unit/neighbour-hostile.test.ts', 'tests/unit/reserved-name.test.ts'],
    what: 'the fourteen measured/control cases for P-0053 and P-0054',
  },
  byte_account: account,
  windows_tree: { what: 'the same tree measured on Windows before this run', total: 81589, core_total: 103518, registry: 67782 },
  not_measured: {
    live_turns: 'the R70 harness drives the desktop CLI and the Windows host; it was not re-run on POSIX this round',
    cold_directory_install: 'not re-run on POSIX: 0.4.19 was installed from the registry on Windows (install-acceptance-2026-11-18T16-20-00.000Z.json)',
    desktop_app: 'not a POSIX claim: the app is measured on Windows only',
  },
  sources: {
    'versions.log': sha(read('versions.log')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli.log': sha(read('cli.log')),
    'rules.log': sha(read('rules.log')),
    'hostile.log': sha(read('hostile.log')),
  },
  limits: [
    'one Linux host (WSL2) and one node build; this is not a distribution matrix',
    'the suite reads files, so a POSIX pass proves the tests are portable, not that the pages are right on darwin',
    'the two R70 artifacts are Windows runs; nothing here re-proves a live turn on Linux',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `live-linux-${stamp.replaceAll(':', '-')}.json`
const path = abs(`data/results/${name}`)
if (existsSync(path)) {
  process.stderr.write(`record_linux_r70: refusing to overwrite data/results/${name}\n`)
  process.exit(2)
}
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\nsha256 ${sha(text)}\n`)
