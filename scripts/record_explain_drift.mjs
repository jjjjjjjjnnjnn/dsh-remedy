#!/usr/bin/env node
/**
 * R61 · P-0051 — the CLI now names a tool a resume dropped, and this records that
 * the two commands agree about it.
 *
 * The line `explain` prints is worth nothing if it counts a different number from
 * `scan`: the patch would then have two readers with two rules, which is the defect
 * P-0016 closed for the coverage table. So this recorder refuses to write unless
 *
 *   1. `scan --json` and `explain` were both run over the same directory,
 *   2. `explain` exited 1 and printed exactly one DROPPED line,
 *   3. the number on that line equals `scan`'s `dropped_tools`,
 *   4. at least one loss was measured (a zero would record nothing).
 *
 * The profile half is optional and recorded as given or not: the drop is a property
 * of the session, so the line must appear without a profile too, and this recorder
 * proves that by running `explain` with no `--profile-file` at all.
 *
 *   node scripts/record_explain_drift.mjs --stamp 2026-11-17T10:00:00.000Z
 *   node scripts/record_explain_drift.mjs --stamp … --sessions <dir>   # an isolated copy
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { redactValue } from '../packages/core/dist/index.js'
import { abs, isoStamp } from './lib/kit.mjs'
import { sessionRoot } from './lib/session-root.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_explain_drift: --stamp must be ISO-8601\n')
  process.exit(2)
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const root = flag('sessions') ?? sessionRoot()
if (!existsSync(root)) {
  process.stderr.write(`record_explain_drift: no session directory at ${root}\n`)
  process.exit(3)
}

const cli = abs('packages/plugin/dist/cli.js')
const run = (args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: abs('.') })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const scan = run(['scan', root, '--json'])
const explain = run(['explain', '--sessions', root])

let scanReport = null
try {
  scanReport = JSON.parse(scan.stdout)
} catch {
  process.stderr.write(`record_explain_drift: scan --json did not answer JSON: ${scan.stdout.slice(0, 200)}\n`)
  process.exit(4)
}

const droppedLine = explain.stdout.split(/\r?\n/).find((line) => line.startsWith('DROPPED')) ?? null
const stated = droppedLine === null ? null : Number(/DROPPED — (\d+) tool/.exec(droppedLine)?.[1] ?? NaN)

const problems = []
// `scan` exits 1 when it measured fusion failures (47 on this machine), which is a
// different signal from the count this artifact is about, so both codes are accepted
// and recorded rather than folded into one.
if (scan.status !== 0 && scan.status !== 1) problems.push(`scan exited ${scan.status}`)
if (scanReport?.dropped_tools === undefined) problems.push('scan --json carries no dropped_tools')
if (explain.status !== 1) problems.push(`explain exited ${explain.status}; a measured drop is a finding`)
if (droppedLine === null) problems.push('explain printed no DROPPED line')
if (Number.isNaN(stated)) problems.push('the DROPPED line carries no readable count')
if (droppedLine !== null && scanReport?.dropped_tools !== stated) {
  problems.push(`explain says ${stated} and scan says ${scanReport?.dropped_tools}: two readers, two rules`)
}
if ((scanReport?.dropped_tools ?? 0) <= 0) {
  problems.push('no loss was measured, so there is nothing to record')
}
// The negative half of the patch: the line must be one, not one per row.
const droppedLines = explain.stdout.split(/\r?\n/).filter((line) => line.startsWith('DROPPED')).length
if (droppedLines !== 1) problems.push(`explain printed ${droppedLines} DROPPED line(s); the patch promises one`)
if (problems.length > 0) {
  process.stderr.write(`record_explain_drift: the two commands do not agree: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_explain_drift.mjs',
  generated_at: stamp,
  question:
    'P-0050 counts a resume that stopped declaring a tool this session called. Does the command a person runs name the same number, and does it need a profile to say it?',
  method: {
    root,
    reader: 'the built CLI: `scan --json` for the count, `explain --sessions` for the finding',
    rule:
      'packages/core/src/capability.ts capabilityDrift(), folded by session-scan.ts; explain reads report.dropped_tools from the same batch scan',
    why_the_two_runs:
      'one reader with two definitions is the defect P-0016 closed. This artifact exists only if the two commands answer the same number over the same bytes.',
  },
  measured: {
    scan: { exit: scan.status, dropped_tools: scanReport.dropped_tools, files: scanReport.files },
    explain: {
      exit: explain.status,
      dropped_line: droppedLine,
      stated: stated,
      profile_file: null,
      counts_unknown: /\ncounts are unknown/.test(explain.stdout),
    },
    agree: scanReport.dropped_tools === stated,
  },
  not_proven: [
    'What the model remembers is not in the log; this artifact records that the request set moved and that two commands agree about it.',
    'Only the given session directory was read; another deployment may never resume across a profile.',
    'A session file with no request/header cannot move this number, so silence is unmeasured rather than clean.',
  ],
}

const redacted = redactValue(payload)
const raw = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/explain-drift-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_explain_drift: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), raw, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(raw)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(raw).slice(0, 12)}…\n`)
