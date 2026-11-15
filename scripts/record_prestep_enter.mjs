#!/usr/bin/env node
/**
 * Record the R53 measurement of `agent/pre-step` — the one branch P-0013/P-0015
 * left open, plus the feasibility question underneath it.
 *
 * Inputs are read, never produced: four isolated runs (`.tmp/r53-home`, an own
 * DSH_HOME so nothing under `~/.dsh` is touched), the probe's own JSONL notes,
 * the session logs each run wrote, and the runtime's `runtime.json`.
 *
 * The artifact answers five questions with bytes a reader can check:
 *   1. does `{kind:'enter', messages}` carry an added message to the model?
 *      (measured: yes — the host admits it as a `user/message`, the model reads
 *      it, the turn completes, exit 0);
 *   2. does `enter` change a selection the adapter will refuse? (measured: no —
 *      `selection` is the loop's, copied over the decision, and the turn still
 *      dies with `UNSUPPORTED_REASONING_EFFORT`);
 *   3. is the adapter's own truth reachable inside the seam? (measured: yes, via
 *      `ctx.llm.resolveCallConfig`, but only with `inject: ['llm']` declared —
 *      without it Cordis answers `cannot get property "llm" without inject`);
 *   4. is `await next()` a working chain (R30 saw `next is not a function`)?
 *      (measured: yes on this build, and the host's own listener uses exactly it);
 *   5. what does a rejection do here? (measured again, unchanged from R30).
 *
 * Usage:
 *   node scripts/record_prestep_enter.mjs --stamp 2026-11-15T17:55:00.000Z \
 *     --home .tmp/r53-home \
 *     --notes .tmp/r53-probe/enter.jsonl:.tmp/r53-probe/xhigh.jsonl:.tmp/r53-probe/next.jsonl:.tmp/r53-probe/reject.jsonl
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'
import { redact, redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

const stamp = isoStamp(flag('stamp', new Date().toISOString()))
if (stamp === null) {
  process.stderr.write('record_prestep_enter: --stamp must be ISO-8601\n')
  process.exit(2)
}

const home = flag('home', '.tmp/r53-home')
if (!existsSync(abs(home))) {
  process.stderr.write(`record_prestep_enter: no such home ${home}\n`)
  process.exit(3)
}

const notesArg = flag('notes', null)
if (notesArg === null) {
  process.stderr.write('record_prestep_enter: --notes a.jsonl:b.jsonl:c.jsonl:d.jsonl is required\n')
  process.exit(2)
}
const noteFiles = notesArg.split(':')
for (const file of noteFiles) {
  if (!existsSync(file)) {
    process.stderr.write(`record_prestep_enter: missing notes ${file}\n`)
    process.exit(3)
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The installed runtime names its own version; never infer it from a path. */
function runtimeVersion() {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json'),
    join(abs(home), '..', 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
    if (typeof parsed.desktopVersion === 'string') {
      return { version: parsed.desktopVersion, source: redact(candidate).text, sha256: sha256(readFileSync(candidate)) }
    }
  }
  return { version: null, source: null, sha256: null }
}

function notes() {
  const out = []
  for (const file of noteFiles) {
    const bytes = readFileSync(file)
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue
      out.push({ ...JSON.parse(line), file: redact(file).text, file_sha256: sha256(bytes) })
    }
  }
  return out
}

