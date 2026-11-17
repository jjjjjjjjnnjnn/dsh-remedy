import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInventory, orderRegistrants, registrationsIn, reservedUsesIn } from '../../scripts/lib/seam-inventory.mjs'
import type { PackageInput, Registrant } from '../../scripts/lib/seam-inventory.mjs'

/**
 * R68: nothing recorded which plugins share a seam with remedy, so a new plugin
 * could jump ahead of the wrapper (or a veto could disable it) and every gate
 * stayed green. The classifier is pure so these cases can be red here instead of
 * wrong on the desktop profile.
 */

test('a registration is found, and names without a slash are not seams', () => {
  const text = `
    ctx.on('llm/stream', (options, next) => wrap(next()))
    ctx.on('ready', () => {})
    ctx.emit('tool/result', handler)
  `
  const found = registrationsIn(text)
  assert.deepEqual(
    found.map((entry) => `${entry.mode}:${entry.seam}`),
    ['on:llm/stream', 'emit:tool/result'],
  )
  assert.deepEqual(registrationsIn('const x = 1'), [])
})

test('prepend is read from the options that follow the callback', () => {
  // The measured host shape: `dsh-session-title` passes `{ global: true, prepend: true }`
  // on the line after the callback body.
  const text = `
    ctx.on("llm/stream", (options, next) => {
      this.onMainRequest(options)
      return next()
    }, {
      global: true,
      prepend: true
    })
  `
  const [entry] = registrationsIn(text)
  assert.equal(entry?.seam, 'llm/stream')
  assert.equal(entry?.prepend, true)

  const plain = registrationsIn("ctx.on('llm/stream', (options, next) => next())")
  assert.equal(plain[0]?.prepend, false)
})

test('waterfall order is outermost-first, and a prepend unshifts', () => {
  const plain: Registrant[] = [
    { name: 'dsh-remedy', version: '0.4.18', load_index: 15, prepend: false },
    { name: 'dsh-ops', version: '0.5.4', load_index: 19, prepend: false },
  ]
  assert.deepEqual(orderRegistrants(plain).map((entry) => entry.name), ['dsh-remedy', 'dsh-ops'])

  const withPrepend: Registrant[] = [
    ...plain,
    // Loaded last but unshifted, so it is the outermost listener of all.
    { name: 'late-plugin', version: '1.0.0', load_index: 40, prepend: true },
  ]
  assert.deepEqual(orderRegistrants(withPrepend).map((entry) => entry.name), ['late-plugin', 'dsh-remedy', 'dsh-ops'])

  // An unknown load order sorts last: claiming an order the profile never
  // promised is worse than admitting it is unknown.
  const unknown = [...plain, { name: 'file-dropped', version: '1.0.0', load_index: null, prepend: false }]
  assert.deepEqual(orderRegistrants(unknown).map((entry) => entry.name), ['dsh-remedy', 'dsh-ops', 'file-dropped'])
})

test('two packages on one seam are a conflict, with the order resolved', () => {
  const packages: PackageInput[] = [
    {
      name: 'dsh-remedy',
      version: '0.4.18',
      load_index: 15,
      registrations: [{ seam: 'llm/stream', mode: 'on', prepend: false, file: 'dist/index.js' }],
    },
    {
      name: 'dsh-ops',
      version: '0.5.4',
      load_index: 19,
      registrations: [{ seam: 'llm/stream', mode: 'on', prepend: false, file: 'lib/x.js' }],
    },
    {
      name: 'dsh-pet',
      version: '0.4.5',
      load_index: null,
      registrations: [{ seam: 'agent/error', mode: 'on', prepend: false, file: 'lib/app.js' }],
    },
  ]
  const inventory = buildInventory(packages)
  assert.deepEqual(inventory.conflicts.map((row) => row.seam), ['llm/stream'])
  assert.deepEqual(inventory.conflicts[0]?.order, ['dsh-remedy@0.4.18', 'dsh-ops@0.5.4'])
  assert.equal(inventory.conflicts[0]?.outermost, 'dsh-remedy@0.4.18')
  assert.equal(inventory.conflicts[0]?.wraps, 2)
  assert.equal(inventory.conflicts[0]?.observes, 0)
  assert.equal(inventory.seams.find((row) => row.seam === 'agent/error')?.same_seam, false)
})

test('a reserved name claimed by another package is a warning, and remedy itself is not', () => {
  const reserved = ['remedy_unattributed']
  assert.deepEqual(reservedUsesIn("name: 'remedy_unattributed'", reserved), ['remedy_unattributed'])
  assert.deepEqual(reservedUsesIn("const name = 'read'", reserved), [])

  const inventory = buildInventory([
    {
      name: 'dsh-remedy',
      version: '0.4.18',
      load_index: 15,
      registrations: [],
      reserved: ['remedy_unattributed'],
    },
    {
      name: 'other-plugin',
      version: '1.0.0',
      load_index: 99,
      registrations: [],
      reserved: ['remedy_unattributed'],
    },
  ])
  assert.deepEqual(inventory.warnings, ['other-plugin@1.0.0 uses the reserved name "remedy_unattributed"'])
})
