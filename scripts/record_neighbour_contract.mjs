#!/usr/bin/env node
/**
 * R82 · what an OUTERMOST llm/stream listener sees after dsh-remedy.
 *
 *   node scripts/record_neighbour_contract.mjs \
 *     --control .tmp/r82-runs/control --remedy .tmp/r82-runs/remedy \
 *     --stamp <ISO>
 *
 * Four scenarios, two arms: a fixture neighbour injects a chunk shape inside
 * remedy, and a fixture observer registered with `prepend: true` records every
 * chunk the caller receives. Fail-open must be byte-identical to the no-remedy
 * control; a proven repair must emit a paired tool-call block with a traceable
 * id and arguments that parse, and no invented finish reason.
 *
 * The recorder asserts every claim before writing. A missing run, a changed
 * sequence or an unparseable fragment exits 4 instead of recording green.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_neighbour_contract: --stamp must be ISO-8601\n')
  process.exit(2)
}

const roots = { control: flag('control'), remedy: flag('remedy') }
for (const [arm, root] of Object.entries(roots)) {
  if (root === undefined || !existsSync(abs(root))) {
    process.stderr.write(`record_neighbour_contract: --${arm} must name an existing run root\n`)
    process.exit(2)
  }
}

const SCENARIOS = ['healthy', 'bare-value', 'object-arguments', 'finish-no-reason']
const IDENTICAL = ['healthy', 'object-arguments', 'finish-no-reason']
const problems = []
const rows = {}

function readRun(arm, scenario) {
  const dir = join(roots[arm], scenario)
  const resultPath = join(dir, 'result.json')
  const observerPath = join(dir, 'evidence', 'observer.jsonl')
  if (!existsSync(abs(resultPath)) || !existsSync(abs(observerPath))) {
    problems.push(`${scenario}/${arm}: missing result.json or observer.jsonl`)
    return null
  }
  const result = JSON.parse(readFileSync(abs(resultPath), 'utf8'))
  const events = readFileSync(abs(observerPath), 'utf8')
    .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  const chunks = events.filter((event) => event.event === 'chunk').map((event) => event.chunk)
  return {
    version: result.version,
    exit_code: result.exit_code,
    saw_main_stream: events.some((event) => event.event === 'stream' && Array.isArray(event.tools) && event.tools.length > 0),
    chunks,
    sequence_sha256: sha256(JSON.stringify(chunks)),
    observer_sha256: result.observer?.sha256 ?? null,
  }
}

for (const scenario of SCENARIOS) {
  const control = readRun('control', scenario)
  const remedy = readRun('remedy', scenario)
  if (control === null || remedy === null) continue
  for (const [arm, run] of Object.entries({ control, remedy })) {
    if (!run.saw_main_stream) problems.push(`${scenario}/${arm}: neighbour never saw a main-step stream`)
    if (run.chunks.length === 0) problems.push(`${scenario}/${arm}: outer observer saw no chunks`)
    if (run.chunks.some((chunk) => chunk === null)) problems.push(`${scenario}/${arm}: a null chunk reached the outer observer`)
    for (const [index, chunk] of run.chunks.entries()) {
      if (chunk.type !== 'finish') continue
      const next = run.chunks[index + 1]
      if (next !== undefined && next.type !== 'block-start') {
        problems.push(`${scenario}/${arm}: a chunk follows finish without a new block-start`)
      }
    }
  }

  const identical = JSON.stringify(control.chunks) === JSON.stringify(remedy.chunks)
  if (IDENTICAL.includes(scenario) && !identical) {
    problems.push(`${scenario}: fail-open sequence differs from the no-remedy control`)
  }

  if (scenario === 'bare-value') {
    if (identical) problems.push('bare-value: the repair left no trace at the outer observer')
    const failed = control.chunks.some((chunk) => chunk.reason?.code === 'MALFORMED_RESPONSE')
    if (!failed) problems.push('bare-value: control did not see the adapter failure')
    if (control.chunks.some((chunk) => chunk.block?.type === 'tool-call')) {
      problems.push('bare-value: control saw a tool-call block, so it was not an unrepairable shape')
    }
    if (control.exit_code !== 1) problems.push(`bare-value: control exited ${control.exit_code}, expected 1`)
    if (remedy.exit_code !== 0) problems.push(`bare-value: remedy exited ${remedy.exit_code}, expected 0`)

    const starts = remedy.chunks.filter((chunk) => chunk.type === 'block-start' && chunk.blockType === 'tool-call')
    const ends = remedy.chunks.filter((chunk) => chunk.block?.type === 'tool-call')
    if (starts.length === 0 || ends.length === 0) problems.push('bare-value: no paired tool-call block reached the observer')
    for (const block of ends) {
      if (typeof block.block.id !== 'string' || block.block.id === '') problems.push('bare-value: synthesized block has no traceable id')
      if (typeof block.block.name !== 'string' || block.block.name === '') problems.push('bare-value: synthesized block has no name')
      if (typeof block.block.arguments !== 'string') problems.push('bare-value: synthesized arguments are not a string')
      try {
        JSON.parse(block.block.arguments)
      } catch {
        problems.push('bare-value: synthesized arguments do not parse')
      }
    }
    const startsByIndex = new Set(starts.map((chunk) => chunk.index))
    for (const block of ends) {
      if (!startsByIndex.has(block.index)) problems.push(`bare-value: block-end ${String(block.index)} has no block-start`)
    }
    if (remedy.chunks.some((chunk) => chunk.reason?.code === 'MALFORMED_RESPONSE')) {
      problems.push('bare-value: the repaired stream still carried the adapter failure')
    }
  }

  if (scenario === 'finish-no-reason') {
    const controlBad = control.chunks.filter((chunk) => chunk.type === 'finish' && chunk.reason === null)
    const remedyBad = remedy.chunks.filter((chunk) => chunk.type === 'finish' && chunk.reason === null)
    if (controlBad.length !== 1 || remedyBad.length !== 1) {
      problems.push('finish-no-reason: the malformed finish was not observed exactly once in each arm')
    }
  }

  rows[scenario] = {
    identical,
    control,
    remedy,
  }
}

if (Object.keys(rows).length !== SCENARIOS.length) problems.push('not every scenario had two readable runs')

if (problems.length > 0) {
  process.stderr.write(`record_neighbour_contract: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_neighbour_contract.mjs',
  generated_at: stamp,
  question: 'What does an outermost llm/stream listener receive after the repair layer?',
  topology: {
    order: 'dsh-remedy (load_index 16) is outermost; dsh-ops (20) is inner; observer registers with prepend:true (cordis register() unshifts)',
    source: 'data/results/seam-inventory-2026-11-19T08-05-00.000Z.json and @deepseek-ai/cordis/lib/index.js:336',
  },
  scenarios: rows,
  claim: {
    pass_through: 'healthy, object-arguments and finish-no-reason produce a chunk-identical sequence with or without remedy',
    repair: 'bare-value produces a paired tool-call block with a traceable id, a name and arguments that parse; the adapter failure is gone',
  },
  not_proven: [
    'dsh-ops is not mounted in this isolated home: a malformed finish from an inner neighbour would be read by dsh-ops before remedy sees it on the desktop profile',
    'the observer is a fixture, not a shipped third-party plugin; no claim is made about a listener that mutates chunks',
    'one host, one route, one model and four scenarios; a different adapter may emit other shapes',
  ],
}
const artifact = `${JSON.stringify(payload, null, 2)}\n`
const out = `data/results/live-neighbours-contract-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_neighbour_contract: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
