#!/usr/bin/env node
/**
 * Gate: the byte budget, split by load path (P-0012).
 *
 * A budget no script checks is a suggestion, and this repository crossed one
 * three times before P-0008 turned it into this gate. P-0012 splits that gate's
 * single cap into the two numbers it was always describing — what a mounted
 * plugin loads, and what a CLI invocation loads — because a daemon pays only the
 * first and one cap forced every resident byte to be financed by deleting CLI
 * code. The reasoning, the measured pair, and the owner's signature live in
 * `scripts/lib/budgets.mjs`.
 *
 * Negative control: `--mutate` compares each measured subtotal against a cap one
 * byte below it, so a gate that stopped comparing goes red instead of green.
 */

import { statSync } from 'node:fs'
import { abs, listDir, readText, runGate } from './lib/kit.mjs'
import {
  CLI_CAP,
  CLI_FILES,
  FILE_CAPS,
  RESIDENCY_CAP,
  RESIDENCY_FILES,
  TOTAL_CAP,
  UNCHECKED_LIMIT,
} from './lib/budgets.mjs'

const DIST = 'packages/plugin/dist'

const bytesOf = (name) => {
  try {
    return statSync(abs(`${DIST}/${name}`)).size
  } catch {
    return null
  }
}

const subtotal = (sizes, names) =>
  names.reduce((sum, name) => {
    const found = sizes.find((item) => item.name === name)
    return sum + (found?.bytes ?? 0)
  }, 0)

/**
 * The byte account the live handoff tells a successor to start from.
 *
 * It is hand-copied prose, and the same file used to tell the next agent to pay a
 * new patch by splitting modules by load path. That cannot work: the total is the
 * sum of both halves, so a split only moves bytes between the subtotals. The row
 * is compared with the build so the advice and the numbers cannot drift apart.
 *
 * The fact pack writes thousands with a thin space (`82 985`); flatten only
 * digit/space/three-digit groups, then read the one row that carries `emit`.
 */
function handoffClaim() {
  const row = readText('docs/HANDOFF.md').split(/\r?\n/).find((line) => line.includes('emit 总量')) ?? ''
  const flat = row.replace(/(\d)\s+(\d{3})/g, '$1$2')
  const match = flat.match(/emit 总量 \*\*(\d+) \/ (\d+)\*\*（常驻 (\d+) \/ (\d+)，CLI (\d+) \/ (\d+)）/)
  if (match === null) return null
  return {
    total: Number(match[1]),
    totalCap: Number(match[2]),
    residency: Number(match[3]),
    residencyCap: Number(match[4]),
    cli: Number(match[5]),
    cliCap: Number(match[6]),
  }
}

await runGate('size', async ({ checks, mutate }) => {
  const names = listDir(DIST).filter((entry) => entry.isFile && entry.name.endsWith('.js'))
  checks.require('dist-present', names.length > 0, `no ${DIST}/*.js — run the build first`)

  const sizes = names.map((entry) => ({ name: entry.name, bytes: bytesOf(entry.name) ?? 0 }))
  const total = sizes.reduce((sum, item) => sum + item.bytes, 0)
  const residency = subtotal(sizes, RESIDENCY_FILES)
  const cli = subtotal(sizes, CLI_FILES)

  // Every emitted module must belong to exactly one load path, or the two
  // subtotals stop adding up to the total and one of them is silently unpaid.
  const classified = [...RESIDENCY_FILES, ...CLI_FILES]
  const unclassified = sizes.map((item) => item.name).filter((name) => !classified.includes(name))
  checks.add(
    'every-module-is-classified',
    unclassified.length === 0,
    unclassified.length === 0 ? 'every emitted module belongs to one load path' : `unclassified: ${unclassified.join(', ')}`,
  )

  checks.add(
    'residency',
    residency <= (mutate ? Math.max(0, residency - 1) : RESIDENCY_CAP),
    `${residency} of ${mutate ? residency - 1 : RESIDENCY_CAP} bytes across ${RESIDENCY_FILES.length} resident modules`,
  )
  checks.add(
    'cli',
    cli <= (mutate ? Math.max(0, cli - 1) : CLI_CAP),
    `${cli} of ${mutate ? cli - 1 : CLI_CAP} bytes across ${CLI_FILES.length} CLI modules`,
  )
  checks.add(
    'total',
    total <= (mutate ? Math.max(0, total - 1) : TOTAL_CAP),
    `${total} of ${mutate ? total - 1 : TOTAL_CAP} bytes across ${sizes.length} files`,
  )

  for (const [name, cap] of FILE_CAPS) {
    const found = sizes.find((item) => item.name === name)
    checks.add(
      `file:${name}`,
      found !== undefined && found.bytes <= cap,
      found === undefined ? `${name} is missing from ${DIST}` : `${found.bytes} of ${cap} bytes`,
    )
  }

  // The live handoff's byte row is what a successor acts on, so it is measured
  // rather than remembered. `--mutate` compares it against a number one byte off
  // the measurement, which proves the check is not vacuously green.
  const claim = handoffClaim()
  const expected = {
    total: mutate ? total + 1 : total,
    totalCap: TOTAL_CAP,
    residency: mutate ? residency + 1 : residency,
    residencyCap: RESIDENCY_CAP,
    cli: mutate ? cli + 1 : cli,
    cliCap: CLI_CAP,
  }
  const drift =
    claim === null
      ? ['the live handoff has no "emit 总量" row to compare']
      : Object.entries(expected)
          .filter(([key, value]) => claim[key] !== value)
          .map(([key, value]) => `${key}: handoff ${claim[key]} vs measured ${value}`)
  checks.add(
    'handoff-bytes',
    drift.length === 0,
    drift.length === 0
      ? `total ${total} of ${TOTAL_CAP}, residency ${residency} of ${RESIDENCY_CAP}, cli ${cli} of ${CLI_CAP}`
      : drift.join('; '),
  )

  // A file above the unchecked limit that nobody capped is the shape of the bug
  // this gate exists to stop: it grows quietly and the total is the only alarm.
  const caps = new Map(FILE_CAPS)
  const uncapped = sizes.filter((item) => item.bytes > UNCHECKED_LIMIT && !caps.has(item.name))
  checks.add(
    'uncapped-large-files',
    uncapped.length === 0,
    uncapped.length === 0
      ? `every file above ${UNCHECKED_LIMIT} bytes has a cap`
      : uncapped.map((item) => `${item.name} ${item.bytes} bytes`).join(', '),
  )
})
