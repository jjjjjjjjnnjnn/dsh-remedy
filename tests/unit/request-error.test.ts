import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRemedy } from 'dsh-remedy'

/**
 * The second seam: `agent/request-error` (P-0011 retry, P-0013 naming).
 *
 * It shipped in 0.2.0 and had **no test at all** until this file. Four defects
 * are pinned here, each quoted against the contract the runtime publishes in its
 * own documentation:
 *
 *   1. "a handling listener returns `{ kind: 'retry' }` **without calling
 *      `next()`**, while an unhandled failure is terminal" — calling `next()`
 *      first and then overriding the answer (what 0.3.7 did) discards the
 *      default chain, and context compaction authorizes its own retry there.
 *   2. A listener that does not own the decision must return `next()`; control
 *      codes are signals (`IMAGE_OFFLOAD_REQUIRED`, `INVALID_CREDENTIAL`,
 *      `MISSING_CREDENTIAL`), never retried.
 *   3. The retry budget was a `Map` keyed by `turn:step` that was never pruned.
 *      A desktop process runs thousands of steps, so a resident plugin leaked one
 *      entry per step for the life of the app.
 *   4. Naming a failure and retrying it are two decisions on one dispatch, so
 *      they share one listener: `UNSUPPORTED_REASONING_EFFORT` (37 dead turns on
 *      this host) is named once per step and never retried.
 */

type Listener = (payload: unknown, next: () => unknown) => unknown

interface Mounted {
  readonly requestError: Listener | undefined
  readonly monitor: ReturnType<typeof createRemedy>['monitor']
}

function mount(config: Record<string, unknown> = {}): Mounted {
  const { plugin, monitor } = createRemedy()
  let requestError: Listener | undefined
  const ctx = {
    on: (event: string, callback: Listener) => {
      if (event === 'agent/request-error') requestError = callback
      return () => {}
    },
  }
  plugin.apply(ctx as never, { log: false, ...config })
  return { requestError, monitor }
}

const failure = (code: string) => ({ turn: 1, step: 1, failure: { code, message: `${code} happened` } })

/** `next()` returns `undefined` for an unhandled failure, per the upstream contract. */
const unhandled = () => Promise.resolve(undefined)

async function decide(listener: Listener, payload: unknown, next: () => unknown = unhandled): Promise<unknown> {
  return await listener(payload, next)
}

test('the seam is always registered, because naming a failure needs no budget', () => {
  // P-0013: 37 turns on this host died with UNSUPPORTED_REASONING_EFFORT and the
  // journal said nothing. A diagnosis costs one line and must not require the
  // user to switch a retry on first.
  const off = mount()
  assert.equal(typeof off.requestError, 'function', 'naming is on by default')
})

test('a handler that retries must not call next(): the default decision is not ours to discard', async () => {
  const { requestError } = mount({ retryOnMalformed: 1 })
  assert.ok(requestError !== undefined)
  let seen = 0
  const next = () => {
    seen += 1
    // A real default chain schedules its own work here (context compaction
    // authorizes a retry only after a surface replacement generation advances).
    return Promise.resolve({ kind: 'retry', authorizedBy: 'compaction' })
  }
  const decision = await decide(requestError, failure('MALFORMED_RESPONSE'), next)
  assert.deepEqual(decision, { kind: 'retry' }, 'the decision is a retry action, not a passed-through one')
  assert.equal(seen, 0, 'calling next() and then overriding it throws away the default decision')
})

test('a vetoed code falls through to next() untouched', async () => {
  const { requestError } = mount({ retryOnMalformed: 1 })
  assert.ok(requestError !== undefined)
  let seen = 0
  const next = () => {
    seen += 1
    return Promise.resolve({ kind: 'accept', by: 'someone-else' })
  }
  for (const code of ['SERVER', 'TRANSPORT', 'TIMEOUT', 'EMPTY_RESPONSE', 'NOT_A_REAL_CODE']) {
    const decision = await decide(requestError, failure(code), next)
    assert.deepEqual(decision, { kind: 'accept', by: 'someone-else' }, `${code} must not be retried by this plugin`)
  }
  assert.equal(seen, 5)
})

