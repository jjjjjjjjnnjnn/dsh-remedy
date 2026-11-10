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
  // The synthesized call opens its own block: a bare `block-end` for an index the
  // consumer never saw start is not a well-formed block sequence (BS-11).
  assert.deepEqual(types, [
    'block-start',
    'tool-call-delta',
    'tool-call-delta',
    'usage',
    'block-end',
    'block-start',
    'block-end',
    'finish',
  ])

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
    refused: 0,
    withdrawn: 0,
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
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  const blocks = output.filter((chunk) => chunk.type === 'block-end')
  assert.equal(blocks.length, 2)
  assert.equal(monitor.counters().repaired, 1)
  assert.equal(monitor.counters().unrepaired, 0)
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
  // BS-12 semantics (P-0003), not a relaxed assertion: `fused` + `unrepaired`
  // now belongs to the *proven* candidate, and `refused` to the *refused* one.
  // The two counts name two different candidates, so this is 1 + 1, not 2 of one.
  // Before P-0003 every rejection bumped `fused` and `unrepaired`, which read
  // 1/1 here but was numerically the same accident for a single refusal.
  assert.deepEqual(monitor.counters(), {
    streams: 1,
    fused: 1,
    repaired: 0,
    unrepaired: 1,
    truncated: 0,
    errors: 0,
    refused: 1,
    withdrawn: 0,
  })
  const abandoned = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'abandoned-rescue')
  assert.ok(abandoned !== undefined, 'the proven-but-abandoned split must be recorded with its own code')
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

// --- P-0002 negative controls -------------------------------------------------

test('a repaired finish keeps the adapter replayState', async () => {
  const replayState = { chain: ['step-1'], cursor: 4 }
  const chunks: unknown[] = [
    ...errorFinishStream(fixture.arguments).slice(0, 3),
    {
      type: 'finish',
      replayState,
      reason: {
        kind: 'error',
        failure: {
          code: 'MALFORMED_RESPONSE',
          message: `Tool call "${fixture.tool}": Unexpected non-whitespace character after JSON\n\nReceived arguments:\n${fixture.arguments}`,
        },
      },
    },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  const finish = output.at(-1)
  assert.equal(finish?.type, 'finish')
  if (finish?.type !== 'finish') return
  assert.deepEqual(finish.reason, { kind: 'stop' })
  assert.deepEqual(finish.replayState, replayState)
})

test('a tool name that changes mid-stream aborts the rescue', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_mix', name: 'ops_bash', argumentsDelta: '{"command":"ls"}' },
    { type: 'tool-call-delta', index: 0, id: 'call_mix', name: 'read_page', argumentsDelta: '{"path":"a.ts"}' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'fusion' } } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().repaired, 0)
  // BS-12 semantics (P-0003): a name conflict is a refusal, not a proven fusion,
  // so it moves `refused` and no longer `fused`/`unrepaired`.
  assert.equal(monitor.counters().fused, 0)
  assert.equal(monitor.counters().unrepaired, 0)
  assert.equal(monitor.counters().refused, 1)
  const rejected = monitor.events().find((event) => event.kind === 'rejected')
  if (rejected?.kind === 'rejected') assert.equal(rejected.code, 'name-changed')
})

test('a failure message without a tool name is never synthesized as unknown', async () => {
  const chunks: unknown[] = [
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          code: 'MALFORMED_RESPONSE',
          message: 'received arguments but the tool was never named\n\nReceived arguments:\n{"a":1}{"b":2}',
        },
      },
    },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().fused, 0)
})

test('a non-string argumentsDelta is never concatenated as undefined', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_undef', name: 'ops_bash', argumentsDelta: '{"a":1}' },
    { type: 'tool-call-delta', index: 0, id: 'call_undef', name: 'ops_bash', argumentsDelta: undefined },
    { type: 'tool-call-delta', index: 0, id: 'call_undef', name: 'ops_bash', argumentsDelta: '{"b":2}' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'fusion' } } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  const blocks = output.filter((chunk) => chunk.type === 'block-end')
  assert.equal(blocks.length, 2)
  for (const block of blocks) {
    if (block.type === 'block-end' && block.block.type === 'tool-call') {
      assert.doesNotMatch(block.block.arguments, /undefined/)
    }
  }
  assert.equal(monitor.counters().errors, 1)
})

test('a later rejected block-end withdraws an earlier committed repair', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_a', name: 'edit', arguments: '{"a":1}{"b":2}' } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_b', name: 'edit', arguments: '{"path":' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  const blocks = output.filter((chunk) => chunk.type === 'block-end')
  assert.equal(blocks.length, 2, 'both originals go out, the split is withdrawn')
  assert.equal(monitor.counters().repaired, 0)
  const rolledBack = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'rolled-back')
  assert.ok(rolledBack !== undefined, 'the withdrawn repair must be recorded')
})

