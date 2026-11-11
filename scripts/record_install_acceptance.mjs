#!/usr/bin/env node
/**
 * Record the stranger-install acceptance from the registry, as an artifact.
 *
 * `data/results` may only hold files a script produced, and for a long time the
 * one acceptance that matters most — a cold directory installing the published
 * package and getting a green `verify` — existed only as a sentence in the
 * handoff. This script makes it a file with a hash sidecar, so the claim can be
 * re-checked instead of re-believed.
 *
 * What it does NOT do: it never installs a local tarball. The point of the
 * acceptance is that the registry copy resolves and runs, so `--version` is
 * required and the install always names that exact version.
 *
 * Node built-ins only, like every other file under `scripts/`.
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const WINDOWS = process.platform === 'win32'

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const version = flag('version', '')
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('record_install_acceptance: --version must be an exact version like 0.3.6')
  process.exit(2)
}
const stamp = flag('stamp', '')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  console.error('record_install_acceptance: --stamp must be ISO-8601 like 2026-11-11T19:30:00.000Z')
  process.exit(2)
}

const packageJson = JSON.parse(readFileSync(join(ROOT, 'packages', 'plugin', 'package.json'), 'utf8'))
if (packageJson.version !== version) {
  console.error(
    `record_install_acceptance: the workspace plugin is ${packageJson.version}, not ${version}. ` +
      'The acceptance must cover the version that is packed and published.',
  )
  process.exit(3)
}

function npmCommand() {
  // Windows ships `npm.cmd`; Node refuses to spawn a `.cmd` without a shell.
  return WINDOWS
    ? { command: 'npm', args: [], options: { shell: true } }
    : { command: 'npm', args: [], options: {} }
}

function run(dir, args) {
  const base = npmCommand()
  const result = spawnSync(base.command, args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 600000,
    ...base.options,
  })
  return {
    args,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  }
}

const dir = mkdtempSync(join(tmpdir(), `dsh-remedy-acceptance-${version}-`))
const steps = []
let ok = false
let verifyOutput = ''
let blocked = null

try {
  steps.push(run(dir, ['init', '-y']))
  if (steps[0].status !== 0) blocked = 'npm init failed'
  if (blocked === null) {
    steps.push(run(dir, ['install', `dsh-remedy@${version}`]))
    if (steps[1].status !== 0) blocked = 'the registry install failed'
  }
  if (blocked === null) {
    steps.push(run(dir, ['exec', '--', 'dsh-remedy', 'verify']))
    verifyOutput = `${steps[2].stdout}${steps[2].stderr}`
    if (steps[2].status !== 0) blocked = 'verify exited non-zero'
    else if (!/OK\s+6 fixture\(s\)/.test(verifyOutput)) blocked = 'verify did not print OK 6 fixture(s)'
    else ok = true
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const installed = `${version}`
const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_install_acceptance.mjs',
  generated_at: stamp,
  source: {
    registry: 'https://registry.npmjs.org',
    package: 'dsh-remedy',
    version,
    cold_directory: true,
    workspace_plugin_version: packageJson.version,
  },
  claimed: {
    command: `npm install dsh-remedy@${version} && dsh-remedy verify`,
    expected: 'OK 6 fixture(s)',
  },
  steps: steps.map((step) => ({
    args: step.args,
    status: step.status,
    stdout_tail: step.stdout.trim().split('\n').slice(-3).join('\n'),
    stderr_tail: step.stderr.trim().split('\n').slice(-3).join('\n'),
    error: step.error,
  })),
  verify_output: verifyOutput.trim(),
  installed_version: ok ? installed : null,
  ok,
  blocked,
}

const out = join(ROOT, 'data', 'results', `install-acceptance-${stamp.replaceAll(':', '-')}.json`)
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
const digest = createHash('sha256').update(json).digest('hex')
writeFileSync(`${out}.sha256`, `${digest}  ${basename(out)}\n`, 'utf8')

console.log(`record_install_acceptance: wrote ${relative(ROOT, out)}`)
console.log(`record_install_acceptance: ${ok ? 'ok' : `failed (${blocked})`} · ${version} · sha256 ${digest.slice(0, 12)}…`)
process.exitCode = ok ? 0 : 1
