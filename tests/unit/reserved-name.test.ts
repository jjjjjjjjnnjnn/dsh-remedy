import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RemedyMonitor, repairStream } from 'dsh-remedy'
import type { RepairStreamOptions, StreamChunk, ToolDeclaration } from 'dsh-remedy/repair-stream'

/**
 * P-0054: `remedy_unattributed` is a name this plugin sends calls to when it
 * cannot prove a tool name. A profile may already declare a tool with that name,
 * and then the fallback would dispatch the model's arguments into the user's
 * own tool. The rule: if `options.tools` owns the name, no rescue uses it — the
 * provider's original failure goes back instead, and a call with no name keeps
 * its original (undispatchable) bytes rather than borrowing the taken name.
 */

async function* fromChunks(chunks: readonly unknown[]): AsyncGenerator<unknown> {
  for (const chunk of chunks) yield chunk
}

async function collect(
  chunks: readonly unknown[],
  options: RepairStreamOptions = {},
): Promise<{ out: StreamChunk[]; thrown: unknown; counters: ReturnType<RemedyMonitor['counters']>; monitor: RemedyMonitor }> {
  const monitor = new RemedyMonitor()
  const out: StreamChunk[] = []
  let thrown: unknown = null
  try {
    for await (const chunk of repairStream(fromChunks(chunks), monitor, options)) out.push(chunk)
  } catch (error) {
    thrown = error
  }
  return { out, thrown, counters: monitor.counters(), monitor }
}

const TOOL_WRITE: ToolDeclaration = {
  name: 'write',
  parameters: { required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } },
}
const TOOL_FALLBACK: ToolDeclaration = { name: 'remedy_unattributed', parameters: { required: [], properties: {} } }

/** Two calls of `write`; the second has no `content`, so its name is not provable. */
const FUSED_FOREIGN = '{"path":"a.ts","content":"one"}{"path":"b.ts"}'
/** Two complete `write` calls, so the fallback name is not needed at all. */
const FUSED_FIT = '{"path":"a.ts","content":"one"}{"path":"b.ts","content":"two"}'

function fusedStream(args: string): unknown[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'c1', name: 'write', argumentsDelta: args },
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'MALFORMED_RESPONSE', message: `x\n\nReceived arguments:\n${args}` },
      },
    },
  ]
}

function dispatchedNames(out: readonly StreamChunk[]): string[] {
  return out
    .filter((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
    .map((chunk) => (chunk.type === 'block-end' && chunk.block.type === 'tool-call' ? chunk.block.name : ''))
}

test('a profile that owns the fallback name makes a fusion rescue abandon instead of dispatching into it', async () => {
  const { out, thrown, counters } = await collect(fusedStream(FUSED_FOREIGN), { tools: [TOOL_WRITE, TOOL_FALLBACK] })
  assert.equal(thrown, null)
  assert.equal(counters.repaired, 0)
  assert.equal(counters.fused, 0)
  assert.equal(counters.errors, 1)
  assert.deepEqual(dispatchedNames(out), [])
  const finish = out.at(-1)
  assert.ok(finish !== undefined && finish.type === 'finish' && finish.reason.kind === 'error', 'the provider failure is passed back')
})

test('even a rescue that would not need the fallback name is abandoned while the name is owned', async () => {
  const { out, counters } = await collect(fusedStream(FUSED_FIT), { tools: [TOOL_WRITE, TOOL_FALLBACK] })
  assert.equal(counters.repaired, 0)
  assert.equal(counters.errors, 1)
  assert.deepEqual(dispatchedNames(out), [])
})

test('a block-end with no tool name keeps its original bytes when the fallback name is owned', async () => {
  const blockEnd = { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c1', name: '', arguments: '{}' } }
  const { out, thrown, counters } = await collect(
    [{ type: 'block-start', index: 0, blockType: 'tool-call' }, blockEnd, { type: 'finish', reason: { kind: 'stop' } }],
    { tools: [TOOL_WRITE, TOOL_FALLBACK] },
  )
  assert.equal(thrown, null)
  assert.deepEqual(out[1], blockEnd)
  assert.equal(counters.refused, 1)
  assert.equal(counters.repaired, 0)
  // The original (undispatchable) name goes out; the borrowed name never does.
  assert.deepEqual(dispatchedNames(out), [''])
})

test('a block-end with no tool name still goes out under the refusal name when nobody owns it (control)', async () => {
  const blockEnd = { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c1', name: '', arguments: '{}' } }
  const { out, counters } = await collect(
    [{ type: 'block-start', index: 0, blockType: 'tool-call' }, blockEnd, { type: 'finish', reason: { kind: 'stop' } }],
    { tools: [TOOL_WRITE] },
  )
  assert.deepEqual(dispatchedNames(out), ['remedy_unattributed'])
  assert.equal(counters.refused, 1)
})

test('without the owned name the foreign fragment still uses it (control)', async () => {
  const { out, counters } = await collect(fusedStream(FUSED_FOREIGN), { tools: [TOOL_WRITE] })
  assert.equal(counters.repaired, 1)
  assert.deepEqual(dispatchedNames(out), ['write', 'remedy_unattributed'])
  const finish = out.at(-1)
  assert.ok(finish !== undefined && finish.type === 'finish' && finish.reason.kind === 'stop')
})

test('without any declarations the rescue keeps the stream name and never invents the fallback (control)', async () => {
  const { out, counters } = await collect(fusedStream(FUSED_FOREIGN))
  assert.equal(counters.repaired, 1)
  assert.deepEqual(dispatchedNames(out), ['write', 'write'])
})
