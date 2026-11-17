#!/usr/bin/env node
/**
 * R66 · the Linux half of the R66 tree, read from the logs the WSL2 run wrote.
 *
 * Same recorder shape as R55…R65: every field is a count, a hash of a file under
 * `.tmp/r66-linux/`, or null with the reason it was not measured. Nothing is
 * borrowed from an earlier round.
 *
 *   node scripts/record_linux_r66.mjs --stamp 2026-11-18T06:30:00.000Z
 *
 * R66 changed no runtime byte, so the byte account is expected to equal the
 * published 0.4.18 tree's. The thing worth proving is different from R65: the
 * suite grew from 420 to 425, and the five new cases are the first-screen and
 * live-state rules, so this artifact says those rules read the same pages on
 * POSIX and reach the same verdict as on Windows.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { abs } from './lib/kit.mjs'

const index = process.argv.indexOf('--stamp')
const stamp = process.argv[index + 1] ?? ''
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  process.stderr.write('record_linux_r66: --stamp must be ISO-8601 like 2026-11-18T06:30:00.000Z\n')
  process.exit(2)
}

const DIR = '.tmp/r66-linux'
const read = (name) => {
  const path = abs(`${DIR}/${name}`)
  if (!existsSync(path)) {
    process.stderr.write(`record_linux_r66: missing ${DIR}/${name} (copy it out of the Linux run first)\n`)
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
const rulesLog = read('r66rules.log').toString('utf8')

const sizeOf = (label) => {
  const match = new RegExp(`${label} — (\\d+) of (\\d+)`).exec(sizeLog)
  return match === null ? null : { bytes: Number(match[1]), cap: Number(match[2]) }
}
const coreTotal = sizeOf('size/core-total')
const registryFile = sizeOf('size/core-file:registry\\.js')

const problems = []
const tests = Number(/tests (\d+)/.exec(verifyLog)?.[1] ?? -1)
const pass = Number(/pass (\d+)/.exec(verifyLog)?.[1] ?? -1)
const fail = Number(/fail (\d+)/.exec(verifyLog)?.[1] ?? -1)
if (tests !== 425) problems.push(`tests ${tests} is not 425`)
if (pass !== tests) problems.push(`pass ${pass} of ${tests}`)
if (fail !== 0) problems.push(`fail ${fail}`)
if (!/ALL GREEN · 6 gates/.test(verifyLog)) problems.push('verify did not print ALL GREEN · 6 gates')
if (!/6\/6 gates caught their injected violation/.test(mutateLog)) problems.push('mutate did not catch 6 of 6')
if (!/OK  8 fixture\(s\)/.test(cliLog)) problems.push('the dist CLI did not answer OK  8 fixture(s)')

// The two files R66 grew: three rules in the first-screen test, two in the
// facts test. Nineteen is the count this tree carries; a different number means
// the rule set moved and this artifact no longer describes what it says.
const ruleTests = Number(/tests (\d+)/.exec(rulesLog)?.[1] ?? -1)
const ruleFail = Number(/fail (\d+)/.exec(rulesLog)?.[1] ?? -1)
if (ruleTests !== 19) problems.push(`the R66 rule files ran ${ruleTests} tests, not 19`)
if (ruleFail !== 0) problems.push(`the R66 rule files reported ${ruleFail} failure(s)`)

const account = {
  residency: sizeOf('size/residency'),
  cli: sizeOf('size/cli'),
  total: sizeOf('size/total'),
  core_total: coreTotal,
  registry: registryFile,
}
const expected = { residency: 40902, cli: 41957, total: 82859, core_total: 103869, registry: 66049 }
for (const [key, bytes] of Object.entries(expected)) {
  if (account[key]?.bytes !== bytes) problems.push(`byte account ${key} is ${String(account[key]?.bytes)}, not ${bytes}`)
}

if (problems.length > 0) {
  process.stderr.write(`record_linux_r66: the claims are not what this run measured:\n  ${problems.join('\n  ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_linux_r66.mjs',
  generated_at: stamp,
  question:
    'Does the R66 tree pass on a POSIX host with the same suite count and the same byte account as Windows, and do the three new first-screen rules and the two live-state rules reach the same verdict there?',
  host: {
    kernel: versions.split(/\r?\n/).find((line) => line.startsWith('Linux')) ?? '',
    node: /v(\d+\.\d+\.\d+)/.exec(versions)?.[1] ?? null,
    pnpm: (/^12\.\d+\.\d+/m.exec(versions)?.[0] ?? null),
    how: 'WSL2; the tracked tree copied into the Linux filesystem and never run through /mnt/c; `*.tsbuildinfo` excluded so tsc -b could emit on this host',
  },
  verify: { tests, pass, fail, gates: 6, negative_control: '6/6' },
  installed_dist_cli: {
    what: 'node packages/plugin/dist/cli.js verify on this host, against the fixture set the package ships',
    printed: /OK  \d+ fixture\(s\)/.exec(cliLog)?.[0] ?? '',
  },
  r66_rules_on_posix: {
    tests: ruleTests,
    fail: ruleFail,
    files: ['tests/governance/public-pages-complete.test.ts', 'tests/governance/facts-truth.test.ts'],
    what: 'the opening count against the registry, each seam row against the registry surface, §6 as a pointer, and lone `N B` figures against the status table',
  },
  byte_account: account,
  unchanged_from_published_tree: {
    what: 'R66 moved no runtime byte, so the three caps read exactly the published 0.4.18 values on both hosts',
    windows: { total: 82859, core_total: 103869, registry: 66049 },
  },
  not_measured: {
    cold_directory_install: 'not re-run on POSIX this round: the 0.4.18 registry copy was installed on Windows (install-acceptance-2026-11-18T03-20-00.000Z.json)',
    npx: 'not re-run this round for the same reason',
    explain_sessions_on_this_host: 'this Linux home has no ~/.dsh/sessions, so the live findings are measured on the Windows host and by the fixtures/tests',
    desktop_app: 'not a POSIX claim: the app is measured on Windows only',
  },
  sources: {
    'versions.log': sha(read('versions.log')),
    'verify.log': sha(read('verify.log')),
    'mutate.log': sha(read('mutate.log')),
    'size.log': sha(read('size.log')),
    'cli.log': sha(read('cli.log')),
    'r66rules.log': sha(read('r66rules.log')),
  },
  limits: [
    'one Linux host (WSL2) and one node build; this is not a distribution matrix',
    'the suite reads files, so a POSIX pass proves the tests are portable, not that the pages are right on darwin',
    'no resident provider ran on this host: this round changed no runtime byte, so nothing here re-proves a repair',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `live-linux-${stamp.replaceAll(':', '-')}.json`
const path = abs(`data/results/${name}`)
if (existsSync(path)) {
  process.stderr.write(`record_linux_r66: refusing to overwrite data/results/${name}\n`)
  process.exit(2)
}
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\nsha256 ${sha(text)}\n`)