/** Every session this isolated home holds, with the facts the question needs. */
function sessions() {
  const root = join(abs(home), 'sessions')
  const out = []
  if (!existsSync(root)) return out
  for (const workspace of readdirSync(root)) {
    const wsDir = join(root, workspace)
    if (!statSync(wsDir).isDirectory()) continue
    for (const entry of readdirSync(wsDir)) {
      const file = join(wsDir, entry, 'session.v4.jsonl.zstd')
      if (!existsSync(file)) continue
      const bytes = readFileSync(file)
      const text = decompressSessionLog(bytes)
      const events = []
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() === '') continue
        try {
          events.push(JSON.parse(line))
        } catch {
          events.push({ type: 'unreadable', data: null })
        }
      }
      const of = (type) => events.filter((event) => event.type === type)
      const marker = events.filter((event) => JSON.stringify(event.data ?? {}).includes('R53-PROBE-MARKER'))
      const turnEnd = of('turn/end')[0]?.data?.reason ?? null
      const userMessages = of('user/message')
      out.push({
        session: entry,
        sha256: sha256(bytes),
        events: events.length,
        turn_end: turnEnd,
        step_starts: of('step/start').length,
        step_ends: of('step/end').length,
        user_messages: userMessages.length,
        assistant_messages: of('assistant/message').length,
        // Whether the probe's own message was *admitted by the host* — the
        // difference between "the plugin returned it" and "the model saw it".
        marker_events: marker.length,
        marker_admitted: marker.some((event) => event.type === 'user/message'),
        marker_source_kind: marker
          .filter((event) => event.type === 'user/message')
          .map((event) => event.data?.source?.kind ?? null),
        assistant_text: of('assistant/message')
          .flatMap((event) => event.data?.message?.content ?? [])
          .filter((part) => part?.type === 'text')
          .map((part) => String(part.text))
          .join('\n')
          .slice(0, 400),
        assistant_reasoning: of('assistant/message')
          .flatMap((event) => event.data?.message?.content ?? [])
          .filter((part) => part?.type === 'reasoning')
          .map((part) => String(part.text))
          .join('\n')
          .slice(0, 400),
      })
    }
  }
  return out.sort((left, right) => left.session.localeCompare(right.session))
}

const version = runtimeVersion()
const journal = notes()
const runs = sessions()

const find = (mode) => journal.filter((entry) => entry.mode === mode)
const enter = find('enter').find((entry) => entry.selection.reasoningEffort === 'high')
const xhigh = find('enter').find((entry) => entry.selection.reasoningEffort === 'xhigh')
const nextRun = find('next')[0]
const rejectRun = find('reject')[0]

// The claims are checked here, so an artifact that says "enter works" cannot be
// written by a run in which it did not.
const enterSession = runs.find((run) => run.session === 'session-aa4ad9e5-d0d6-49db-ac93-fc06f49f1b85')
const xhighSession = runs.find((run) => run.session === 'session-2ca6bfba-5970-41d5-a2d8-bb16efd86688')

