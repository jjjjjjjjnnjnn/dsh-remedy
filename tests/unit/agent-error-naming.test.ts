import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRemedy } from 'dsh-remedy'

/**
 * P-0045: the seam a preparation-time refusal actually reaches.
 *
 * Measured on 0.2.2-rc.3 (`data/results/live-request-error-*.json`): an
 * `agent/request-error` listener is never called for a refusal thrown while the
 * call is prepared — the journal wrote `diagnoses:0` — and `agent/error` is
 * dispatched once for the same `(turn, step)` with the host's own code. P-0013
 * had been mounted only on the first seam, so the class it exists to name was
 * silent.
 *
 * These rules are the negative control: the old build fails them (see the
 * recorded probe), and a duplicate name across both seams is refused.
 */

type Listener = (payload: unknown, next?: () => unknown) => unknown

interface Mounted {
  readonly requestError: Listener | undefined
  readonly agentError: Listener | undefined
  readonly monitor: ReturnType<typeof createRemedy>['monitor']
}

function mount(config: Record<string, unknown> = {}): Mounted {
  const { plugin, monitor } = createRemedy()
  let requestError: Listener | undefined
  let agentError: Listener | undefined
  const ctx = {
    on: (event: string, callback: Listener) => {
      if (event === 'agent/request-error') requestError = callback
      if (event === 'agent/error') agentError = callback
      return () => {}
    },
  }
  plugin.apply(ctx as never, { log: false, ...config })
  return { requestError, agentError, monitor }
}

const errorPayload = (code: string, turn = 1, step = 1) => ({
  turn,
  step,
  error: { name: 'LlmError', message: `${code} from the host`, code },
})

const failurePayload = (code: string, turn = 1, step = 1) => ({
  turn,
  step,
  failure: { code, message: `${code} from the host` },
})

test('a preparation-time refusal is named by the agent/error seam', () => {
  // The measured shape: the refusal never reaches agent/request-error, so the
  // only seam that can say anything is the loop's own `throwError` event.
  const { agentError, monitor } = mount()
  assert.equal(typeof agentError, 'function', 'agent/error must be registered; otherwise P-0013 stays silent')
  agentError?.(errorPayload('UNSUPPORTED_REASONING_EFFORT'))
  const counters = monitor.counters()
  assert.equal(counters.diagnoses, 1, 'one named refusal, not a dead turn with no explanation')
  const events = monitor.events().filter((event) => event.kind === 'diagnosis')
  assert.equal(events.length, 1)
  assert.equal((events[0] as { code: string }).code, 'UNSUPPORTED_REASONING_EFFORT')
})

test('the same failure seen by both seams is named exactly once', () => {
  // A stream that fails after it started dispatches agent/request-error, and the
  // rethrow emits agent/error for the same (turn, step, code). Two journal lines
  // for one failure is the noise P-0013 exists to remove.
  const { requestError, agentError, monitor } = mount()
  assert.ok(requestError !== undefined && agentError !== undefined)
  requestError?.(failurePayload('UNSUPPORTED_REASONING_EFFORT'), () => undefined)
  agentError?.(errorPayload('UNSUPPORTED_REASONING_EFFORT'))
  assert.equal(monitor.counters().diagnoses, 1, 'the shared key set must absorb the second sighting')
})

test('agent/error names only the diagnosed classes, and never a signal', () => {
  const { agentError, monitor } = mount()
  assert.ok(agentError !== undefined)
  for (const code of ['SERVER', 'TRANSPORT', 'TIMEOUT', 'IMAGE_OFFLOAD_REQUIRED', 'MALFORMED_RESPONSE', 'UNKNOWN', '']) {
    agentError?.(errorPayload(code))
  }
  agentError?.({ turn: 1, step: 1 })
  assert.equal(monitor.counters().diagnoses, 0)
})

test('agent/error has no decision: it names and returns nothing', () => {
  // It is an emit, not a waterfall. A listener that tried to answer would be
  // inventing a contract the host does not have; the return value is ignored.
  const { agentError } = mount({ retryOnMalformed: 1 })
  assert.ok(agentError !== undefined)
  const returned = agentError?.(errorPayload('UNSUPPORTED_REASONING_EFFORT'))
  assert.equal(returned, undefined, 'naming is the whole contribution of this seam')
  assert.equal(typeof agentError?.(errorPayload('MALFORMED_RESPONSE')), 'undefined', 'it must not retry from an emit')
})

test('the shared name set stays bounded across a long-lived process', async () => {
  // The memory is what must be bounded. Exported so a test can measure the set
  // instead of inferring it from the number of lines a journal happened to get.
  const { makeNamer } = await import('dsh-remedy')
  const namer = makeNamer(() => {})
  for (let step = 1; step <= 5000; step += 1) namer.name('UNSUPPORTED_REASONING_EFFORT', `1:${step}`, undefined)
  assert.ok(namer.size() > 0, 'the set is in use')
  assert.ok(namer.size() <= 256, `the shared name set holds ${namer.size()} entries; it must stay bounded`)
})
