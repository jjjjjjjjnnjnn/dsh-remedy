#!/usr/bin/env node
/**
 * Record one adaptation run: a plugin version mounted on one DSH version.
 *
 * The question this artifact answers is the one a version number cannot: does
 * the installed runtime still accept the shapes this plugin emits, and does a
 * rescue it claims actually reach a tool call?
 *
 * Inputs are read, never produced: the isolated DSH_HOME keeps its own journal
 * and session logs, and the runtime's own `runtime.json` names the version. The
 * artifact therefore records what happened on this machine, not what the
 * repository hopes happened.
 *
 * Usage:
 *   node scripts/record_adaptation.mjs --home .tmp/adapt-rc3-home --stamp <ISO>
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const home = flag('home', null)
const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (home === null) {
  process.stderr.write('record_adaptation: --home <isolated DSH_HOME> is required\n')
  process.exit(2)
}
if (stamp === null) {
  process.stderr.write('record_adaptation: --stamp must be ISO-8601\n')
  process.exit(2)
}
if (!existsSync(abs(home))) {
  process.stderr.write(`record_adaptation: no such home ${home}\n`)
  process.exit(3)
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/** The installed runtime names its own version; never infer it from a path. */
function runtimeVersion() {
  const candidates = [
    'C:/Users/rongj/AppData/Local/Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json',
    join(home, '../dsh-runtimes/dsh-primary-runtime/runtime.json'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
    if (typeof parsed.desktopVersion === 'string') return { version: parsed.desktopVersion, source: candidate }
  }
  return { version: null, source: null }
}

/** The plugin version the profile actually installed. */
function pluginVersion() {
  const profiles = join(home, 'profiles')
  for (const profile of readdirSync(profiles)) {
    const manifest = join(profiles, profile, 'node_modules/dsh-remedy/package.json')
    if (!existsSync(manifest)) continue
    return { profile, version: JSON.parse(readFileSync(manifest, 'utf8')).version }
  }
  return { profile: null, version: null }
}

function journal() {
  const lines = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (entry.name !== 'journal.jsonl') continue
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        if (line.trim() === '') continue
        try {
          lines.push({ ...JSON.parse(line), file: path })
        } catch {
          // an unreadable journal line is not evidence
        }
      }
    }
  }
  walk(abs(home))
  return lines
}

function sessions() {
  const out = []
  const root = join(abs(home), 'sessions')
  if (!existsSync(root)) return out
  for (const workspace of readdirSync(root)) {
    const workspaceDir = join(root, workspace)
    if (!statSync(workspaceDir).isDirectory()) continue
    for (const session of readdirSync(workspaceDir)) {
      const file = join(workspaceDir, session, 'session.v4.jsonl.zstd')
      if (!existsSync(file)) continue
      const bytes = readFileSync(file)
      const text = decompressSessionLog(bytes)
      const calls = []
      const results = new Map()
      let turnEnd = null
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (event.type === 'tool/call') {
          const data = event.data ?? {}
          calls.push({
            id: String(data.id ?? data.callId ?? ''),
            name: data.name ?? data.tool ?? '',
            argumentsBytes: Buffer.byteLength(String(data.arguments ?? '')),
          })
        }
        if (event.type === 'tool/result') {
          const source = (event.data ?? {}).message?.source ?? {}
          if (source.callId !== undefined) {
            results.set(String(source.callId), Boolean((event.data ?? {}).message?.isError))
          }
        }
        if (event.type === 'turn/end') turnEnd = event.data?.reason ?? null
      }
      const synthetics = calls.filter((call) => call.id.includes('#remedy-'))
      out.push({
        session: basename(session),
        sha256: sha256(bytes),
        events: text.split('\n').filter((line) => line.trim() !== '').length,
        turn_end: turnEnd,
        tool_calls: calls.length,
        synthetic_calls: synthetics.map((call) => ({
          id: call.id,
          name: call.name,
          dispatched: results.has(call.id),
          errored: results.get(call.id) ?? null,
          /** The name a split fragment inherited, and whether the stream proved it. */
          name_proven_by_stream: false,
        })),
      })
    }
  }
  return out
}

const version = runtimeVersion()
const plugin = pluginVersion()
const journalLines = journal()
const repaired = journalLines.filter((line) => line.kind === 'repaired')
const lastCounters = journalLines.at(-1)?.counters ?? null

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_adaptation.mjs',
  generated_at: stamp,
  home,
  runtime: version,
  plugin,
  mounted: repaired.length > 0 || journalLines.length > 0,
  journal: {
    lines: journalLines.length,
    repaired_events: repaired.length,
    last_counters: lastCounters,
    repaired: repaired.slice(-3).map((line) => ({
      at: line.at,
      tool: line.tool,
      call_id: line.callId,
      fragments: line.fragments,
      counters: line.counters,
    })),
  },
  sessions: sessions(),
  limits: [
    'this records one host and one adapter route; another provider may fuse differently',
    'a mounted plugin is proven by its journal lines, not by the absence of an error',
    'the synthetic ids come from the plugin, so a name_proven_by_stream of false means the name was assumed',
  ],
}

const name = `adaptation-${String(plugin.version ?? 'unknown')}-on-${String(version.version ?? 'unknown')}-${stamp.replaceAll(':', '-')}.json`
const path = `data/results/${name}`
if (existsSync(abs(path))) {
  process.stderr.write(`record_adaptation: ${path} already exists; pick a new stamp\n`)
  process.exit(1)
}
const text = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(abs(path), text, 'utf8')
writeFileSync(abs(`${path}.sha256`), `${sha256(text)}\n`, 'utf8')
process.stdout.write(`RECORDED ${path}\nsha256 ${sha256(text).slice(0, 8)}…\n`)
process.stdout.write(`runtime ${version.version} · plugin ${plugin.version} · repaired ${repaired.length}\n`)
if (dirname(path) !== 'data/results') process.exit(1)
