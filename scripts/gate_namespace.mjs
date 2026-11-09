#!/usr/bin/env node
/**
 * Gate: the profile patch layer cannot mount the wrong thing.
 *
 * A DSH bundle that ships a bare `- id:` row patches an existing entry; an
 * unknown target is skipped with a stderr warning while the bundle still looks
 * installed. This gate refuses that shape, refuses upstream row ids, and refuses
 * a row name that is not the package's bare specifier.
 *
 * Negative control: `--mutate` appends a bare `- id: tools` row at column 0.
 */

import { exists, readJson, readText, runGate } from './lib/kit.mjs'

const UPSTREAM_IDS = new Set([
  'plugin-manager',
  'plugin-market',
  'tools',
  'session',
  'llm',
  'web',
  'permission',
  'agent-loop',
  'client-modules',
])
const RESERVED_CONFIG_KEYS = new Set(['llm', 'tools', 'session', 'web', 'permission', 'pluginManager', 'plugin-manager'])

function parsePatch(text) {
  const problems = []
  const rows = []
  let inInsert = false
  let insertIndent = -1
  let current = null

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const indent = /^ */.exec(line)[0].length
    const trimmed = line.trim()

    if (trimmed === '- insert:') {
      inInsert = true
      insertIndent = indent
      current = null
      continue
    }
    if (inInsert && indent <= insertIndent) {
      inInsert = false
      current = null
    }
    if (trimmed.startsWith('- id:')) {
      const id = trimmed.slice('- id:'.length).trim()
      if (!inInsert) problems.push(`row "${id}" is a bare patch target, not an insert:`)
      current = { id, indent, keys: {} }
      rows.push(current)
      continue
    }
    if (current !== null && indent > current.indent) {
      const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(trimmed)
      if (match) current.keys[match[1]] = match[2]
    }
  }

  if (rows.length === 0) problems.push('no rows found')
  for (const row of rows) {
    if (!row.id.startsWith('remedy-')) problems.push(`row "${row.id}" must start with "remedy-"`)
    if (UPSTREAM_IDS.has(row.id)) problems.push(`row "${row.id}" reuses an upstream id`)
    if (row.keys.name !== 'dsh-remedy') problems.push(`row "${row.id}" must mount the bare package name "dsh-remedy"`)
    for (const key of Object.keys(row.keys)) {
      if (RESERVED_CONFIG_KEYS.has(key)) problems.push(`row "${row.id}" config shadows upstream key "${key}"`)
    }
  }
  return { problems, rows }
}

await runGate('namespace', async ({ checks, mutate }) => {
  const path = 'packages/plugin/cordis.patch.yml'
  const base = readText(path)
  const text = mutate ? `${base}\n- id: tools\n  name: dsh-remedy\n` : base
  const { problems, rows } = parsePatch(text)

  checks.require('rows-present', rows.length > 0, `${rows.length} row(s)`)
  checks.require('patch-shape', problems.length === 0, problems.join('; '))

  const pkg = readJson('packages/plugin/package.json')
  checks.add('package-name', pkg.name === 'dsh-remedy', String(pkg.name))
  checks.add('bundle-patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml', String(pkg.dsh?.bundle?.patch))
  checks.add('module-built', exists('packages/plugin/dist/index.js'), 'packages/plugin/dist/index.js (run pnpm build)')
})