// --- P-0003 negative controls -------------------------------------------------

test('a plain refusal raises refused and never fused', async () => {
  // `single-broken.json` is one object that does not parse: a different defect,
  // not a fusion. Before P-0003 this bumped `fused` + `unrepaired` and the
  // verdict read `degraded` for a stream whose only defect was bad JSON (BS-12).
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_single', name: 'edit', argumentsDelta: '{"path": "a.ts", "content": "x"' },
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'MALFORMED_RESPONSE', message: 'Unexpected end of JSON input' },
      },
    },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks, 'the original failure passes through untouched')
  assert.equal(monitor.counters().fused, 0, 'a refusal is not evidence of fusion')
  assert.equal(monitor.counters().unrepaired, 0, 'a refusal was never a repairable fusion')
  assert.equal(monitor.counters().refused, 1)
  const rejected = monitor.events().find((event) => event.kind === 'rejected')
  // The splitter names the defect precisely (an unbalanced brace, not two objects):
  // whatever the code, a text that was never proven to be a fusion stays out of `fused`.
  if (rejected?.kind === 'rejected') assert.equal(rejected.code, 'not-an-object-sequence')
  assert.equal(monitor.verdict().state, 'quiet', 'the seam ran and did not see a fusion')
})

test('too-many-calls counts as a fusion we refused to take, not a failed repair', async () => {
  const eight = Array.from({ length: 9 }, (_, index) => `{"i":${index}}`).join('')
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_big', name: 'edit', arguments: eight } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const monitor = new RemedyMonitor()
  const output: StreamChunk[] = []
  for await (const chunk of repairStream(fromChunks(chunks), monitor, { maxCalls: 8 })) output.push(chunk)
  assert.deepEqual(output, chunks)
  // The splitter proved nine top-level objects: this really is a fusion, and we
  // are the ones who declined to take it, so all three counts are true at once.
  assert.equal(monitor.counters().fused, 1, 'the input really was a proven fusion shape')
  assert.equal(monitor.counters().refused, 1, 'we are the ones who declined to split it')
  assert.equal(monitor.counters().unrepaired, 1, 'the original failure went out, so it was not repaired')
  assert.equal(monitor.counters().repaired, 0)
  // `degraded` is the honest state: `repaired` would claim "defect seen and
  // repaired" for a stream that dispatched nothing, and `quiet` would claim the
  // defect was never seen. Only the vocabulary is frozen, not the truth.
  assert.equal(monitor.verdict().state, 'degraded')
  const rejected = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'too-many-calls')
  assert.ok(rejected !== undefined)
})

test('a withdrawn repair raises withdrawn and keeps unrepaired meaning one thing', async () => {
  // One proven split, then a later block that cannot be split: the whole rescue
  // is withdrawn. `fused` + `unrepaired` describe the *proven and abandoned*
  // split; `refused` describes the *refused* candidate; nothing is counted twice.
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_w1', name: 'edit', arguments: '{"a":1}{"b":2}' } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_w2', name: 'edit', arguments: '{"path":' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().repaired, 0)
  assert.equal(monitor.counters().withdrawn, 1, 'the proven split was given back')
  assert.equal(monitor.counters().refused, 1, 'the unparsable block is the refusal')
  assert.equal(monitor.counters().fused, 1, 'exactly one proof existed')
  assert.equal(monitor.counters().unrepaired, 1, 'and it never reached a dispatch')
  assert.equal(monitor.counters().truncated, 0, 'this was a rejection, not a truncation')
  assert.equal(monitor.verdict().state, 'degraded')
  assert.ok(monitor.events().find((event) => event.kind === 'rejected' && event.code === 'abandoned-rescue') !== undefined)
  assert.ok(monitor.events().find((event) => event.kind === 'rejected' && event.code === 'rolled-back') !== undefined)
})

test('a truncation withdrawal raises withdrawn and stays louder than quiet', async () => {
  // A cut stream is not a failed repair, but the counters must not say "quiet"
  // either: `quiet` promises the defect was not seen, and a truncation that
  // dropped a proven split is a different story. `fused` stays 0 (no refusal)
  // and `unrepaired` stays 0, so the verdict is `repaired`-shaped only if a
  // repair were claimed — it is not, because `repaired` is also 0.
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_t', name: 'edit', arguments: '{"a":1}{"b":2}' } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks, 'a cut stream goes out untouched')
  assert.equal(monitor.counters().truncated, 1)
  assert.equal(monitor.counters().unrepaired, 0)
  assert.equal(monitor.events().find((event) => event.kind === 'rejected'), undefined, 'a truncation is not a rejection')
})

