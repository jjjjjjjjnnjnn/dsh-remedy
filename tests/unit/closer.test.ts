import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repairToolCallArguments, type ToolCallInput } from 'dsh-remedy-core'

const call = (args: string): ToolCallInput => ({ id: 'call_1', name: 'ui_render', arguments: args })

/**
 * The #12819 tail, shortened but structurally identical: `components` is the
 * array whose `]` the model dropped, and three closers follow the gap. The
 * insertion point is interior, never end-of-text.
 */
const MISSING_ARRAY_CLOSER =
  '{"root":"c1","components":[{"id":"c1","type":"Choice","props":{"options":[{"id":"a","prompt":"x"}]}}}'
const MISSING_ARRAY_CLOSER_FIXED =
  '{"root":"c1","components":[{"id":"c1","type":"Choice","props":{"options":[{"id":"a","prompt":"x"}]}}]}'

/**
 * Two different interior insertions each yield valid JSON: the fuzz run in
 * `.tmp/experiment-closer2.mjs` found 604 of 1687 such shapes (35.8%). This one
 * is a genuine tie, not an injected one.
 */
const AMBIGUOUS = '{"command":{"path":{"id":88},"path":"x y"}'

test('the entire pipeline routes one object with a dropped closer to `closed`', () => {
  const result = repairToolCallArguments(call(MISSING_ARRAY_CLOSER))
  assert.equal(result.status, 'repaired')
  if (result.status !== 'repaired') return
  assert.equal(result.code, 'closed')
  assert.equal(result.fragments, 1)
  assert.match(result.key ?? '', /^]@\d+$/, 'the key names the restored delimiter and its site')
  assert.equal(result.calls.length, 1, 'one call was intended: nothing is synthesized')
  assert.equal(result.calls[0]?.id, 'call_1', 'the call keeps its identity')
  assert.equal(result.calls[0]?.name, 'ui_render', 'the call keeps its name')
  assert.deepEqual(JSON.parse(result.calls[0]!.arguments), JSON.parse(MISSING_ARRAY_CLOSER_FIXED))
})

test('the pipeline still refuses the ambiguous shape', () => {
  const result = repairToolCallArguments(call(AMBIGUOUS))
  assert.equal(result.status, 'rejected')
})

test('the pipeline still refuses a cut tail even when the closer proof could fire', () => {
  const result = repairToolCallArguments(call(MISSING_ARRAY_CLOSER), { truncated: true })
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') return
  assert.equal(result.code, 'truncated')
})

test('the pipeline still refuses a missing final closer', () => {
  // `{"command":"ls"` is one insertion away from parsing, and it is also exactly
  // what a cut tail looks like. Nothing after the insertion point means the model
  // may never have finished writing, so this is not a repair.
  const result = repairToolCallArguments(call('{"command":"ls"'))
  assert.equal(result.status, 'rejected')
})
