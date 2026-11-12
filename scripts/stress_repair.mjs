#!/usr/bin/env node
/**
 * Stress the repair engine far past what a unit test can afford.
 *
 * The shipped unit suite runs a seeded property test of about two thousand
 * shapes per run, which is what a red/green cycle can pay for. This script is
 * the other half: it replays hundreds of thousands of generated argument texts
 * through the *built* engine and asserts the one invariant that matters —
 * anything accepted must dispatch calls that each parse on their own.
 *
 * Output: `data/results/stress-repair-<stamp>.json` + `.sha256`, with the full
 * decision histogram, every refusal code with its count, and the first
 * counter-example if one is ever found.
 *
 * Exits 1 on a counter-example, 0 otherwise. Node built-ins only.
 */

import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const stamp = flag('stamp', '')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)) {
  console.error('stress_repair: --stamp must be ISO-8601 like 2026-11-12T12:00:00.000Z')
  process.exit(2)
}
const cases = Number.parseInt(flag('cases', '200000'), 10)
if (!Number.isInteger(cases) || cases < 1000 || cases > 5000000) {
  console.error('stress_repair: --cases must be between 1000 and 5000000')
  process.exit(2)
}
const seed = Number.parseInt(flag('seed', '1592594996'), 10)

const corePath = join(ROOT, 'packages', 'core', 'dist', 'index.js')
if (!existsSync(corePath)) {
  console.error('stress_repair: build first (packages/core/dist/index.js is missing)')
  process.exit(3)
}
const core = await import(pathToFileURL(corePath).href)
for (const name of ['repairToolCallArguments', 'splitTopLevelJsonObjects', 'redact']) {
  if (typeof core[name] !== 'function') {
    console.error(`stress_repair: the built core no longer exports ${name}`)
    process.exit(3)
  }
}

