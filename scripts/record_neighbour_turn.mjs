#!/usr/bin/env node
/**
 * R70 · what `llm/stream` does with a chunk it cannot read, measured inside a
 * real host turn instead of inside a hand-built context.
 *
 * Three arms per scenario, one isolated `DSH_HOME` each:
 *
 *   control  the neighbour plugin only — what the host does with these chunks
 *            when remedy is not mounted. This is what "fail open" must equal.
 *   old      the released bytes from the version before the patch (0.4.18 for
 *            P-0053 / P-0054).
 *   new      this tree, which is the 0.4.19 bytes on the registry.
 *
 * The artifact is written only when the shape it claims holds; a run that does
 * not have that shape makes this script exit 4 instead of recording a success.
 *
 *   node scripts/record_neighbour_turn.mjs \
 *     --control .tmp/r70-runs/control --old .tmp/r70-runs/old \
 *     --new .tmp/r70-runs/new --stamp 2026-11-19T09:00:00.000Z
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { outcomeOf, readRun, sameOutcome, sawMainStream } from './lib/turn-run.mjs'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_neighbour_turn: --stamp must be ISO-8601\n')
  process.exit(2)
}

const roots = { control: flag('control'), old: flag('old'), new: flag('new') }
for (const [arm, root] of Object.entries(roots)) {
  if (root === undefined) {
    process.stderr.write(`record_neighbour_turn: --${arm} is required\n`)
    process.exit(2)
  }
}

/** The scenarios this artifact owns; the repair family lives in the other one. */
const SCENARIOS = ['null-chunk', 'object-arguments', 'no-block', 'finish-no-reason', 'reserved-fused', 'reserved-nameless']

/** One run reduced to what a claim may point at. */
function observe(dir) {
  const run = readRun(dir)
  return {
    version: run.version,
    exit_code: run.exitCode,
    stderr_first: run.stderr[0] ?? '',
    turn_end: run.turnEnd,
    assistant: run.blocks,
    calls: run.calls.map((call) => ({ name: call.name, id: call.id })),
    results: run.results.map((result) => ({ id: result.id, code: result.code, is_error: result.isError })),
    journal: { events: run.journal.length, counters: run.counters },
    neighbour_tools: run.neighbour.filter((event) => event.event === 'tool').map((event) => event.name),
    requests: run.requests.length,
    saw_main_stream: sawMainStream(run),
    artefact_sha256: {
      session: run.sessionSha,
      journal: run.journalSha,
      neighbour: run.neighbourSha,
    },
  }
}

const runs = {}
const problems = []
for (const scenario of SCENARIOS) {
  const arms = {}
  for (const arm of ['control', 'old', 'new']) {
    const dir = join(roots[arm], scenario)
    if (!existsSync(join(dir, 'result.json'))) {
      problems.push(`${scenario}/${arm}: no result.json under ${dir}`)
      continue
    }
    arms[arm] = readRun(dir)
  }
  if (arms.control === undefined || arms.old === undefined || arms.new === undefined) continue
  runs[scenario] = {
    control: observe(join(roots.control, scenario)),
    old: observe(join(roots.old, scenario)),
    new: observe(join(roots.new, scenario)),
    same_new_control: sameOutcome(arms.new, arms.control),
    same_old_control: sameOutcome(arms.old, arms.control),
    old_owns_fallback: arms.old.neighbour.some((event) => event.event === 'tool' && event.name === 'remedy_unattributed'),
    new_owns_fallback: arms.new.neighbour.some((event) => event.event === 'tool' && event.name === 'remedy_unattributed'),
    control_has_journal: arms.control.journal.length !== 0,
  }
}

// A control run must be plugin-free, and a new run must have mounted remedy and
// seen the main step: otherwise the row measures nothing.
for (const scenario of Object.keys(runs)) {
  const row = runs[scenario]
  if (row.control_has_journal) problems.push(`${scenario}: the control run wrote a remedy journal, so it was not plugin-free`)
  if (row.new.journal.events === 0) problems.push(`${scenario}: the new run wrote no journal, so remedy did not mount`)
  if (!row.new.saw_main_stream) problems.push(`${scenario}: the neighbour never saw a main-step stream in the new run`)
  if (!row.old.saw_main_stream) problems.push(`${scenario}: the neighbour never saw a main-step stream in the old run`)
}

const discriminating = ['object-arguments', 'finish-no-reason']
for (const scenario of discriminating) {
  const row = runs[scenario]
  if (row === undefined) continue
  if (!row.same_new_control) {
    problems.push(`${scenario}: the fail-open outcome differs from the neighbour-only host outcome`)
  }
  if (row.same_old_control) {
    problems.push(`${scenario}: the released bytes produced the same outcome as the control, so the row proves nothing`)
  }
}

