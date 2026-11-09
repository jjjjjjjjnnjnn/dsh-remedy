import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRemedy } from 'dsh-remedy'

type Listener = (options: unknown, next: () => unknown) => unknown

function mount(): { listener: Listener; monitor: ReturnType<typeof createRemedy>['monitor'] } {
  const { plugin, monitor } = createRemedy()
  let listener: Listener | undefined
  const ctx = {
    on: (event: string, callback: Listener) => {
      if (event === 'llm/stream') listener = callback
      return () => {}
    },
  }
  plugin.apply(ctx as never, { log: false })
  assert.ok(listener !== undefined, 'llm/stream listener must be registered')
  return { listener, monitor }
}

async function* quietStream(): AsyncGenerator<unknown> {
  yield { type: 'finish', reason: { kind: 'stop' } }
}

test('the llm/stream listener is synchronous: it returns the stream, not a promise', () => {
  const { listener } = mount()
  const result = listener({}, quietStream)
  assert.equal(typeof (result as { then?: unknown }).then, 'undefined', 'a thenable here breaks the agent loop')
  assert.equal(typeof (result as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator], 'function')
})

test('the mounted wrapper still repairs and counts when drained', async () => {
  const { listener, monitor } = mount()
  const result = listener({}, quietStream) as AsyncIterable<unknown>
  for await (const _chunk of result) {
    // drain
  }
  const counters = monitor.counters()
  assert.equal(counters.streams, 1)
  assert.equal(counters.fused, 0)
})

test('a next() that is already asynchronous is preserved as a promise', async () => {
  const { listener } = mount()
  const result = listener({}, () => Promise.resolve(quietStream()))
  assert.equal(typeof (result as { then?: unknown }).then, 'function')
  const resolved = (await (result as Promise<unknown>)) as AsyncIterable<unknown>
  for await (const _chunk of resolved) {
    // drain
  }
})