test('maxCalls is a per-stream ceiling, not a per-block one', async () => {
  const eight = (base: number) => Array.from({ length: 8 }, (_, index) => `{"i":${base + index}}`).join('')
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_x1', name: 'edit', arguments: eight(0) } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_x2', name: 'edit', arguments: eight(8) } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const monitor = new RemedyMonitor()
  const output: StreamChunk[] = []
  for await (const chunk of repairStream(fromChunks(chunks), monitor, { maxCalls: 8 })) output.push(chunk)
  // Block 0 spends the whole budget, so block 1 is over it; all-or-nothing then
  // withdraws the first repair and both originals go out untouched.
  assert.equal(output.filter((chunk) => chunk.type === 'block-end').length, 2, 'block 1 is over the budget, so nothing is committed')
  assert.equal(monitor.counters().repaired, 0)
  assert.ok(monitor.counters().unrepaired >= 1, 'the over-budget block is recorded as unrepaired')
  const rejected = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'too-many-calls')
  assert.ok(rejected !== undefined, 'the over-budget block must be recorded with its reason')
})

test('a consumer that stops early is not reported as a quiet stream', async () => {
  const monitor = new RemedyMonitor()
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_abort', name: 'edit', argumentsDelta: '{"a":1}{"b":2}' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  for await (const chunk of repairStream(fromChunks(chunks), monitor)) {
    if (chunk.type === 'block-start') break
  }
  assert.notEqual(monitor.verdict().state, 'quiet')
  const abandoned = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'consumer-abort')
  assert.ok(abandoned !== undefined, 'an abandoned stream must be recorded')
})

test('a synthesized call opens its own block instead of a bare block-end', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_seq', name: 'edit', argumentsDelta: '{"a":1}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_seq', name: 'edit', arguments: '{"a":1}{"b":2}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const { chunks: output } = await collect(fromChunks(chunks))
  const starts = output.filter((chunk) => chunk.type === 'block-start').map((chunk) => chunk.index)
  const ends = output.filter((chunk) => chunk.type === 'block-end').map((chunk) => chunk.index)
  assert.equal(ends.length, 2)
  assert.equal(starts.length, ends.length, 'every block-end needs a matching block-start')
  for (const index of ends) {
    assert.ok(starts.includes(index), `block-end ${index} has no block-start the consumer saw`)
  }
})

test('an abandoned repair returns its call back to the stream budget', async () => {
  const eight = Array.from({ length: 8 }, (_, index) => `{"i":${index}}`).join('')
  const six = Array.from({ length: 6 }, (_, index) => `{"j":${index}}`).join('')
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_b0', name: 'edit', arguments: eight } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_b1', name: 'edit', arguments: '{"path":' } },
    { type: 'block-start', index: 2, blockType: 'tool-call' },
    { type: 'block-end', index: 2, block: { type: 'tool-call', id: 'call_b2', name: 'edit', arguments: six } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const monitor = new RemedyMonitor()
  const output: StreamChunk[] = []
  for await (const chunk of repairStream(fromChunks(chunks), monitor, { maxCalls: 8 })) output.push(chunk)
  // Block 0 spends 8, block 1 is rejected, so block 2 must still see a budget:
  // if the withdrawn calls were not returned, block 2 would be over the ceiling.
  const rejected = monitor.events().find((event) => event.kind === 'rejected' && event.code === 'not-an-object-sequence')
  assert.ok(rejected !== undefined, 'block 1 is the rejected one')
  assert.equal(monitor.counters().repaired, 0, 'the whole stream is withdrawn')
})

test('a truncated stream withdraws the repair without recording a rejection', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_cut', name: 'edit', argumentsDelta: '{"a":1}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_cut', name: 'edit', arguments: '{"a":1}{"b":2}' } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks, 'a cut stream is not repaired, so it goes out untouched')
  assert.equal(monitor.counters().truncated, 1)
  assert.equal(monitor.counters().unrepaired, 0, 'a cut stream is not a failed repair')
  const rolledBack = monitor.events().find((event) => event.kind === 'rejected')
  assert.equal(rolledBack, undefined, 'truncation must not be recorded as a rejection')
  assert.notEqual(monitor.verdict().state, 'degraded')
})

test('a passed-through provider error is counted, not reported as zero errors', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'overloaded' } } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().errors, 1, 'a failed stream must not report zero errors')
  assert.equal(monitor.counters().fused, 0, 'a non-fusion error is not a fused call')
})

test('an empty tool name is never repaired into a dispatchable call', async () => {
  const chunks: unknown[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_anon', argumentsDelta: '{"a":1}{"b":2}' },
    { type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'fusion' } } },
  ]
  const { chunks: output, monitor } = await collect(fromChunks(chunks))
  assert.deepEqual(output, chunks)
  assert.equal(monitor.counters().repaired, 0)
  const rejected = monitor.events().find((event) => event.kind === 'rejected')
  if (rejected?.kind === 'rejected') assert.equal(rejected.code, 'missing-name')
})
