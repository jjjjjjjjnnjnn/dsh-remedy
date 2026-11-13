import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RemedyMonitor, repairStream, type RepairStreamOptions, type StreamChunk } from 'dsh-remedy'

/**
 * P-0027 — a fragment whose tool name cannot be proven is never dispatched as
 * another tool's call.
 *
 * The measured defect (BS-18, DSH 0.2.2-rc.3): a fused text that glues two calls
 * of *different* tools carries one tool name for that index, so the fragments
 * after the first inherit it. Both times it was measured, the second call was
 * dispatched as `read` with shell arguments and the tool answered
 * `Error: invalid arguments: missing required property "file_path"`.
 *
 * The seam does receive `options.tools` (24 declarations in the measured
 * request), so the name of a synthesized fragment can be checked against the
 * tool's own schema instead of assumed. When the fragment does not fit, it goes
 * out under a name the runtime rejects (`UNKNOWN_TOOL`, measured the same day),
 * which the model can see and retry — instead of a wrong tool running.
 */

const fixture = JSON.parse(
  readFileSync(new URL('../../data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json', import.meta.url), 'utf8'),
) as { tool: string; call_id: string; arguments: string }

/** One fused stream whose two objects are given explicitly. */
function fusedStream(name: string, fusedText: string): unknown[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_probe', name, argumentsDelta: fusedText },
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'MALFORMED_RESPONSE', message: `Received arguments:\n${fusedText}` },
      },
    },
  ]
}

async function collect(source: AsyncIterable<unknown>, options: RepairStreamOptions = {}) {
  const monitor = new RemedyMonitor()
  const chunks: StreamChunk[] = []
  for await (const chunk of repairStream(source, monitor, options)) chunks.push(chunk)
  return { chunks, monitor }
}

function toolBlocks(chunks: readonly StreamChunk[]) {
  return chunks
    .filter((chunk): chunk is Extract<StreamChunk, { type: 'block-end' }> => chunk.type === 'block-end')
    .map((chunk) => chunk.block)
    .filter((block): block is Extract<typeof block, { type: 'tool-call' }> => block.type === 'tool-call')
}

const READ = { name: 'read', parameters: { type: 'object', required: ['file_path'] } }
const PWSH = { name: 'pwsh', parameters: { type: 'object', required: ['command'] } }

test('a cross-tool fragment goes out under a name the runtime cannot execute', async () => {
  // The measured shape: read + shell command glued, one name on the index.
  const { chunks } = await collect(
    (async function* () {
      yield* fusedStream('read', '{"file_path":"a.txt"}{"command":"Get-ChildItem"}')
    })(),
    { tools: [READ, PWSH] },
  )
  const blocks = toolBlocks(chunks)
  assert.equal(blocks.length, 2, 'both fragments are emitted')
  assert.equal(blocks[0]?.name, 'read', 'the stream named this one, so it keeps it')
  assert.equal(
    blocks[1]?.name,
    'remedy_unattributed',
    'a fragment that does not fit the named tool must not be dispatched as that tool',
  )
  assert.equal(JSON.parse(blocks[1]!.arguments).command, 'Get-ChildItem')
})

test('a same-tool fusion keeps the name on every fragment', async () => {
  const { chunks } = await collect(
    (async function* () {
      yield* fusedStream('read', '{"file_path":"a.txt"}{"file_path":"b.txt"}')
    })(),
    { tools: [READ, PWSH] },
  )
  const blocks = toolBlocks(chunks)
  assert.equal(blocks.length, 2)
  assert.deepEqual(
    blocks.map((block) => block.name),
    ['read', 'read'],
    'both fragments satisfy the declared schema, so the name is proven for both',
  )
})

test('without tool schemas the plugin keeps the old behaviour and says so', async () => {
  // No `tools` on the request (a CLI repair, a hand-built call): nothing can be
  // proven, and inventing a refusal would break the same-tool majority.
  const { chunks } = await collect(
    (async function* () {
      yield* fusedStream('read', '{"file_path":"a.txt"}{"command":"Get-ChildItem"}')
    })(),
  )
  const blocks = toolBlocks(chunks)
  assert.deepEqual(blocks.map((block) => block.name), ['read', 'read'])
})

test('a schema without required fields proves nothing, so the name is kept', async () => {
  const { chunks } = await collect(
    (async function* () {
      yield* fusedStream('read', '{"file_path":"a.txt"}{"command":"Get-ChildItem"}')
    })(),
    { tools: [{ name: 'read', parameters: { type: 'object' } }] },
  )
  const blocks = toolBlocks(chunks)
  assert.deepEqual(blocks.map((block) => block.name), ['read', 'read'])
})

test('the repaired event records that a fragment was unattributed', async () => {
  const { monitor } = await collect(
    (async function* () {
      yield* fusedStream('read', '{"file_path":"a.txt"}{"command":"Get-ChildItem"}')
    })(),
    { tools: [READ, PWSH] },
  )
  const repaired = monitor.events().filter((event) => event.kind === 'repaired')
  assert.equal(repaired.length, 1)
  const event = repaired[0]
  assert.equal(event?.kind, 'repaired')
  if (event?.kind !== 'repaired') return
  assert.equal(event.fragments, 2)
  assert.equal(
    event.unattributed,
    1,
    'the journal must say one fragment went out under the fallback name, not leave it to be noticed',
  )
})

test('the measured fixture still repairs into two calls', async () => {
  // Regression guard: the fixture is a real same-tool fusion and its two blocks
  // both satisfy a required-field schema, so this patch must not touch it.
  const tools = [{ name: fixture.tool, parameters: { type: 'object', required: ['command'] } }]
  const { chunks } = await collect(
    (async function* () {
      yield {
        type: 'block-start',
        index: 0,
        blockType: 'tool-call',
      }
      yield { type: 'tool-call-delta', index: 0, id: fixture.call_id, name: fixture.tool, argumentsDelta: fixture.arguments }
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            code: 'MALFORMED_RESPONSE',
            message: `Received arguments:\n${fixture.arguments}`,
          },
        },
      }
    })(),
    { tools },
  )
  assert.equal(toolBlocks(chunks).length, 2)
})
