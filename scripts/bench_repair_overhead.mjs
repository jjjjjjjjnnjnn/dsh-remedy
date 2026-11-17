#!/usr/bin/env node
/**
 * How much does the `llm/stream` wrapper cost?
 *
 *   node scripts/bench_repair_overhead.mjs --stamp 2026-11-18T08:20:00.000Z
 *
 * The control iterates the same generator without the listener; the wrapped run
 * goes through the plugin's real `llm/stream` listener (mounted on a minimal
 * context, the same way the loader does it). Median of N runs, three shapes:
 * text-only, tool-heavy, and one fused call that really is repaired.
 *
 * This is a single-machine micro-benchmark, not a load test: it answers "is the
 * wrapper a per-chunk tax a person would feel", and it records the numbers so
 * the answer can be re-measured rather than asserted.
 */

import { performance } from 'node:perf_hooks'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('bench_repair_overhead: --stamp must be ISO-8601\n')
  process.exit(2)
}

const { createRemedy } = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)
const { plugin, monitor } = createRemedy()

const listeners = new Map()
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
const wrap = listeners.get('llm/stream')
if (typeof wrap !== 'function') {
  process.stderr.write('bench_repair_overhead: the built plugin did not register an llm/stream listener\n')
  process.exit(3)
}

async function* textTurn(count) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  for (let index = 0; index < count; index += 1) {
    yield { type: 'text-delta', index: 0, text: 'lorem ipsum dolor sit amet ' }
  }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: 'x' } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

const ARGS = JSON.stringify({ path: 'src/very/long/path/name.ts', content: 'x'.repeat(2000) })
const PIECE = 20

async function* toolTurn(calls) {
  for (let call = 0; call < calls; call += 1) {
    yield { type: 'block-start', index: call, blockType: 'tool-call' }
    for (let offset = 0; offset < ARGS.length; offset += PIECE) {
      yield {
        type: 'tool-call-delta',
        index: call,
        id: `call_${call}`,
        ...(call === 0 ? { name: 'write' } : {}),
        argumentsDelta: ARGS.slice(offset, offset + PIECE),
      }
    }
    yield {
      type: 'block-end',
      index: call,
      block: { type: 'tool-call', id: `call_${call}`, name: 'write', arguments: ARGS },
    }
  }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* fusedTurn() {
  // The measured shape (session 9045e2ec, seq 524): deltas, then a terminal
  // error finish and **no block-end** for the fused call, so the call is still
  // open when the failure arrives. A block-end here would make the object look
  // closed and the wrapper would (correctly) refuse to split it.
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 0,
    id: 'call_fused',
    name: 'write',
    argumentsDelta: '{"path":"a.ts"}{"path":"b.ts"}',
  }
  yield {
    type: 'finish',
    reason: {
      kind: 'error',
      failure: {
        code: 'MALFORMED_RESPONSE',
        message:
          'Tool call "write": Unexpected non-whitespace character after JSON at position 14\n\nReceived arguments:\n{"path":"a.ts"}{"path":"b.ts"}',
      },
    },
  }
}

const tools = [{ name: 'write', parameters: { required: ['path'], properties: { path: { type: 'string' } } } }]

async function consume(iterable) {
  let chunks = 0
  for await (const _ of iterable) chunks += 1
  return chunks
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

const scenarios = []
const failures = []

async function bench(name, makeSource, runs) {
  const control = []
  const wrapped = []
  let chunks = 0
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now()
    chunks = await consume(makeSource())
    control.push(performance.now() - start)

    const startWrapped = performance.now()
    chunks = await consume(wrap({ tools }, () => makeSource()))
    wrapped.push(performance.now() - startWrapped)
  }
  const base = median(control)
  const withPlugin = median(wrapped)
  const delta = withPlugin - base
  const nsPerChunk = (delta * 1e6) / chunks

  if (chunks === 0) failures.push(`${name}: consumed no chunks`)
  if (nsPerChunk < 0) failures.push(`${name}: the wrapped run was faster than the control (${nsPerChunk.toFixed(0)} ns/chunk)`)
  if (nsPerChunk > 100_000) failures.push(`${name}: ${nsPerChunk.toFixed(0)} ns/chunk is above the 100 µs sanity ceiling`)

  scenarios.push({
    name,
    chunks,
    runs,
    control_ms_median: Number(base.toFixed(2)),
    wrapped_ms_median: Number(withPlugin.toFixed(2)),
    delta_ms: Number(delta.toFixed(2)),
    ns_per_chunk: Number(nsPerChunk.toFixed(0)),
  })
}

await bench('text: 4000 deltas', () => textTurn(4000), 7)
await bench('tools: 50 calls, 4 KB arguments each', () => toolTurn(50), 3)
await bench('fusion: one proven repair', () => fusedTurn(), 9)

const counters = monitor.counters()
if (counters.repaired < 1) failures.push(`the fusion scenario repaired ${counters.repaired} call(s), not at least one`)

if (failures.length > 0) {
  process.stderr.write(`bench_repair_overhead: the run is not what this record claims:\n  ${failures.join('\n  ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/bench_repair_overhead.mjs',
  generated_at: stamp,
  question: 'What does the llm/stream repair wrapper cost per chunk, against iterating the same stream without it?',
  host: { node: process.version, platform: process.platform, arch: process.arch },
  method:
    'createRemedy() from the built plugin, mounted on a minimal context; the control consumes the same async generator without the listener; median of the runs listed per scenario',
  scenarios,
  repair: { repaired: counters.repaired, reason: 'the third scenario is a proven fusion, so a wrapper that never ran would show zero here' },
  limits: [
    'one machine and one node build; absolute milliseconds move with the host, the ratio is the claim',
    'synthetic chunks: real turns spend most of their time waiting on the provider, so this measures the tax, not the turn',
    'the wrapper is synchronous by contract; a thenable stream re-enters through .then and is not exercised here',
  ],
}

const text = `${JSON.stringify(payload, null, 2)}\n`
const out = flag('out', `data/results/bench-repair-${stamp.replaceAll(':', '-')}.json`)
if (existsSync(abs(out))) {
  process.stderr.write(`bench_repair_overhead: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), text, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(text)}\n`, 'utf8')
for (const scenario of scenarios) {
  process.stdout.write(`${scenario.name}: +${scenario.delta_ms} ms over ${scenario.chunks} chunks (${scenario.ns_per_chunk} ns/chunk)\n`)
}
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(text)}\n`)