test('control codes are passed through, never retried and never counted as repairs', async () => {
  for (const code of ['IMAGE_OFFLOAD_REQUIRED', 'INVALID_CREDENTIAL']) {
    const { requestError, monitor } = mount({ retryOnMalformed: 3 })
    assert.ok(requestError !== undefined)
    const decision = await decide(requestError, failure(code))
    assert.equal(decision, undefined, `${code} is a control signal, not a failure to retry`)
    const counters = monitor.counters()
    assert.equal(counters.streams, 0, 'a control code must not move any repair counter')
    assert.equal(counters.diagnoses, 0, `${code} is not diagnosed: it is a documented signal`)
  }
})

test('the deterministic refusals are named once per step, and never retried', async () => {
  const { requestError, monitor } = mount({ retryOnMalformed: 3 })
  assert.ok(requestError !== undefined)
  for (const code of ['UNSUPPORTED_REASONING_EFFORT', 'INVALID_REQUEST', 'MISSING_CREDENTIAL', 'EMPTY_RESPONSE']) {
    const decision = await decide(requestError, failure(code))
    assert.equal(decision, undefined, `${code} is deterministic: retrying spends a request to learn it twice`)
  }
  const named = monitor.events().filter((event) => event.kind === 'diagnosis')
  assert.equal(named.length, 4, 'four distinct codes on one step means four named lines')
  assert.deepEqual(
    [...new Set(named.map((event) => (event as { code: string }).code))].sort(),
    ['EMPTY_RESPONSE', 'INVALID_REQUEST', 'MISSING_CREDENTIAL', 'UNSUPPORTED_REASONING_EFFORT'],
  )
  // The same step reported again (a host-level retry of the same failure) must
  // not fill the journal with the same sentence.
  await decide(requestError, failure('UNSUPPORTED_REASONING_EFFORT'))
  const again = monitor.events().filter((event) => event.kind === 'diagnosis')
  assert.equal(again.length, 4, 'a repeated report of the same code on the same step is not a second diagnosis')
})

test('the budget is per turn and step, and it is bounded', async () => {
  const { requestError } = mount({ retryOnMalformed: 2 })
  assert.ok(requestError !== undefined)
  assert.deepEqual(await decide(requestError, failure('MALFORMED_RESPONSE')), { kind: 'retry' })
  assert.deepEqual(await decide(requestError, failure('MALFORMED_RESPONSE')), { kind: 'retry' })
  let seen = 0
  const next = () => {
    seen += 1
    return Promise.resolve(undefined)
  }
  assert.equal(await decide(requestError, failure('MALFORMED_RESPONSE'), next), undefined, 'the third attempt is terminal')
  assert.equal(seen, 1)
  // A different step has its own budget.
  const other = { turn: 1, step: 2, failure: { code: 'MALFORMED_RESPONSE' } }
  assert.deepEqual(await decide(requestError, other), { kind: 'retry' })
})

test('the retry cache does not grow without bound across a long-lived process', async () => {
  const { requestError } = mount({ retryOnMalformed: 1 })
  assert.ok(requestError !== undefined)
  // 5000 distinct steps is a week of desktop use; a resident plugin must not keep
  // one Map entry per step for the life of the process.
  for (let step = 1; step <= 5000; step += 1) {
    await decide(requestError, { turn: Math.floor(step / 10), step, failure: { code: 'MALFORMED_RESPONSE' } })
  }
  const size = (requestError as unknown as { cacheSize?: () => number }).cacheSize
  assert.equal(typeof size, 'function', 'the listener must expose its cache size for the gate to measure')
  const entries = size?.() ?? 0
  assert.ok(entries > 0, 'the cache is in use')
  assert.ok(entries <= 256, `the retry cache holds ${entries} entries; it must stay bounded`)
})

test('a cancelled signal is not overridden by a retry', async () => {
  const { requestError } = mount({ retryOnMalformed: 1 })
  assert.ok(requestError !== undefined)
  const decision = await decide(
    requestError,
    { turn: 1, step: 1, failure: { code: 'MALFORMED_RESPONSE' }, signal: { aborted: true } },
    () => Promise.resolve({ kind: 'aborted' }),
  )
  assert.deepEqual(decision, { kind: 'aborted' }, 'cancellation stays authoritative')
})

test('a payload without a failure object is not a retry and not a diagnosis', async () => {
  const { requestError, monitor } = mount({ retryOnMalformed: 1 })
  assert.ok(requestError !== undefined)
  for (const payload of [{}, { turn: 1 }, { failure: {} }, { failure: { code: '' } }]) {
    assert.equal(await decide(requestError, payload), undefined)
  }
  assert.equal(monitor.counters().diagnoses, 0, 'an empty code is not a diagnosed class')
})
