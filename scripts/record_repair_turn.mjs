#!/usr/bin/env node
/**
 * R70 · the repair family, witnessed inside a real host turn.
 *
 * Same three arms as `record_neighbour_turn.mjs`, one scenario per patch, and
 * the old arm is the last release BEFORE that patch shipped (recorded in the
 * artifact, not assumed):
 *
 *   bare-value       P-0005   old 0.3.0  (P-0005 shipped in 0.3.2)
 *   cross-tool       P-0027   old 0.4.3
 *   closed-schema    P-0030   old 0.4.5  (P-0030 shipped in 0.4.6)
 *   reasoning-error  P-0034   old 0.4.8
 *   delta-only       P-0036   old 0.4.9
 *
 *   node scripts/record_repair_turn.mjs --control .tmp/r70-runs/control \
 *     --old .tmp/r70-runs/old --new .tmp/r70-runs/new --stamp <ISO>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { readRun, sawMainStream } from './lib/turn-run.mjs'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_repair_turn: --stamp must be ISO-8601\n')
  process.exit(2)
}

const roots = { control: flag('control'), old: flag('old'), new: flag('new') }
for (const [arm, root] of Object.entries(roots)) {
  if (root === undefined) {
    process.stderr.write(`record_repair_turn: --${arm} is required\n`)
    process.exit(2)
  }
}

/** scenario → the patch it witnesses and the release it is measured against. */
const SCENARIOS = {
  'bare-value': { patch: 'P-0005', old_release: '0.3.0' },
  'cross-tool': { patch: 'P-0027', old_release: '0.4.3' },
  'closed-schema': { patch: 'P-0030', old_release: '0.4.5' },
  'reasoning-error': { patch: 'P-0034', old_release: '0.4.8' },
  'delta-only': { patch: 'P-0036', old_release: '0.4.9' },
}

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
    artefact_sha256: { session: run.sessionSha, journal: run.journalSha, neighbour: run.neighbourSha },
  }
}

const runs = {}
const arms = {}
const problems = []
for (const [scenario, meta] of Object.entries(SCENARIOS)) {
  arms[scenario] = {}
  for (const arm of ['control', 'old', 'new']) {
    const dir = join(roots[arm], scenario)
    if (!existsSync(join(dir, 'result.json'))) {
      problems.push(`${scenario}/${arm}: no result.json under ${dir}`)
      continue
    }
    arms[scenario][arm] = readRun(dir)
  }
  const three = arms[scenario]
  if (three.control === undefined || three.old === undefined || three.new === undefined) continue
  runs[scenario] = {
    patch: meta.patch,
    old_release: meta.old_release,
    control: observe(join(roots.control, scenario)),
    old: observe(join(roots.old, scenario)),
    new: observe(join(roots.new, scenario)),
  }
  if (three.control.journal.length !== 0) problems.push(`${scenario}: the control run wrote a remedy journal`)
  if (three.new.journal.length === 0) problems.push(`${scenario}: the new run wrote no journal, so remedy did not mount`)
  if (!sawMainStream(three.new)) problems.push(`${scenario}: the neighbour never saw a main-step stream in the new run`)
  if (three.old.version !== meta.old_release) {
    problems.push(`${scenario}: the old arm is ${three.old.version}, expected the pre-patch release ${meta.old_release}`)
  }
  if (three.new.version === meta.old_release) problems.push(`${scenario}: the new arm carries the pre-patch release`)
}

const completed = (run) => run.turn_end?.kind === 'completed'
const countersOf = (run) => run.journal?.counters ?? null
const errors = (run) => countersOf(run)?.errors ?? 0
const refused = (run) => countersOf(run)?.refused ?? 0
const resealed = (run) => countersOf(run)?.resealed ?? 0
const callNames = (run) => run.calls.map((call) => call.name)
const secondCall = (run) => run.calls[1]?.name ?? null
const secondResult = (run) => run.results[1]?.code ?? null

const claimResults = {}
function claim(id, holds, detail) {
  claimResults[id] = { holds, detail }
  if (!holds) problems.push(`${id}: ${detail}`)
}

if (runs['bare-value'] !== undefined) {
  const row = runs['bare-value']
  claim(
    'p0005_the_reseal_runs_live',
    completed(row.new) && resealed(row.new) >= 1 && row.new.neighbour_tools.includes('capture'),
    'this tree did not dispatch the resealed call in a completed turn',
  )
  claim(
    'p0005_the_pre_patch_bytes_refused_and_the_turn_died',
    !completed(row.old) && refused(row.old) >= 1 && !completed(row.control),
    '0.3.0 or the plugin-free control completed, so the reseal has nothing to explain',
  )
}

if (runs['cross-tool'] !== undefined) {
  const row = runs['cross-tool']
  claim(
    'p0027_the_surplus_fragment_goes_out_under_the_fallback_name',
    secondCall(row.new) === 'remedy_unattributed' && secondResult(row.new) === 'UNKNOWN_TOOL',
    `the second call was ${String(secondCall(row.new))} answered ${String(secondResult(row.new))}`,
  )
  claim(
    'p0027_the_pre_patch_bytes_dispatched_it_as_the_streams_tool',
    secondCall(row.old) === 'alpha' && row.old.neighbour_tools.includes('alpha'),
    `the second call on 0.4.3 was ${String(secondCall(row.old))}`,
  )
  claim('p0027_without_any_plugin_the_turn_fails', !completed(row.control), 'the control completed')
}

