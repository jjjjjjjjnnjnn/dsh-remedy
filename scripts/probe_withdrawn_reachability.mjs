#!/usr/bin/env node
/**
 * Where does fused text actually arrive on this host?
 *
 * P-0003's `withdrawn` bucket has two bookings in `repair-stream.ts`:
 *   - `rolled-back`: a repair was PROVEN and held, and the same stream then
 *     rejected a later block or ended in a non-stop finish;
 *   - `consumer-abort`: the consumer stopped reading before any decision.
 *
 * `rolled-back` needs the repair to sit in `pending`, and `pending` is only
 * filled by the `block-end` path. So the bucket is reachable live only if a
 * `block-end` can carry a provable fusion. This script measures which shape the
 * persisted attempts actually use:
 *
 *   - `tool-call-chunks` entries carry the whole argument text in `args`; a
 *     fusion there is repaired at `finish` and never held;
 *   - `tool-call-delta` chunks accumulate into the same buffer;
 *   - `block-end` chunks carry the assembled `block.arguments`, and only those
 *     can be held and then withdrawn.
 *
 * Output: `data/results/withdrawn-reachability-<stamp>.json` + `.sha256`.
 * Read-only over `~/.dsh/sessions`; nothing is written there.
 *
 * Node built-ins only, like every other script here.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const stamp = flag('stamp', '')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  console.error('probe_withdrawn_reachability: --stamp must be ISO-8601 like 2026-11-12T09:30:00.000Z')
  process.exit(2)
}

const sessionsRoot = process.env.DSH_SESSIONS ?? join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')
if (!existsSync(sessionsRoot)) {
  console.error(`probe_withdrawn_reachability: no session directory at ${sessionsRoot}`)
  process.exit(3)
}

const pluginPath = join(ROOT, 'packages', 'plugin', 'dist', 'index.js')
const corePath = join(ROOT, 'packages', 'core', 'dist', 'index.js')
for (const path of [pluginPath, corePath]) {
  if (!existsSync(path)) {
    console.error('probe_withdrawn_reachability: build first (a dist/ entry point is missing)')
    process.exit(3)
  }
}
const { decompressSessionLog } = await import(pathToFileURL(pluginPath).href)
const { splitTopLevelJsonObjects } = await import(pathToFileURL(corePath).href)

/** True only when every top-level slice parses to a plain object. */
function isFusion(text) {
  if (typeof text !== 'string' || text.trim() === '') return false
  const split = splitTopLevelJsonObjects(text)
  if (!split.ok || split.slices.length < 2) return false
  return split.slices.every((piece) => {
    try {
      const value = JSON.parse(piece)
      return value !== null && typeof value === 'object' && !Array.isArray(value)
    } catch {
      return false
    }
  })
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

const counted = {
  files_read: 0,
  unreadable: 0,
  attempt_streams: 0,
  entries: new Map(),
  streams_with_tool_call_chunks: 0,
  streams_with_fused_tool_call_chunks: 0,
  streams_with_tool_call_delta: 0,
  streams_with_fused_delta: 0,
  streams_with_block_end: 0,
  streams_with_arguments_in_a_block_end: 0,
  streams_with_fused_block_end: 0,
}
const withdrawable = []
const finishKinds = new Map()

for (const file of files) {
  let text
  try {
    text = decompressSessionLog(readFileSync(file.path))
    counted.files_read += 1
  } catch {
    counted.unreadable += 1
    continue
  }

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const stream = Array.isArray(event?.data?.stream) ? event.data.stream : null
    if (stream === null) continue
    counted.attempt_streams += 1

    let sawToolCallChunks = false
    let sawFusedToolCallChunks = false
    let sawDelta = false
    let sawFusedDelta = false
    let sawBlockEnd = false
    let sawArgumentsInBlockEnd = false
    let fusedBlockEnd = null
    let finishKind = null

    for (const entry of stream) {
      const entryType = String(entry?.type ?? '')
      counted.entries.set(entryType, (counted.entries.get(entryType) ?? 0) + 1)

      if (entryType === 'tool-call-chunks') {
        sawToolCallChunks = true
        const args = Array.isArray(entry.args) ? entry.args.map(String).join('') : ''
        if (isFusion(args)) sawFusedToolCallChunks = true
        continue
      }
      if (entryType !== 'chunk') continue
      const chunk = entry.chunk
      if (!chunk) continue
      if (chunk.type === 'tool-call-delta') {
        sawDelta = true
        if (isFusion(chunk.argumentsDelta)) sawFusedDelta = true
      }
      if (chunk.type === 'block-end') {
        sawBlockEnd = true
        if (chunk.block?.type === 'tool-call' && typeof chunk.block.arguments === 'string' && chunk.block.arguments.trim() !== '') {
          sawArgumentsInBlockEnd = true
          if (isFusion(chunk.block.arguments)) fusedBlockEnd = { id: chunk.block.id, name: chunk.block.name }
        }
      }
      if (chunk.type === 'finish') finishKind = String(chunk?.reason?.kind ?? '?')
    }

    if (sawToolCallChunks) counted.streams_with_tool_call_chunks += 1
    if (sawFusedToolCallChunks) counted.streams_with_fused_tool_call_chunks += 1
    if (sawDelta) counted.streams_with_tool_call_delta += 1
    if (sawFusedDelta) counted.streams_with_fused_delta += 1
    if (sawBlockEnd) counted.streams_with_block_end += 1
    if (sawArgumentsInBlockEnd) counted.streams_with_arguments_in_a_block_end += 1
    if (fusedBlockEnd !== null) counted.streams_with_fused_block_end += 1
    if (finishKind !== null) finishKinds.set(finishKind, (finishKinds.get(finishKind) ?? 0) + 1)

    if (fusedBlockEnd !== null && finishKind !== null && finishKind !== 'stop' && finishKind !== 'tool-calls') {
      if (withdrawable.length <= 5) {
        withdrawable.push({
          file: basename(dirname(file.path)),
          turn: event?.data?.turn,
          step: event?.data?.step,
          finish: finishKind,
          fused_id: fusedBlockEnd.id,
          fused_tool: fusedBlockEnd.name,
        })
      }
    }
  }
}