/** mulberry32: deterministic, so a counter-example can be replayed. */
function makeRandom(state) {
  let value = state >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = makeRandom(seed)
const pick = (items) => items[Math.min(Math.floor(random() * items.length), items.length - 1)]

const NAMES = ['read', 'ops_bash', 'read_page', 'run_code', 'edit', 'web_search', 'ops_grep']
const KEYS = ['file_path', 'command', 'code', 'pattern', 'text', 'path', 'query', 'n', 'list', 'meta']

function scalar() {
  switch (Math.floor(random() * 10)) {
    case 0:
      return '42'
    case 1:
      return 'true'
    case 2:
      return 'null'
    case 3:
      return '[1,2,3]'
    case 4:
      return '{"a":1}'
    case 5:
      return '"a } { b"'
    case 6:
      return '"escaped \\" quote"'
    case 7:
      return '"tab\\tnewline\\n"'
    case 8:
      return '"unicode \\u00e9"'
    default:
      return '"plain"'
  }
}

function member() {
  const key = pick(KEYS)
  return `"${key}":${scalar()}`
}

function objectOf(count) {
  const parts = []
  for (let index = 0; index < count; index += 1) parts.push(member())
  return `{${parts.join(',')}}`
}

const SHAPES = [
  () => `${objectOf(2)}`,
  () => `${objectOf(3)}`,
  () => `${objectOf(4)}`,
  () => `${objectOf(5)}`,
  () => `${objectOf(6)}`,
  () => `${objectOf(2)} ${objectOf(2)}`,
  () => `${objectOf(1)}${objectOf(1)}${objectOf(1)}`,
  () => objectOf(1),
  () => `{}{}`,
  () => `${objectOf(2)}garbage`,
  () => `${objectOf(2)}{"code":`,
  () => `${objectOf(2)}{"code":"unterminated`,
  () => `${objectOf(1)}{"a":`,
  () => '{"code": const x = 1}',
  () => '{"code": 1 + 2}',
  () => '{"code":"x","code":"y"}',
  () => `{"code":"x"}{"code":"y","meta":{"deep":{"deeper":[1,{"z":"}"}]}}}`,
  () => `{"text":"}{"}{"text":"}{\"}`,
  () => `${objectOf(2)}${objectOf(2)}${objectOf(2)}${objectOf(2)}${objectOf(2)}`,
  () => `{"a":"${'x'.repeat(40)}"}{"b":1}`,
]

const decisions = new Map()
const refusals = new Map()
let accepted = 0
let rejected = 0
let unchanged = 0
let unparsableDispatches = 0
let emptyRepairs = 0
let duplicateIds = 0
let lostNames = 0
let counterExample = null

for (let iteration = 0; iteration < cases; iteration += 1) {
  const text = pick(SHAPES)()
  const name = pick(NAMES)
  const result = core.repairToolCallArguments(
    { id: `stress-${iteration}`, name, arguments: text },
    { truncated: false, maxCalls: 8, existingIds: new Set() },
  )
  const label =
    result.status === 'repaired'
      ? `repaired:${result.code}`
      : result.status === 'unchanged'
        ? 'unchanged'
        : `rejected:${result.code}`
  decisions.set(label, (decisions.get(label) ?? 0) + 1)

  if (result.status !== 'repaired') {
    if (result.status === 'rejected') {
      rejected += 1
      refusals.set(result.code, (refusals.get(result.code) ?? 0) + 1)
    } else {
      unchanged += 1
    }
    continue
  }

  accepted += 1
  if (result.calls.length === 0) {
    emptyRepairs += 1
    counterExample ??= { iteration, text, reason: 'repaired but dispatched nothing' }
    continue
  }
  const ids = new Set()
  for (const call of result.calls) {
    if (call.name !== name) lostNames += 1
    if (ids.has(call.id)) duplicateIds += 1
    ids.add(call.id)
    let parsed
    try {
      parsed = JSON.parse(call.arguments)
    } catch {
      unparsableDispatches += 1
      counterExample ??= { iteration, text, call: call.arguments, reason: 'dispatch does not parse' }
      continue
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      unparsableDispatches += 1
      counterExample ??= { iteration, text, call: call.arguments, reason: 'dispatch is not a plain object' }
    }
  }
}

const ok = unparsableDispatches === 0 && emptyRepairs === 0 && duplicateIds === 0 && lostNames === 0
const payload = {
  schema_version: 1,
  produced_by: 'scripts/stress_repair.mjs',
  generated_at: stamp,
  engine: 'packages/core/dist/index.js (the built package, not src)',
  input: { cases, seed, shapes: SHAPES.length, tools: NAMES.length },
  totals: {
    accepted,
    unchanged,
    rejected,
    repaired_that_dispatch_an_unparsable_call: unparsableDispatches,
    repaired_that_dispatch_nothing: emptyRepairs,
    duplicate_ids: duplicateIds,
    lost_tool_names: lostNames,
  },
  decisions: [...decisions.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
  refusals: [...refusals.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
  invariant: 'every accepted case dispatches at least one call, each with a parseable plain-object argument, its own tool name and a unique id',
  counter_example: counterExample,
  ok,
}

const out = join(ROOT, 'data', 'results', `stress-repair-${stamp.replaceAll(':', '-')}.json`)
const json = `${JSON.stringify(payload, null, 2)}\n`
writeFileSync(out, json, 'utf8')
const digest = createHash('sha256').update(json).digest('hex')
writeFileSync(`${out}.sha256`, `${digest}  ${basename(out)}\n`, 'utf8')

console.log(`stress_repair: wrote data/results/${basename(out)}`)
console.log(
  `stress_repair: ${cases} case(s) · accepted ${accepted} · rejected ${rejected} · ` +
    `unparsable ${unparsableDispatches} · empty ${emptyRepairs} · dup-ids ${duplicateIds} · lost-names ${lostNames}`,
)
for (const { code, count } of payload.decisions) console.log(`  ${code.padEnd(34)} ${count}`)
console.log(`stress_repair: refusals`)
for (const { code, count } of payload.refusals) console.log(`  ${code.padEnd(34)} ${count}`)
console.log(`stress_repair: sha256 ${digest.slice(0, 12)}…`)
process.exitCode = ok ? 0 : 1
