import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repairToolCallArguments, splitTopLevelJsonObjects, type ToolCallInput } from 'dsh-remedy-core'

/**
 * Property test over generated inputs, not hand-picked fixtures.
 *
 * The engine may only do one of two things: hand back calls whose arguments
 * each parse on their own, or refuse. A third outcome — dispatch a call nobody
 * can parse — is the defect this project exists to prevent, so it is asserted
 * over thousands of shapes instead of the six checked by hand.
 *
 * The generator is seeded, so a failure is reproducible: `SEED` is printed with
 * the first counter-example.
 */

const SEED = 0x5eed1234

/** A small deterministic PRNG (mulberry32), so failures can be replayed. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = makeRandom(SEED)

const pick = <T>(items: readonly T[]): T => {
  const at = Math.floor(random() * items.length)
  return items[Math.min(at, items.length - 1)] as T
}

/** One plausible tool-call member value. */
function memberValue(): string {
  switch (Math.floor(random() * 8)) {
    case 0:
      return '"file_path": "README.md"'
    case 1:
      return '"command": "git status"'
    case 2:
      return '"file_path": "docs/HANDOFF.md"'
    case 3:
      return '"pattern": "MALFORMED_RESPONSE"'
    case 4:
      return '"code": "const x = 1"'
    case 5:
      // A brace inside a string: the classic false boundary.
      return '"text": "a } { b"'
    case 6:
      return '"n": 42'
    default:
      return '"list": [1, 2, 3]'
  }
}

function oneObject(): string {
  const members = Math.floor(random() * 3) + 1
  const parts: string[] = []
  for (let index = 0; index < members; index += 1) parts.push(memberValue())
  return `{${parts.join(',')}}`
}

/** A text that claims to be N objects glued together. */
function fusion(count: number): string {
  const parts: string[] = []
  for (let index = 0; index < count; index += 1) parts.push(oneObject())
  return parts.join('')
}

const SHAPES: readonly (() => string)[] = [
  // Clean and provable: two to four glued objects.
  () => fusion(2),
  () => fusion(3),
  () => fusion(4),
  // Nested: an object whose value is itself an object.
  () => `{"code":"x","meta":{"a":1}}{"code":"y"}`,
  // Braces and quotes inside strings.
  () => `{"code":"a } { b"}{"code":"c"}`,
  () => `{"code":"escaped \\" quote"}{"code":"e"}`,
  // Truncated tails: must never be split.
  () => `{"code":"x"}{"file_path":`,
  () => `{"code":"x"}{"code":"unterminated`,
  () => `{"code":"x"}{"code"`,
  // One object only: not a fusion.
  () => oneObject(),
  // Trailing garbage that is not a second object.
  () => `{"code":"x"}garbage`,
  // A bare value after a member key (the reseal shape).
  () => '{"code": const fs = 1}',
  // Deeply nested arrays and objects.
  () => `{"code":"x","args":{"a":[1,{"b":2}]}}{"code":"y","args":[[1,2]]}`,
  // Empty object followed by a real one.
  () => `{}{"code":"y"}`,
  // Whitespace between objects.
  () => `{"code":"x"} {"code":"y"}`,
]

test(`fuzz: every accepted call parses on its own (seed ${SEED})`, () => {
  let accepted = 0
  let rejected = 0
  for (let iteration = 0; iteration < 2000; iteration += 1) {
    const argumentsText = pick(SHAPES)()
    const input: ToolCallInput = { id: `fuzz-${iteration}`, name: 'read', arguments: argumentsText }
    const result = repairToolCallArguments(input, {
      truncated: false,
      maxCalls: 8,
      existingIds: new Set(),
    })

    if (result.status === 'rejected') {
      rejected += 1
      // A rejection must say why; an empty reason is an undiagnosable failure.
      assert.ok(result.code.length > 0, `rejected case ${iteration} has an empty code`)
      assert.equal(typeof result.detail, 'string')
      continue
    }

    accepted += 1
    assert.ok(result.calls.length > 0, `an accepted case must dispatch something (case ${iteration})`)
    const ids = new Set<string>()
    for (const call of result.calls) {
      // The one invariant that matters: a dispatched argument text must parse.
      let parsed: unknown
      assert.doesNotThrow(() => {
        parsed = JSON.parse(call.arguments)
      }, `case ${iteration} dispatched unparsable arguments: ${call.arguments.slice(0, 120)}`)
      assert.equal(typeof parsed, 'object', `case ${iteration} parsed to a non-object`)
      assert.ok(parsed !== null && !Array.isArray(parsed), `case ${iteration} parsed to a non-plain object`)
      assert.equal(call.name, 'read', `case ${iteration} lost the tool name`)
      assert.ok(call.id.length > 0, `case ${iteration} produced a call with no id`)
      assert.ok(!ids.has(call.id), `case ${iteration} produced a duplicate id ${call.id}`)
      ids.add(call.id)
    }
  }
  // A run that only exercises one branch proves nothing.
  assert.ok(accepted > 200, `only ${accepted} accepted case(s); the generator is not varied enough`)
  assert.ok(rejected > 100, `only ${rejected} rejected case(s); the generator is not varied enough`)
})

test(`fuzz: the decision is deterministic for the same input (seed ${SEED})`, () => {
  for (let iteration = 0; iteration < 400; iteration += 1) {
    const argumentsText = pick(SHAPES)()
    const options = { truncated: false, maxCalls: 8, existingIds: new Set<string>() }
    const first = repairToolCallArguments({ id: 'stable', name: 'read', arguments: argumentsText }, options)
    const second = repairToolCallArguments({ id: 'stable', name: 'read', arguments: argumentsText }, options)
    assert.equal(first.status, second.status, `case ${iteration} is not deterministic`)
    if (first.status === 'repaired' && second.status === 'repaired') {
      assert.equal(first.calls.length, second.calls.length)
      for (const [index, call] of first.calls.entries()) {
        assert.equal(call.arguments, second.calls[index]?.arguments)
        assert.equal(call.id, second.calls[index]?.id)
      }
    }
    if (first.status === 'rejected' && second.status === 'rejected') {
      assert.equal(first.code, second.code)
    }
  }
})

test(`fuzz: a forbidden split never gains calls when the budget is zero`, () => {
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const argumentsText = pick(SHAPES)()
    const result = repairToolCallArguments(
      { id: 'budget', name: 'read', arguments: argumentsText },
      { truncated: false, maxCalls: 1, existingIds: new Set() },
    )
    if (result.status !== 'repaired') continue
    // With a budget of one, only a reseal (which synthesizes nothing) may pass.
    assert.ok(
      result.calls.length <= 1,
      `case ${iteration} emitted ${result.calls.length} calls under a one-call budget`,
    )
  }
})

test(`fuzz: the splitter never reports a boundary inside a JSON string`, () => {
  const cases = [
    '{"a":"x}{y"}{"b":1}',
    '{"a":"}} "}{"b":1}',
    '{"a":"\\\\"}{"b":1}',
    '{"a":{"b":"}{"}}{"c":1}',
  ]
  for (const text of cases) {
    const split = splitTopLevelJsonObjects(text)
    assert.ok(split.ok, `${text} should split`)
    assert.equal(split.slices.length, 2, `${text} split into ${split.slices.length}`)
    for (const slice of split.slices) {
      assert.doesNotThrow(() => JSON.parse(slice), `slice does not parse: ${slice}`)
    }
  }
})
