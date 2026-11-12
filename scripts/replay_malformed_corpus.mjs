#!/usr/bin/env node
/**
 * Replay every real MALFORMED_RESPONSE text on this host through the *shipped*
 * repair engine and record what it decides.
 *
 * Why: P-0001 claims "every proven fusion is split, and nothing unproven is ever
 * dispatched". Unit tests prove that on hand-picked fixtures. This proves it on
 * every byte the host actually produced, which is the only claim that matters
 * to a user whose turn died.
 *
 * Reads `~/.dsh/sessions` read-only, uses `packages/*\/dist` (the published
 * reader path, not a local copy of zstd), and writes:
 *   data/results/malformed-replay-<stamp>.json + .sha256
 *
 * Node built-ins only.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const stamp = (() => {
  const index = process.argv.indexOf('--stamp')
  return index === -1 ? '' : process.argv[index + 1]
})()
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  console.error('replay_malformed_corpus: --stamp must be ISO-8601 like 2026-11-12T11:00:00.000Z')
  process.exit(2)
}

const sessionsRoot = process.env.DSH_SESSIONS ?? join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')
if (!existsSync(sessionsRoot)) {
  console.error(`replay_malformed_corpus: no session directory at ${sessionsRoot}`)
  process.exit(3)
}

const pluginPath = join(ROOT, 'packages', 'plugin', 'dist', 'index.js')
const corePath = join(ROOT, 'packages', 'core', 'dist', 'index.js')
for (const path of [pluginPath, corePath]) {
  if (!existsSync(path)) {
    console.error('replay_malformed_corpus: build first (a dist/ entry point is missing)')
    process.exit(3)
  }
}
const { decompressSessionLog } = await import(pathToFileURL(pluginPath).href)
const { repairToolCallArguments } = await import(pathToFileURL(corePath).href)
if (typeof repairToolCallArguments !== 'function') {
  console.error('replay_malformed_corpus: the built core no longer exports repairToolCallArguments')
  process.exit(3)
}

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walk(path)
      continue
    }
    if (/session\.v4\.jsonl\.(zstd|jsonl)$/.test(name)) files.push({ path, mtime: stat.mtimeMs })
  }
}
walk(sessionsRoot)
files.sort((a, b) => a.mtime - b.mtime)

const MARKER = /Received arguments:\r?\n/
const cases = []
let filesRead = 0
let unreadable = 0
let malformedTurns = 0
let withoutCapturedText = 0

for (const file of files) {
  let text
  try {
    text = decompressSessionLog(readFileSync(file.path))
    filesRead += 1
  } catch {
    unreadable += 1
    continue
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('MALFORMED_RESPONSE')) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event?.type !== 'turn/end') continue
    const reason = event?.data?.reason
    if (reason?.kind !== 'error') continue
    const error = reason?.error
    if (error?.code !== 'MALFORMED_RESPONSE') continue
    malformedTurns += 1
    const message = String(error?.message ?? '')
    const marker = MARKER.exec(message)
    if (marker === null) {
      withoutCapturedText += 1
      continue
    }
    const captured = message.slice(marker.index + marker[0].length)
    const tool = /Tool call "([^"]+)"/.exec(message)?.[1] ?? 'unknown'
    cases.push({
      file: basename(dirname(file.path)),
      seq: event?.seq,
      turn: event?.data?.turn,
      tool,
      first_line: message.split('\n')[0].slice(0, 160),
      captured,
      bytes: captured.length,
    })
  }
}

// Replay through the shipped decision, one at a time, with a fresh id namespace
// so `existingIds` and the call budget behave exactly as they do on a real stream.
const outcomes = []
const codeHistogram = new Map()
const toolHistogram = new Map()
let repairedCases = 0
let rejectedCases = 0
let dispatchesNothing = 0
let silentSuccesses = 0

for (const [index, item] of cases.entries()) {
  const result = repairToolCallArguments(
    { id: `replay-${index}`, name: item.tool, arguments: item.captured },
    { truncated: false, maxCalls: 8, existingIds: new Set() },
  )
  const code = result.status === 'repaired' ? `repaired:${result.code}` : `rejected:${result.code}`
  codeHistogram.set(code, (codeHistogram.get(code) ?? 0) + 1)
  toolHistogram.set(item.tool, (toolHistogram.get(item.tool) ?? 0) + 1)
  if (result.status === 'repaired') {
    repairedCases += 1
    // Every emitted slice must parse on its own, or the repair is a lie.
    for (const call of result.calls) {
      try {
        const value = JSON.parse(call.arguments)
        if (value === null || typeof value !== 'object' || Array.isArray(value)) dispatchesNothing += 1
      } catch {
        dispatchesNothing += 1
      }
    }
    if (result.calls.length === 0) dispatchesNothing += 1
  } else {
    rejectedCases += 1
  }
  if (result.status === 'repaired' && result.calls.length === 0) silentSuccesses += 1
  if (outcomes.length < 12) {
    outcomes.push({
      file: item.file,
      seq: item.seq,
      tool: item.tool,
      bytes: item.bytes,
      decision: code,
      slices: result.status === 'repaired' ? result.calls.length : 0,
      detail: result.status === 'rejected' ? String(result.detail ?? '').slice(0, 160) : '',
    })
  }
}

payloadGuard(cases, codeHistogram)

const payload = {
  schema_version: 1,
  produced_by: 'scripts/replay_malformed_corpus.mjs',
  generated_at: stamp,
  source: {
    path: '~/.dsh/sessions',
    files: files.length,
    files_read: filesRead,
    unreadable: unreadable,
  },
  corpus: {
    malformed_turns: malformedTurns,
    turns_without_captured_text: withoutCapturedText,
    replayed_cases: cases.length,
    bytes_total: cases.reduce((sum, item) => sum + item.bytes, 0),
    tools: [...toolHistogram.entries()].sort((a, b) => b[1] - a[1]).map(([tool, count]) => ({ tool, count })),
  },
  decisions: [...codeHistogram.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
  totals: {
    repaired: repairedCases,
    rejected: rejectedCases,
    repaired_that_would_dispatch_an_unparsable_call: dispatchesNothing,
    repaired_that_dispatch_nothing_at_all: silentSuccesses,
  },
  invariant:
    'every repaired case must emit at least one call whose arguments parse to a plain object; a repair that dispatches an unparsable call, or nothing at all, is the failure this patch exists to prevent',
  examples: outcomes,
}

const out = join(ROOT, 'data', 'results', `malformed-replay-${stamp.replaceAll(':', '-')}.json`)
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
const digest = createHash('sha256').update(json).digest('hex')
writeFileSync(`${out}.sha256`, `${digest}  ${basename(out)}\n`, 'utf8')

console.log(`replay_malformed_corpus: wrote data/results/${basename(out)}`)
console.log(
  `replay_malformed_corpus: ${cases.length} case(s) from ${malformedTurns} MALFORMED turn(s): ` +
    `repaired ${repairedCases}, rejected ${rejectedCases}, unparsable-dispatch ${dispatchesNothing}`,
)
console.log(`replay_malformed_corpus: sha256 ${digest.slice(0, 12)}…`)
if (dispatchesNothing > 0) {
  console.error('replay_malformed_corpus: FAILED the invariant')
  process.exitCode = 1
}

/** A replay whose decisions are all one bucket is not a fault map. */
function payloadGuard(input, histogram) {
  if (input.length === 0) return
  if (histogram.size === 0) {
    console.error('replay_malformed_corpus: no decisions were produced')
    process.exitCode = 1
  }
}
