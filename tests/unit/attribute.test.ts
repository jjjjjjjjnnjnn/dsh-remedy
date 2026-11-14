import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fragmentFit, type FragmentDeclaration } from 'dsh-remedy-core'

/**
 * P-0030 — the name check reads the schema the host actually sends.
 *
 * `dsh-tools` compiles every first-party parameter map to
 * `{type:'object', properties, required?}` and never sets
 * `additionalProperties` (`dsh-tools/lib/index.js:800-808`). The schema is
 * therefore **open**: an undeclared key is allowed, so "this fragment carries a
 * key the tool never declared" is not proof that it belongs to another tool. The
 * one-line version of the obvious fix would have been an over-claim.
 *
 * What this table pins:
 *
 *  - `foreign` needs a schema that the arguments actually violate — a missing
 *    `required` field, an undeclared key in a **closed** schema, or a declared
 *    field whose value breaks its own `type` / `enum` / `const`.
 *  - `fits` means "the schema found nothing against it", which is not identity.
 *  - `unproven` means the schema gave nothing to check, and the plugin keeps the
 *    stream's name while booking the residue.
 */

const fit = (value: unknown, declaration: FragmentDeclaration) => fragmentFit(JSON.stringify(value), declaration)

const closed = (properties: Record<string, unknown>, required?: readonly string[]): FragmentDeclaration => ({
  name: 'tool',
  parameters: {
    type: 'object',
    properties,
    ...(required === undefined ? {} : { required }),
    additionalProperties: false,
  },
})

test('a missing required field is proof the fragment is not this tool', () => {
  assert.equal(fit({ command: 'ls' }, closed({ file_path: { type: 'string' } }, ['file_path'])), 'foreign')
})

test('a satisfied required list is as far as an open schema can go', () => {
  assert.equal(
    fit({ file_path: 'a.txt' }, { name: 'read', parameters: { type: 'object', required: ['file_path'] } }),
    'fits',
  )
})

test('an open schema with no required list decides nothing', () => {
  // The shape P-0027 met: `{type:'object'}` and nothing else.
  assert.equal(fit({ command: 'ls' }, { name: 'read', parameters: { type: 'object' } }), 'unproven')
  assert.equal(fit({}, { name: 'read' }), 'unproven', 'no parameters at all is also nothing to check')
})

test('a closed schema turns an undeclared key into proof', () => {
  assert.equal(fit({ command: 'ls' }, closed({ file_path: { type: 'string' } })), 'foreign')
  assert.equal(fit({ file_path: 'a.txt' }, closed({ file_path: { type: 'string' } })), 'fits')
})

test('a declared field with the wrong type is proof', () => {
  assert.equal(
    fit({ limit: 'ten' }, { name: 'scan', parameters: { type: 'object', properties: { limit: { type: 'number' } } } }),
    'foreign',
  )
})

test('a declared field that violates its enum or const is proof', () => {
  const schema: FragmentDeclaration = {
    name: 'tool',
    parameters: { type: 'object', properties: { mode: { enum: ['fast', 'slow'] } } },
  }
  assert.equal(fit({ mode: 'warp' }, schema), 'foreign')
  assert.equal(fit({ mode: 'fast' }, schema), 'fits')
})

test('a keyword this module does not decide is not evidence', () => {
  const schema: FragmentDeclaration = {
    name: 'tool',
    parameters: {
      type: 'object',
      properties: { value: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
    },
  }
  assert.equal(fit({ value: [] }, schema), 'fits', 'an undecided keyword must not produce a refusal')
})

test('arguments that are not an object cannot be this tool call', () => {
  for (const value of ['text', 42, null, [1, 2]]) {
    assert.equal(fit(value, closed({})), 'foreign')
  }
  assert.equal(fragmentFit('not json', closed({})), 'foreign', 'unparsable arguments cannot be a valid call')
  assert.equal(fragmentFit('', closed({})), 'fits', 'empty arguments normalize to an empty object')
})
