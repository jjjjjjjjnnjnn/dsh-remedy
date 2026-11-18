import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RemedyMonitor, repairStream, type RepairStreamOptions, type StreamChunk } from 'dsh-remedy'

/**
 * P-0053: when a neighbouring plugin hands the llm/stream wrapper a chunk it
 * cannot read, remedy must not raise an error of its own. It may only pass the
 * chunk through (after flushing the tail it already holds), repair a proven
 * fusion, or rethrow the failure the provider raised.
 *
 * The three red cases below are the shapes the probe measured on the R68 tree
 * (`data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json`): a null
 * chunk, a `block-end` whose `arguments` is not a string, and a `block-end` with
 * no `block`. The fourth (a `finish` with no `reason`) is the same defect on the
 * one field the wrapper reads before any repair decision.
 */

async function* fromChunks(chunks: readonly unknown[]): AsyncGenerator<unknown> {
  for (const chunk of chunks) yield chunk
}

async function collect(chunks: readonly unknown[], options: RepairStreamOptions = {}) {
  const monitor = new RemedyMonitor()
  const out: StreamChunk[] = []
  let thrown: unknown = null
  try {
    for await (const chunk of repairStream(fromChunks(chunks), monitor, options)) out.push(chunk)
  } catch (error) {
    thrown = error
  }
  return { out, thrown, counters: monitor.counters() }
}

const FUSED = '{"path":"a.ts","content":"one"}{"path":"b.ts","content":"two"}'

function fusedBlock(index: number, id: string): unknown {
  return { type: 'block-end', index, block: { type: 'tool-call', id, name: 'write', arguments: FUSED } }
}

const stopFinish = { type: 'finish', reason: { kind: 'stop' } }

test('a null chunk is passed through and remedy does not raise its own error', async () => {
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    null,
    stopFinish,
  ]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  assert.equal(out.length, 3)
  assert.deepEqual(out[1], null)
  assert.equal(counters.errors, 0)
  assert.equal(counters.streams, 1)
})

test('a block-end whose arguments is not a string is passed through untouched', async () => {
  const blockEnd = {
    type: 'block-end',
    index: 0,
    block: { type: 'tool-call', id: 'c1', name: 'read', arguments: { path: 'x' } },
  }
  const chunks = [{ type: 'block-start', index: 0, blockType: 'tool-call' }, blockEnd, stopFinish]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  assert.deepEqual(out[1], blockEnd)
  assert.equal(counters.errors, 0)
  assert.equal(counters.repaired, 0)
})

test('a block-end with no block is passed through untouched', async () => {
  const chunks = [{ type: 'block-end', index: 0 }, stopFinish]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  assert.deepEqual(out[0], { type: 'block-end', index: 0 })
  assert.equal(out.length, 2)
  assert.equal(counters.errors, 0)
})

test('a finish with no reason is passed through and closes the stream', async () => {
  const chunks = [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'finish' }]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  assert.deepEqual(out[1], { type: 'finish' })
  assert.equal(counters.errors, 0)
})

test('a foreign chunk flushes the held tail and closes the repair window for the rest of the stream', async () => {
  const second = fusedBlock(1, 'c2')
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    fusedBlock(0, 'c1'),
    null,
    second,
    stopFinish,
  ]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  // The proven repair that was already held is emitted before the foreign chunk.
  assert.equal(counters.repaired, 1)
  assert.equal(counters.fused, 1)
  // The second fused block arrives after the window closed: it goes out unchanged.
  const raw = out.find(
    (chunk) =>
      chunk !== null &&
      chunk.type === 'block-end' &&
      chunk.block.type === 'tool-call' &&
      chunk.index === 1 &&
      chunk.block.type === 'tool-call' &&
      chunk.block.arguments === FUSED,
  )
  assert.ok(raw, 'the second block-end is emitted with its original bytes')
  assert.equal(counters.repaired, 1, 'no repair happens after the foreign chunk')
  assert.deepEqual(out.at(-1), stopFinish)
})

test('an unknown chunk type is passed through (control)', async () => {
  const chunks = [
    { type: 'neighbour/heartbeat', n: 1 },
    { type: 'neighbour/heartbeat', n: 2 },
    stopFinish,
  ]
  const { out, thrown, counters } = await collect(chunks)
  assert.equal(thrown, null)
  assert.equal(out.length, 3)
  assert.equal(counters.errors, 0)
})

test('a source failure is rethrown unchanged (control)', async () => {
  const failure = Object.assign(new Error('socket hang up'), { code: 'TRANSPORT' })
  async function* source(): AsyncGenerator<unknown> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    throw failure
  }
  const monitor = new RemedyMonitor()
  let thrown: unknown = null
  try {
    for await (const _chunk of repairStream(source(), monitor)) {
      // drain
    }
  } catch (error) {
    thrown = error
  }
  assert.equal(thrown, failure)
  assert.equal(monitor.counters().errors, 1)
})

test('a second finish is never reached (control)', async () => {
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'text' },
    stopFinish,
    stopFinish,
  ]
  const { out, thrown } = await collect(chunks)
  assert.equal(thrown, null)
  assert.equal(out.length, 2)
})
