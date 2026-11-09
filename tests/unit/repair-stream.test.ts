import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RemedyMonitor, repairStream, type StreamChunk } from 'dsh-remedy'

const fixture = JSON.parse(
  readFileSync(new URL('../../data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json', import.meta.url), 'utf8'),
) as { tool: string; call_id: string; arguments: string }

async function* fromChunks(chunks: readonly unknown[]): AsyncGenerator<unknown> {
  for (const chunk of chunks) yield chunk
}

async function collect(source: AsyncIterable<unknown>, monitor = new RemedyMonitor()) {
  const chunks: StreamChunk[] = []
  for await (const chunk of repairStream(source, monitor)) chunks.push(chunk)
  return { chunks, monitor }
}

function errorFinishStream(args: string): unknown[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: fixture.call_id, name: fixture.tool, argumentsDelta: args.slice(0, 40) },
    { type: 'tool-call-delta', index: 0, id: fixture.call_id, name: fixture.tool, argumentsDelta: args.slice(40) },
    { type: 'usage', usage: { inputTokens: 1 } },
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          code: 'MALFORMED_RESPONSE',
          message: `Tool call "${fixture.tool}": Unexpected non-whitespace character after JSON at position 124\n\nReceived arguments:\n${args}`,
        },
      },
    },
  ]
}

test('the measured error-finish sequence is repaired into two calls plus stop', async () => {
  const { chunks, monitor } = await collect(fromChunks(errorFinishStream(fixture.arguments)))
  const types = chunks.map((chunk) => chunk.type)
  assert.deepEqual(types, ['block-start', 'tool-call-delta', 'tool-call-delta', 'usage', 'block-end', 'block-end', 'finish'])

  const blocks = chunks.filter((chunk): chunk is Extract<StreamChunk, { type: 'block-end' }> => chunk.type === 'block-end')
  assert.equal(blocks.length, 2)
  const first = blocks[0]!.block
  const second = blocks[1]!.block
  assert.equal(first.type, 'tool-call')
  assert.equal(second.type, 'tool-call')
  if (first.type !== 'tool-call' || second.type !== 'tool-call') return
  assert.equal(first.id, fixture.call_id)
  assert.equal(second.id, `${fixture.call_id}#remedy-1`)
  assert.equal(typeof (JSON.parse(first.arguments) as { command?: string }).command, 'string')
  assert.equal(typeof (JSON.parse(second.arguments) as { path?: string }).path, 'string')

  const finish = chunks.at(-1)
  assert.equal(finish?.type, 'finish')
  if (finish?.type === 'finish') assert.deepEqual(finish.reason, { kind: 'stop' })

  assert.deepEqual(monitor.counters(), {
    streams: 1,
    fused: 1,
    repaired: 1,
    unrepaired: 0,
    truncated: 0,
    errors: 0,
  })
})

test('a valid stream passes through byte-identically', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_ok', name: 'ops_bash', argumentsDelta: '{"command":"ls"}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_ok', name: 'ops_bash', arguments: '{"command":"ls"}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().fused, 0)
})

test('a block-end that already carries fused arguments is repaired', async () => {
  const args = '{"a":1}{"b":2}'
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_be', name: 'edit', arguments: args } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  const blocks = output.filter((chunk) => chunk.type === 'block-end')
  assert.equal(blocks.length, 2)
})

test('a non-fusion error finish is passed through untouched', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'overloaded' } } },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
})

test('a thrown MALFORMED_RESPONSE is repaired', async () => {
  async function* throwing(): AsyncGenerator<unknown> {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id: 'call_throw', name: 'ops_bash', argumentsDelta: '{"a":1}{"b":2}' }
    throw Object.assign(new Error('Unexpected non-whitespace character after JSON at position 7'), {
      code: 'MALFORMED_RESPONSE',
    })
  }
  const { chunks, monitor } = await collect(throwing())
  assert.equal(chunks.filter((chunk) => chunk.type === 'block-end').length, 2)
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
  assert.equal(monitor.counters().repaired, 1)
})

test('a thrown non-fusion error is re-thrown, not converted to success', async () => {
  async function* throwing(): AsyncGenerator<unknown> {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    throw new Error('socket hang up')
  }
  await assert.rejects(
    async () => {
      for await (const _chunk of repairStream(throwing(), new RemedyMonitor())) {
        // drain
      }
    },
    /socket hang up/,
  )
})

test('max-tokens is passed through and never repaired', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_cut', name: 'ops_bash', argumentsDelta: '{"a":1}{"b":' },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().truncated, 1)
  assert.equal(monitor.counters().fused, 0)
})

test('all-or-nothing: one unrepairable call aborts the rescue', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_a', name: 'ops_bash', argumentsDelta: '{"a":1}{"b":2}' },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id: 'call_b', name: 'edit', argumentsDelta: '{"path":' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'fusion' } } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.deepEqual(monitor.counters(), {
    streams: 1,
    fused: 1,
    repaired: 0,
    unrepaired: 1,
    truncated: 0,
    errors: 0,
  })
})

test('the failure message is a fallback when no delta buffer exists', async () => {
  const args = '{"a":1}{"b":2}'
  const chunks: unknown[] = [
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          code: 'MALFORMED_RESPONSE',
          message: `Tool call "ops_bash": Unexpected non-whitespace character after JSON\n\nReceived arguments:\n${args}`,
        },
      },
    },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  const blocks = output.filter((chunk) => chunk.type === 'block-end')
  assert.equal(blocks.length, 2)
  const first = blocks[0]
  if (first?.type === 'block-end' && first.block.type === 'tool-call') {
    assert.equal(first.block.id, 'call_remedy_1')
  }
})

test('a no-argument tool call is normalized to {} instead of an empty string', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_empty', name: 'list_agents', arguments: '' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  const block = output.find((chunk) => chunk.type === 'block-end')
  assert.equal(block?.type, 'block-end')
  if (block?.type === 'block-end' && block.block.type === 'tool-call') {
    assert.equal(block.block.arguments, '{}')
  }
})

test('a quiet stream still records one stream event with counters', async () => {
  const monitor = new RemedyMonitor()
  for await (const _chunk of repairStream(fromChunks([{ type: 'finish', reason: { kind: 'stop' } }]), monitor)) {
    // drain
  }
  const streamEvents = monitor.events().filter((event) => event.kind === 'stream')
  assert.equal(streamEvents.length, 1)
  const event = streamEvents[0]
  if (event?.kind === 'stream') {
    assert.equal(event.counters.streams, 1)
    assert.equal(event.counters.fused, 0)
  }
})