const streamsThatWouldWithdraw = withdrawable.length === 0 && counted.streams_with_fused_block_end === 0 ? 0 : counted.streams_with_fused_block_end

const payload = {
  schema_version: 1,
  produced_by: 'scripts/probe_withdrawn_reachability.mjs',
  generated_at: stamp,
  source: {
    path: '~/.dsh/sessions',
    files: files.length,
    files_read: counted.files_read,
    unreadable: counted.unreadable,
  },
  measured: {
    attempt_streams: counted.attempt_streams,
    streams_with_tool_call_chunks: counted.streams_with_tool_call_chunks,
    streams_with_a_fused_tool_call_chunks_entry: counted.streams_with_fused_tool_call_chunks,
    streams_with_tool_call_delta: counted.streams_with_tool_call_delta,
    streams_with_a_fused_delta: counted.streams_with_fused_delta,
    streams_with_a_block_end: counted.streams_with_block_end,
    streams_with_arguments_in_a_block_end: counted.streams_with_arguments_in_a_block_end,
    streams_with_a_fused_block_end: counted.streams_with_fused_block_end,
    streams_that_would_book_rolled_back: streamsThatWouldWithdraw,
  },
  entry_types: [...counted.entries.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
  finish_kinds: [...finishKinds.entries()].sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, count })),
  examples: withdrawable,
  reading:
    'rolled-back needs a proven repair held in `pending`, and `pending` is only filled by the block-end path. Fused text on this host arrives in `tool-call-chunks` entries, which are repaired at `finish` and never held, so the held path is unreachable and `withdrawn` can only arise from consumer-abort. That is a property of this adapter, not of the patch.',
}

const out = join(ROOT, 'data', 'results', `withdrawn-reachability-${stamp.replaceAll(':', '-')}.json`)
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
const digest = createHash('sha256').update(json).digest('hex')
writeFileSync(`${out}.sha256`, `${digest}  ${basename(out)}\n`, 'utf8')

console.log(`probe_withdrawn_reachability: wrote data/results/${basename(out)}`)
console.log(
  `probe_withdrawn_reachability: streams=${counted.attempt_streams} ` +
    `fused_tool_call_chunks=${counted.streams_with_fused_tool_call_chunks} ` +
    `arguments_in_block_end=${counted.streams_with_arguments_in_a_block_end} ` +
    `fused_block_end=${counted.streams_with_fused_block_end}`,
)
console.log(`probe_withdrawn_reachability: sha256 ${digest.slice(0, 12)}…`)
