#!/usr/bin/env node
/**
 * Gate runner.
 *
 *   node scripts/gate.mjs              run every registered gate
 *   node scripts/gate.mjs --fast       skip gates that need a build
 *   node scripts/gate.mjs --mutate     negative controls: every gate MUST fail
 *   node scripts/gate.mjs --json       machine-readable summary
 *
 * The registry lives in `audit/gate_ledger.json`; `tests/governance` keeps the
 * registry and `scripts/` in sync, so a new gate cannot be forgotten.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, readJson, repoRoot, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const fast = argv.includes('--fast')
const mutate = argv.includes('--mutate')
const json = argv.includes('--json')
const record = argv.includes('--record')
const stampIndex = argv.indexOf('--stamp')
const rawStamp = stampIndex === -1 ? new Date().toISOString() : (argv[stampIndex + 1] ?? new Date().toISOString())
const stamp = isoStamp(rawStamp)
if (stamp === null) {
  process.stderr.write(`invalid --stamp "${rawStamp}": expected ISO-8601, e.g. 2026-11-09T00:00:00.000Z\n`)
  process.exit(2)
}

const ledger = readJson('audit/gate_ledger.json')
const gates = (ledger.gates ?? []).filter((gate) => !(fast && gate.requires_build))

const results = []
for (const gate of gates) {
  const args = [gate.script]
  if (mutate) args.push('--mutate')
  if (json) args.push('--json')
  const started = Date.now()
  const run = spawnSync(process.execPath, args, { cwd: repoRoot(), encoding: 'utf8' })
  const durationMs = Date.now() - started
  const exitCode = run.status ?? 1
  const passed = mutate ? exitCode !== 0 : exitCode === 0
  results.push({
    id: gate.id,
    script: gate.script,
    exitCode,
    durationMs,
    ok: passed,
    log: mutate ? undefined : tail(`${run.stdout ?? ''}${run.stderr ?? ''}`),
  })
  if (!json) {
    const label = mutate ? (exitCode !== 0 ? 'CAUGHT' : 'MISSED') : exitCode === 0 ? 'PASS' : 'FAIL'
    process.stdout.write(`${label.padEnd(7)} ${gate.id.padEnd(18)} ${String(durationMs).padStart(5)}ms\n`)
    if (!passed) {
      process.stdout.write(`${tail(`${run.stdout ?? ''}${run.stderr ?? ''}`, 12)}\n`)
    }
  }
}

const failed = results.filter((result) => !result.ok)
if (json) {
  process.stdout.write(
    `${JSON.stringify(
      { mode: mutate ? 'mutate' : 'normal', fast, ok: failed.length === 0, gates: results },
      null,
      2,
    )}\n`,
  )
} else if (mutate) {
  const caught = results.filter((result) => result.ok).length
  process.stdout.write(
    `\n${failed.length === 0 ? `NEGATIVE CONTROL PASSED · ${caught}/${gates.length} gates caught their injected violation` : `NEGATIVE CONTROL FAILED · ${failed.length} gate(s) stayed green (vacuous)`}\n`,
  )
} else {
  process.stdout.write(`\n${failed.length === 0 ? 'ALL GREEN' : `${failed.length} GATE(S) FAILED`} · ${gates.length} gates\n`)
}

if (record) {
  // A gate run is itself evidence. Durations are excluded: including them would
  // make the artifact unreproducible.
  const payload = {
    schema_version: 1,
    produced_by: 'scripts/gate.mjs',
    generated_at: stamp,
    mode: mutate ? 'mutate' : 'normal',
    fast,
    ok: failed.length === 0,
    gates: results.map((result) => ({
      id: result.id,
      script: result.script,
      exitCode: result.exitCode,
      ok: result.ok,
    })),
  }
  const text = `${JSON.stringify(payload, null, 2)}\n`
  mkdirSync(abs('data/results'), { recursive: true })
  const name = `gates-${mutate ? 'mutate-' : ''}${stamp.replaceAll(':', '-')}.json`
  if (existsSync(abs(join('data/results', name)))) {
    process.stderr.write(
      `refusing to overwrite existing evidence: data/results/${name}\n` +
        '  a stamp identifies an artifact; pick a stamp this round has not used yet\n',
    )
    process.exit(2)
  }
  writeFileSync(abs(join('data/results', name)), text, 'utf8')
  writeFileSync(abs(join('data/results', `${name}.sha256`)), `${sha256(text)}\n`, 'utf8')
  process.stdout.write(`RECORDED data/results/${name}\n`)
}

function tail(text, lines = 8) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n')
}
