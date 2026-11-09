#!/usr/bin/env node
/**
 * Record the post-publish registry state as SSOT.
 *
 *   node scripts/record_publish.mjs --stamp <ISO> [--retries 3]
 *
 * Run this AFTER `pnpm -r publish`. It checks both packages by exact version and
 * by `dist-tags.latest`, writes `data/results/publish-<stamp>.json` + `.sha256`,
 * and exits 1 when a copy is missing or lagging. A red artifact is evidence too:
 * do not edit it, wait for the registry copy and record a new stamp.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('record_publish: --stamp must be ISO-8601\n')
  process.exit(2)
}
const retries = Math.max(1, Number.parseInt(flag('retries', '1'), 10) || 1)

const packages = ['dsh-remedy-core', 'dsh-remedy'].map((name) => {
  const dir = name === 'dsh-remedy' ? 'packages/plugin' : 'packages/core'
  const pkg = JSON.parse(readFileSync(abs(join(dir, 'package.json')), 'utf8'))
  return { name, dir, version: pkg.version }
})

const npm = (args) => spawnSync('npm', args, { encoding: 'utf8', shell: process.platform === 'win32' })

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const checks = []
for (const pkg of packages) {
  let registryVersion = null
  let latest = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const exact = npm(['view', `${pkg.name}@${pkg.version}`, 'version'])
    const tags = npm(['view', pkg.name, 'dist-tags', '--json'])
    registryVersion = exact.status === 0 ? exact.stdout.trim() : null
    try {
      latest = tags.status === 0 ? (JSON.parse(tags.stdout).latest ?? null) : null
    } catch {
      latest = null
    }
    if (registryVersion === pkg.version && latest === pkg.version) break
    if (attempt < retries) sleep(60000)
  }
  checks.push({
    name: pkg.name,
    local: pkg.version,
    registry: registryVersion,
    latest,
    exact_ok: registryVersion === pkg.version,
    latest_ok: latest === pkg.version,
  })
}

const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
const ok = checks.every((item) => item.exact_ok && item.latest_ok)

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_publish.mjs',
  generated_at: stamp,
  source: {
    git_head: head.status === 0 ? head.stdout.trim() : null,
    git_dirty: status.status === 0 ? status.stdout.trim() !== '' : null,
  },
  packages: checks,
  ok,
}
const text = `${JSON.stringify(payload, null, 2)}\n`
const name = `publish-${stamp.replaceAll(':', '-')}.json`
const path = abs(join('data/results', name))
if (existsSync(path)) {
  process.stderr.write(`record_publish: refusing to overwrite data/results/${name}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(path, text, 'utf8')
writeFileSync(`${path}.sha256`, `${sha256(text)}\n`, 'utf8')
process.stdout.write(`RECORDED data/results/${name}\n${JSON.stringify(checks, null, 2)}\n`)
process.exitCode = ok ? 0 : 1