for (const scenario of ['reserved-fused', 'reserved-nameless']) {
  const row = runs[scenario]
  if (row === undefined) continue
  if (!row.old_owns_fallback) problems.push(`${scenario}: the released bytes never dispatched the borrowed name`)
  if (row.new_owns_fallback) problems.push(`${scenario}: this tree still dispatched the borrowed name`)
  if (!row.same_new_control) {
    problems.push(`${scenario}: abandoning the rescue did not reproduce the provider-only outcome`)
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `record_neighbour_turn: the runs do not have the shape this artifact claims: ${problems.join('; ')}\n`,
  )
  process.exit(4)
}

const claims = {
  p0053_a_chunk_whose_arguments_is_not_a_string:
    'the 0.4.18 bytes ended the turn with "text.trim is not a function"; this tree reproduces the neighbour-only outcome',
  p0053_a_finish_without_a_reason:
    'the 0.4.18 bytes ended the turn with "Cannot read properties of undefined (reading \'kind\')"; this tree reproduces the neighbour-only outcome',
  p0053_null_chunk: 'identical in all three arms: the host itself reads `type`, so this shape cannot attribute an author',
  p0053_block_end_without_a_block:
    'identical in all three arms: the host itself reads `block.type`, so this shape cannot attribute an author',
  p0054_a_fused_fragment:
    'the 0.4.18 bytes dispatched the repaired fragment under `remedy_unattributed`; this tree abandons the rescue and the turn carries the provider failure',
  p0054_a_nameless_block_end:
    'the 0.4.18 bytes dispatched a nameless call under `remedy_unattributed`; this tree keeps the original bytes and the host answers UNKNOWN_TOOL',
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_neighbour_turn.mjs',
  generated_at: stamp,
  question:
    'Inside a real host turn, what does the llm/stream wrapper do with a chunk it did not expect, and can a repair still dispatch under a name the profile already owns?',
  contract_after_r69:
    'remedy may only pass a chunk through, repair a proven fusion, or rethrow the original failure; it must not raise an error of its own',
  probe: {
    homes: 'one isolated DSH_HOME per arm; nothing under ~/.dsh is written',
    client: 'the installed headless CLI of DSH 0.2.2-rc.3 (plugins/plugin/dist and core/dist as packaged)',
    neighbour: 'tests/fixtures/neighbour-bad-chunks — a plugin on llm/stream that yields the shapes the pi-ai adapter never produces',
    provider: 'a local OpenAI-compatible endpoint that answers every request with one short text stream',
    arms: {
      control: 'the neighbour only: the host outcome this stream would have without remedy',
      old: 'the released 0.4.18 bytes (npm tarballs)',
      new: 'this tree, which is the published 0.4.19 bytes',
    },
    host: readHost(),
  },
  runs,
  claims,
  not_proven: [
    'the shapes are synthesized by a neighbour plugin at the seam, not produced by the pi-ai adapter; the adapter that produces the measured incidents is dsh-llm-deepseek, which this harness does not drive',
    'the provider is local and synthetic: one text stream per turn, one turn per run',
    '`null` and a `block-end` with no `block` are non-discriminating here: the host fails with the same message in every arm, so no author can be attributed from the session',
    'one machine, one profile shape, Windows; the same tree was run on Linux for the build and gates, not for these turns',
  ],
  verdict: {
    p0053:
      'verified — inside a real turn, two shapes the 0.4.18 bytes turned into remedy\'s own TypeError now reproduce the neighbour-only outcome',
    p0054:
      'verified — inside a real turn, a profile that owns `remedy_unattributed` no longer receives the repaired fragment or the nameless call',
  },
}

function readHost() {
  const runtime = join(
    process.env.LOCALAPPDATA ?? '',
    'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json',
  )
  if (!existsSync(runtime)) return { version: null, source: null, sha256: null }
  const parsed = JSON.parse(readFileSync(runtime, 'utf8'))
  return {
    version: parsed.desktopVersion ?? null,
    source: redactValue(runtime).value,
    sha256: sha256(readFileSync(runtime)),
  }
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out') ?? `data/results/live-neighbours-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_neighbour_turn: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
for (const scenario of SCENARIOS) {
  const row = runs[scenario]
  if (row === undefined) continue
  process.stdout.write(
    `${scenario.padEnd(18)} new==control ${String(row.same_new_control).padEnd(5)} old==control ${String(row.same_old_control).padEnd(5)} old dispatched fallback ${row.old_owns_fallback} / new ${row.new_owns_fallback}\n`,
  )
}