const problems = []
if (enter === undefined || enter.decision_kind !== 'enter') problems.push('the enter run did not return enter')
if (enter?.adapter?.ok !== true) problems.push('the adapter check did not answer ok for the accepted effort')
if (enterSession === undefined || enterSession.marker_admitted !== true) problems.push('the added message was not admitted by the host')
if (enterSession?.turn_end?.kind !== 'completed') problems.push('the enter run did not complete')
if (xhigh === undefined || xhigh.adapter?.code !== 'UNSUPPORTED_REASONING_EFFORT') {
  problems.push('the adapter check did not refuse xhigh')
}
if (xhigh?.decision_kind !== 'enter') problems.push('the xhigh run did not return enter')
if (xhighSession?.turn_end?.error?.code !== 'UNSUPPORTED_REASONING_EFFORT') {
  problems.push('the xhigh run did not end with the adapter refusal the rewrite cannot reach')
}
if (nextRun?.next_threw !== null || nextRun?.decision_kind !== 'enter') problems.push('await next() did not chain')
if (rejectRun?.decision_kind !== 'reject') problems.push('the reject control did not reject')
if (problems.length > 0) {
  process.stderr.write(`record_prestep_enter: the probe did not have the shape it claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_prestep_enter.mjs',
  generated_at: stamp,
  question:
    'P-0013/P-0015 left `agent/pre-step` unmounted because `{kind:"enter"}` was never measured. Can `enter` carry an added message to the model, and can it change a selection the adapter will refuse?',
  probe: {
    home: `${home} (isolated DSH_HOME; nothing under ~/.dsh is written)`,
    bundle: '.tmp/r53-probe — one inserted row, `r53-pre-step`, never shipped',
    profiles: {
      enter: 'r53-enter — accepted effort `high`, mode `enter`',
      xhigh: 'r53-xhigh — same profile, `reasoningEffort: xhigh` (the 37-turn shape)',
      next: 'r53-next — `await next()`, the host listener pattern',
      reject: 'r53-reject — the R30 control',
    },
    runtime: version,
    commands: [
      'DSH_HOME=<home> dsh --profile r53-enter "Reply with exactly: OK"      # exit 0',
      'DSH_HOME=<home> dsh --profile r53-xhigh "Reply with exactly: OK"      # exit 1',
      'DSH_HOME=<home> dsh --profile r53-next  "Reply with exactly: OK"      # exit 0',
      'DSH_HOME=<home> dsh --profile r53-reject "Reply with exactly: OK"     # exit 1',
    ],
    exit_codes: { enter: 0, xhigh: 1, next: 0, reject: 1 },
  },
  seam: {
    payload_keys: enter.payload_keys,
    selection_carried: enter.selection,
    next_is_a_function: enter.next_type === 'function',
    adapter_query: {
      reachable_without_inject: false,
      note: 'measured first: `dsh: UNKNOWN: cannot get property "llm" without inject`; with `export const inject = [\'llm\']` the same call answers',
      honest_answer_for_accepted_effort: enter.adapter,
      honest_answer_for_refused_effort: xhigh.adapter,
    },
  },
  runs: {
    enter: { notes: enter, session: enterSession },
    xhigh: { notes: xhigh, session: xhighSession },
    next: { notes: nextRun },
    reject: { notes: rejectRun },
  },
  findings: [
    '`{kind:"enter", messages:[...base, added]}` is admitted: the host writes the added message as a `user/message` with the probe\'s own source kind, the model reads it, the turn ends `completed`, and the CLI exits 0. The `enter` branch carries content; it is not a no-op.',
    '`enter` cannot change the selection. The loop fixes `modelSelection` before the waterfall and copies its own `selection` over the returned decision (`return {...decision, assembly, selection, toolSet}`), so a refused effort still dies in `prepareCall` with `UNSUPPORTED_REASONING_EFFORT` — measured: the marker is admitted, the turn ends `error`, exit 1.',
    'The adapter\'s own truth IS reachable from inside the seam: `ctx.llm.resolveCallConfig({provider, model, reasoningEffort})` answers `ok` for `high` and throws the host\'s own `UNSUPPORTED_REASONING_EFFORT` for `xhigh`. It requires `inject: [\'llm\']` — without it Cordis refuses the property read.',
    '`await next()` works on this build and answers `{kind:"enter"}`, exactly the pattern the host\'s own model-selection listener uses. R30\'s `next is not a function` was about `return next()` in a non-awaited shape, not about the chain being unavailable.',
    'A rejection still ends the turn as `blocked` and exits 1; R30\'s UI conclusion (the window draws it as completed) is unchanged and still disqualifies `reject` on the desktop profile.',
  ],
  decision: {
    enter_is_good_for: 'adding model-facing context, and rewriting a message the model would otherwise never see',
    enter_is_not_good_for: 'changing a selection the adapter will refuse, because the selection is the loop\'s',
    therefore:
      'P-0013\'s preflight still has no mount that changes the outcome: `reject` is disqualified on desktop, `enter` cannot move the effort, and `agent/request` throws when the effort changes after step preparation. The only honest lever left is to name the refusal where a person can act on it before the next turn.',
  },
  not_proven: [
    'One provider route (opendesign / deepseek-v4.1-flash-eco), one prompt, one turn per run; a multi-step turn and a tool-call turn were not exercised.',
    'The Electron shell itself was not driven: the probe is the headless CLI, and R30\'s web-renderer measurement still stands for the `reject` render only.',
    '`resolveCallConfig` was called once per step; a multi-step turn could call it again, and the cost of that was not measured.',
  ],
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/prestep-enter-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_prestep_enter: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
process.stdout.write(`enter: marker admitted ${enterSession.marker_admitted} · turn ${enterSession.turn_end.kind}\n`)
process.stdout.write(`xhigh: adapter ${xhigh.adapter.code} · turn ${xhighSession.turn_end.kind}/${xhighSession.turn_end.error.code}\n`)
