#!/usr/bin/env node
/**
 * R71 · why the desktop turn is still not run: the provider key, measured.
 *
 *   node scripts/record_credential_probe.mjs --run .tmp/r71-runs/real/turn --stamp <ISO>
 *
 * R69 and R71 both answered `AUTH` on the desktop route. The open question was
 * whether the App fails to see the key or the key is dead. This reads one
 * isolated `DSH_HOME` run that uses the same `~/.dsh/.credentials.yaml`: if the
 * refusals are identical there, the key is the problem and the App is not.
 *
 * The recorder refuses to write unless the run failed before any model request
 * with the provider's own refusal, so a "no requests" result cannot be recorded
 * as a finding when it was really a broken profile.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_credential_probe: --stamp must be ISO-8601\n')
  process.exit(2)
}
const runDir = flag('run')
if (runDir === undefined || !existsSync(join(resolve(runDir), 'result.json'))) {
  process.stderr.write('record_credential_probe: --run must point at a run directory with result.json\n')
  process.exit(3)
}

const run = JSON.parse(readFileSync(join(resolve(runDir), 'result.json'), 'utf8'))
const stderr = (run.stderr ?? []).filter((line) => line.trim() !== '')
const requests = run.requests ?? []
const first = stderr[0] ?? ''

const problems = []
if (run.exit_code === 0) problems.push('the run completed, so the key is not dead and this artifact would be a lie')
if (requests.length !== 0) problems.push(`the run made ${requests.length} model request(s); a refused key should make none`)
if (!/403/.test(first)) problems.push(`the first stderr line does not carry the provider status: ${first.slice(0, 80)}`)
if (!/forbidden_api_key|api key revoked|invalid_api_key/i.test(first)) {
  problems.push('the refusal is not the provider rejecting the key')
}
if (problems.length > 0) {
  process.stderr.write(`record_credential_probe: the run is not the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_credential_probe.mjs',
  generated_at: stamp,
  question:
    'The desktop turn has answered AUTH since R69. Is the provider key missing from the App environment, or is the key itself dead?',
  probe: {
    how: 'one isolated DSH_HOME whose profile copies ~/.dsh/.credentials.yaml and mounts this tree through the real opendesign route; the headless CLI runs one turn',
    provider: 'opendesign / deepseek-v4.1-flash-eco (the route this machine uses)',
    isolation: 'nothing under ~/.dsh is written or read at run time beyond that credentials file',
  },
  observed: {
    exit_code: run.exit_code,
    model_requests: requests.length,
    stderr_first: redactValue(first).value,
    turn_end: 'error/AUTH (no stream was opened, so the remedy journal is empty)',
    journal_lines: run.journal === null ? 0 : 1,
  },
  conclusion:
    'The key is dead: the provider answered `403 forbidden_api_key … api key revoked` to a headless run that carries the same credentials file, before any model request. The desktop App is therefore not the variable, and no desktop turn can be recorded until the key is replaced.',
  not_proven: [
    'whether the App would reach the provider with a working key: no working key exists on this machine to try',
    'whether the route itself changed: the refusal is about the key, not about the endpoint',
  ],
  sources: {
    'result.json': sha256(readFileSync(join(resolve(runDir), 'result.json'))),
  },
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out') ?? `data/results/live-credential-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_credential_probe: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
process.stdout.write(`exit ${run.exit_code} · requests ${requests.length} · ${redactValue(first).value.slice(0, 60)}\n`)
