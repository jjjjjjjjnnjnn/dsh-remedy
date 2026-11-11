#!/usr/bin/env node
/**
 * Gate: the byte budget.
 *
 * The budget is written down (`dist/repair-stream.js` 28000,
 * `dist/session-scan.js` 14000, `dist/cli.js` 10000, plugin total 68000) and
 * three consecutive patches crossed a line anyway — 55815 after P-0005,
 * 64539 after P-0004 and 70389 after the first P-0006 attempt — each caught by
 * a person measuring by hand afterwards. A budget no script checks is a
 * suggestion, and this repository has already proved that three times.
 *
 * The rules enforced here:
 *   - the plugin total stays inside its cap;
 *   - the three largest emitted files each stay inside their own cap, because
 *     the cap exists to stop one file from absorbing every patch;
 *   - a file that grows past UNCHECKED_LIMIT must be named in CAPS, so a new
 *     module cannot quietly become the new biggest file with no cap at all.
 *
 * Negative control: `--mutate` compares the measured total against a cap one
 * byte below it, so a gate that stopped comparing goes green instead of red.
 */

import { statSync } from 'node:fs'
import { abs, listDir, runGate } from './lib/kit.mjs'

const DIST = 'packages/plugin/dist'
const TOTAL_CAP = 68000
const UNCHECKED_LIMIT = 10000
const CAPS = new Map([
  ['repair-stream.js', 28000],
  ['session-scan.js', 14000],
  ['cli.js', 10000],
])

const bytesOf = (path) => {
  try {
    return statSync(abs(path)).size
  } catch {
    return null
  }
}

await runGate('size', async ({ checks, mutate }) => {
  const names = listDir(DIST).filter((entry) => entry.isFile && entry.name.endsWith('.js'))
  checks.require('dist-present', names.length > 0, `no ${DIST}/*.js — run the build first`)

  const sizes = names.map((entry) => ({ name: entry.name, bytes: bytesOf(`${DIST}/${entry.name}`) ?? 0 }))
  const total = sizes.reduce((sum, item) => sum + item.bytes, 0)

  const totalCap = mutate ? Math.max(0, total - 1) : TOTAL_CAP
  checks.add('total', total <= totalCap, `${total} of ${totalCap} bytes across ${sizes.length} files`)

  for (const [name, cap] of CAPS) {
    const found = sizes.find((item) => item.name === name)
    checks.add(
      `file:${name}`,
      found !== undefined && found.bytes <= cap,
      found === undefined ? `${name} is missing from ${DIST}` : `${found.bytes} of ${cap} bytes`,
    )
  }

  // A file above the unchecked limit that nobody capped is the shape of the bug
  // this gate exists to stop: it grows quietly and the total is the only alarm.
  const uncapped = sizes.filter((item) => item.bytes > UNCHECKED_LIMIT && !CAPS.has(item.name))
  checks.add(
    'uncapped-large-files',
    uncapped.length === 0,
    uncapped.length === 0
      ? 'every file above 10000 bytes has a cap'
      : uncapped.map((item) => `${item.name} ${item.bytes} bytes`).join(', '),
  )
})
