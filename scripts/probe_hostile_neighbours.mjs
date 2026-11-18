#!/usr/bin/env node
/**
 * What does the `llm/stream` wrapper do when a neighbouring plugin hands it a
 * chunk it did not expect?
 *
 *   node scripts/probe_hostile_neighbours.mjs --stamp 2026-11-18T10:00:00.000Z
 *
 * This is a probe, not a gate: it reports the measured behaviour and exits 0.
 * R69 turned the red rows into red tests and changed the wrapper so that it can
 * only pass through, repair a proven fusion, or rethrow the original failure —
 * never raise an error of its own.
 *
 * The before run is `hostile-neighbours-2026-11-18T10-00-00.000Z` (R68 tree):
 * a `null` chunk, a `block-end` whose `arguments` is not a string, and a
 * `block-end` with no `block` each ended the turn with a `TypeError` raised by
 * remedy, and a profile that owns `remedy_unattributed` received the repaired
 * fragment under that name. The after run is the same probe on the R69 tree;
 * every row should read as passed through or abandoned.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('probe_hostile_neighbours: --stamp must be ISO-8601\n')
  process.exit(2)
}

const { createRemedy } = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)

function mount() {
  const listeners = new Map()
  const { plugin, monitor } = createRemedy()
  plugin.apply(
    {
      on(event, listener) {
        listeners.set(event, listener)
        return () => {}
      },
      logger: { info() {}, warn() {} },
    },
    { log: false },
  )
  return { wrap: listeners.get('llm/stream'), monitor }
}

async function collect(iterable) {
  const chunks = []
  let thrown = null
  try {
    for await (const chunk of iterable) chunks.push(chunk)
  } catch (error) {
    thrown = error
  }
  return { chunks, thrown }
}

async function run(name, source, options = {}) {
  const { wrap, monitor } = mount()
  const before = monitor.counters()
  const result = await collect(wrap({ tools: options.tools ?? [] }, () => source()))
  const after = monitor.counters()
  return {
    name,
    thrown: result.thrown === null ? null : `${result.thrown.name}: ${result.thrown.message}`.slice(0, 160),
    chunks_out: result.chunks.length,
    repaired: after.repaired - before.repaired,
    errors: after.errors - before.errors,
    refused: after.refused - before.refused,
    ...(options.extra === undefined ? {} : { detail: options.extra(result) }),
  }
}

const scenarios = []

scenarios.push(
  await run('a neighbour yields null', async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield null
    yield { type: 'finish', reason: { kind: 'stop' } }
  }),
)

scenarios.push(
  await run('arguments is not a string', async function* () {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c1', name: 'read', arguments: { path: 'x' } } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }),
)

scenarios.push(
  await run('block-end without block', async function* () {
    yield { type: 'block-end', index: 0 }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }),
)

scenarios.push(
  await run('finish without a reason', async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'finish' }
  }),
)

scenarios.push(
  await run('unknown chunk types', async function* () {
    yield { type: 'neighbour/heartbeat', n: 1 }
    yield { type: 'neighbour/heartbeat', n: 2 }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }),
)

scenarios.push(
  await run('the source throws', async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    throw Object.assign(new Error('socket hang up'), { code: 'TRANSPORT' })
  }),
)

scenarios.push(
  await run('finish appears twice', async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'finish', reason: { kind: 'stop' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }),
)

// A profile where a neighbour already registered the fallback name.
{
  const fused = '{"path":"a.ts"}{"path":"b.ts"}'
  const tools = [
    { name: 'write', parameters: { required: ['path', 'content'], properties: { path: { type: 'string' } } } },
    { name: 'remedy_unattributed', parameters: { required: [], properties: {} } },
  ]
  scenarios.push(
    await run(
      'a neighbour owns remedy_unattributed',
      async function* () {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: 'c1', name: 'write', argumentsDelta: fused }
        yield {
          type: 'finish',
          reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: `x\n\nReceived arguments:\n${fused}` } },
        }
      },
      {
        tools,
        extra: (result) =>
          result.chunks
            .filter((chunk) => chunk?.type === 'block-end' && chunk.block?.type === 'tool-call')
            .map((chunk) => chunk.block.name),
      },
    ),
  )

  scenarios.push(
    await run(
      'a nameless block-end while the fallback name is owned',
      async function* () {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c1', name: '', arguments: '{}' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
      {
        tools,
        extra: (result) =>
          result.chunks
            .filter((chunk) => chunk?.type === 'block-end' && chunk.block?.type === 'tool-call')
            .map((chunk) => chunk.block.name),
      },
    ),
  )
}

/** The sentence a reader acts on, derived from the measurement rather than written by hand. */
function judgement(scenario) {
  if (scenario.thrown !== null && /^TypeError/.test(scenario.thrown)) return 'remedy raised its own error'
  if (scenario.thrown !== null) return 'the source error was passed through'
  if (scenario.detail !== undefined) {
    if (scenario.detail.includes('remedy_unattributed')) return 'a neighbour-owned fallback name was dispatched'
    if (scenario.errors > 0) return 'the rescue was abandoned, so the borrowed name was never dispatched'
    if (scenario.refused > 0) return 'the borrowed name was not used; the call kept its own bytes'
  }
  return 'passed through'
}

for (const scenario of scenarios) scenario.judgement = judgement(scenario)

const payload = {
  schema_version: 1,
  produced_by: 'scripts/probe_hostile_neighbours.mjs',
  generated_at: stamp,
  question:
    'When a neighbouring plugin hands the llm/stream wrapper a chunk it did not expect, does the turn survive, and can a repair dispatch under a name the profile already owns?',
  contract_after_r69:
    'remedy may only pass a chunk through, repair a proven fusion, or rethrow the original failure; it must not raise an error of its own',
  measured_on: flag('measured-on', 'the R69 tree (plugin and engine dist; the before run is the R68 tree as published in 0.4.18)'),
  scenarios,
  limits: [
    'the harness mounts the listener directly; it does not run a host turn or a provider',
    'the scenarios are the shapes a neighbour could produce, not a survey of installed plugins',
    'the reserved-name row uses a synthetic profile: whether a real profile owns that name is what scan_plugin_seams.mjs answers',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const out = flag('out', `data/results/hostile-neighbours-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(abs(out))) {
  process.stderr.write(`probe_hostile_neighbours: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), text, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(text)}\n`, 'utf8')

for (const scenario of scenarios) {
  process.stdout.write(`${scenario.name.padEnd(36)} ${scenario.judgement}\n`)
}
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(text)}\n`)
