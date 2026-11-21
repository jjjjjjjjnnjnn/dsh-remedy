#!/usr/bin/env node
/**
 * R85 / external lead #13983: reproduce the reported fused-argument SHAPE on
 * this machine with the shipped engine. The bytes below are the two complete
 * JSON objects quoted in the public report, redacted (paths and URLs replaced)
 * so no foreign session text leaves this repo unchanged.
 *
 *   node scripts/record_external_fusion.mjs --stamp <ISO>
 *
 * This is a shape reproduction, not a claim that the reporter's gateway was
 * driven from here. The gateway failure, its rates and its suggested upstream
 * fixes stay in the lead register as external facts.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { repairToolCallArguments, splitTopLevelJsonObjects } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_external_fusion: --stamp must be ISO-8601\n')
  process.exit(2)
}

const source = {
  url: 'https://github.com/deepseek-ai/deepseek-harness/discussions/13983',
  reported: '2026-11-21',
  host: '0.2.2-rc.5 (macOS 26.3 arm64, openai-completions, deepseek-v4.1-flash, reasoningEffort max)',
  shape: 'two parallel bash calls streamed with the same tool_call index; adapter concatenated their argument texts',
}

// The public report's "Received arguments:" block, with the local path and
// URL replaced. Both halves are unmodified JSON objects otherwise.
const first = { command: 'ls -la <home>/platformio/', description: 'Inspect platformio home state' }
const second = { command: 'curl -s --max-time 25 <url>', description: 'Find LittleFS partition subtype lookup' }
const fused = `${JSON.stringify(first)}${JSON.stringify(second)}`

const problems = []
let whole
try { whole = JSON.parse(fused) } catch { whole = null }
if (whole !== null) problems.push('the fused text unexpectedly parsed as one object')

const split = splitTopLevelJsonObjects(fused)
if (!split.ok) problems.push(`splitter refused the reported shape: ${split.code ?? ''}`)
if (split.ok && split.slices.length !== 2) problems.push(`splitter found ${split.slices.length} slices, expected 2`)

const result = repairToolCallArguments({ id: 'call_00_reported', name: 'bash', arguments: fused }, {})
if (result.status !== 'repaired') problems.push(`engine returned ${result.status}, expected repaired`)
if (result.calls.length !== 2) problems.push(`engine emitted ${result.calls.length} calls, expected 2`)
const parsed = []
for (const call of result.calls) {
  try { parsed.push(JSON.parse(call.arguments)) } catch { problems.push(`fragment ${call.id} does not parse`) }
}
if (parsed.length === 2) {
  if (JSON.stringify(parsed[0]) !== JSON.stringify(first)) problems.push('first fragment changed')
  if (JSON.stringify(parsed[1]) !== JSON.stringify(second)) problems.push('second fragment changed')
}
const ids = new Set(result.calls.map((call) => call.id))
if (ids.size !== result.calls.length) problems.push('synthesized ids collided')

if (problems.length > 0) {
  process.stderr.write(`record_external_fusion: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_external_fusion.mjs',
  generated_at: stamp,
  claim: 'the public report\'s fused-argument shape is repaired by the shipped engine into two calls whose arguments each parse',
  source,
  measured: {
    fused_length: fused.length,
    split_slices: split.slices.length,
    whole_text_parses: whole !== null,
    status: result.status,
    calls: result.calls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
    fragments_parse: true,
    ids_unique: true,
  },
  not_proven: [
    'the reporter\'s gateway was not driven from this machine; the collapse rates and session counts are external, quoted in the lead register',
    'paths and URLs in the quoted arguments were redacted before being written here',
    'this reproduces the shape the adapter hands to the seam, not the upstream index-collision bug inside pi-ai',
  ],
}
const artifact = `${JSON.stringify(payload, null, 2)}\n`
const out = `data/results/live-external-fusion-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_external_fusion: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