if (runs['closed-schema'] !== undefined) {
  const row = runs['closed-schema']
  claim(
    'p0030_a_closed_schema_proves_the_fragment_foreign',
    secondCall(row.new) === 'remedy_unattributed' && secondResult(row.new) === 'UNKNOWN_TOOL',
    `the second call was ${String(secondCall(row.new))} answered ${String(secondResult(row.new))}`,
  )
  claim(
    'p0030_the_pre_patch_bytes_kept_the_streams_name',
    secondCall(row.old) === 'gamma' && row.old.neighbour_tools.includes('gamma'),
    `the second call on 0.4.5 was ${String(secondCall(row.old))}`,
  )
}

if (runs['reasoning-error'] !== undefined) {
  const row = runs['reasoning-error']
  claim(
    'p0034_a_failure_no_refusal_explains_is_booked_as_an_error',
    errors(row.new) >= 1,
    `the new run booked ${errors(row.new)} error(s)`,
  )
  claim(
    'p0034_the_pre_patch_bytes_booked_it_as_a_quiet_stream',
    errors(row.old) === 0,
    `the 0.4.8 run booked ${errors(row.old)} error(s)`,
  )
  claim(
    'p0034_naming_does_not_change_the_turn',
    row.new.turn_end?.kind === row.old.turn_end?.kind &&
      row.new.turn_end?.error?.code === row.old.turn_end?.error?.code,
    'the turn ending differs between the two arms, so the patch changed more than the ledger',
  )
}

if (runs['delta-only'] !== undefined) {
  const row = runs['delta-only']
  claim(
    'p0036_a_delta_only_call_is_dispatchable',
    completed(row.new) && row.new.neighbour_tools.includes('capture') && refused(row.new) >= 1,
    'the new run did not dispatch the delta-only call',
  )
  claim(
    'p0036_the_pre_patch_bytes_and_the_control_cannot_replay_it',
    !completed(row.old) &&
      !completed(row.control) &&
      /requires toolCallId/.test(row.old.stderr_first) &&
      /requires toolCallId/.test(row.control.stderr_first),
    'the pre-patch bytes or the control did not fail on the tool-call identity',
  )
}

if (problems.length > 0) {
  process.stderr.write(
    `record_repair_turn: the runs do not have the shape this artifact claims: ${problems.join('; ')}\n`,
  )
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_repair_turn.mjs',
  generated_at: stamp,
  question:
    'Do the five repair rules that are still `tested` behave as claimed inside a real host turn, against the released bytes of the version before each patch?',
  probe: {
    homes: 'one isolated DSH_HOME per arm; nothing under ~/.dsh is written',
    client: 'the installed headless CLI of DSH 0.2.2-rc.3',
    neighbour: 'tests/fixtures/neighbour-bad-chunks — it yields the adapter-shaped failure chunk, and the follow-up request is an ordinary answer',
    provider: 'a local OpenAI-compatible endpoint that answers every request with one short text stream',
    arms: {
      control: 'the neighbour only: what the host does with the shape when remedy is absent',
      old: 'the published tarballs of the last release before the patch (see runs.*.old_release)',
      new: 'this tree, which is the published 0.4.19 bytes',
    },
    host: readHost(),
  },
  runs,
  claims: claimResults,
  not_proven: [
    'the failure bytes are synthesized by a neighbour plugin at the seam; the adapter that produces the measured incidents is dsh-llm-deepseek, which this harness does not drive',
    'the provider is local and synthetic: one text stream per turn, one turn per run, one tool declaration set per scenario',
    'P-0030 witnesses the closed-schema half of the patch (the fragment a closed declaration proves foreign); the per-decision counter half is unit-tested, not witnessed here',
    'P-0036 witnesses the delta-only half through a neighbour that yields deltas without an id and without a block-end; the pi-ai adapter always emits a block-end, so the host path exercised here is the assembler-from-deltas one',
    'one machine, one profile shape, Windows; the same tree was run on Linux for the build and gates, not for these turns',
  ],
  verdict: {
    p0005: 'verified — the resealed call is dispatched and answered inside a completed turn; the 0.3.0 bytes refused it',
    p0027: 'verified — the surplus fragment leaves under `remedy_unattributed` and the runtime answers UNKNOWN_TOOL, where 0.4.3 dispatched it as the stream\'s tool',
    p0030: 'verified (closed-schema half) — 0.4.5 kept the stream\'s name; this tree proves the fragment foreign',
    p0034: 'verified — the same failing turn is booked as one error, where 0.4.8 booked silence',
    p0036: 'verified — a delta-only call is dispatched and answered; 0.4.9 and the plugin-free control both fail on the identity',
  },
}

function readHost() {
  const runtime = join(
    process.env.LOCALAPPDATA ?? '',
    'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json',
  )
  if (!existsSync(runtime)) return { version: null, source: null, sha256: null }
  const parsed = JSON.parse(readFileSync(runtime, 'utf8'))
  return { version: parsed.desktopVersion ?? null, source: redactValue(runtime).value, sha256: sha256(readFileSync(runtime)) }
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out') ?? `data/results/live-repairs-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_repair_turn: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
for (const [scenario, row] of Object.entries(runs)) {
  process.stdout.write(
    `${scenario.padEnd(16)} ${row.patch}  exit ${String(row.control.exit_code)}/${String(row.old.exit_code)}/${String(row.new.exit_code)}  counters ${JSON.stringify(row.new.journal.counters)}\n`,
  )
}
