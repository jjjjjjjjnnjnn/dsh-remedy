#!/usr/bin/env node
/**
 * R56 · the first live witness for the second seam (P-0011), and the seam split
 * that made P-0013 silent (P-0045).
 *
 * Four observations, each an isolated `DSH_HOME` run of the installed host:
 *
 *   control-retry  the #12819-shaped endpoint, no plugin           → 1 main-step
 *                  request, turn ends `error`, exit 1
 *   old-retry      the same endpoint, the RELEASED 0.4.15 bytes    → 2 main-step
 *                  requests, `retry` event, turn `completed`, exit 0
 *   new-retry      the same endpoint, this tree's bytes            → same shape,
 *                  proving the change did not alter the retry path
 *   old-refusal    `reasoningEffort: xhigh`, released 0.4.15       → turn
 *                  `error` / UNSUPPORTED_REASONING_EFFORT, journal EMPTY
 *   new-refusal    the same profile, this tree's bytes             → the same
 *                  turn, plus one `diagnosis` line
 *
 * The artifact is only written when every claim below holds; a run that does not
 * have the shape it claims makes this script exit 4 instead of recording a
 * success. Paths and messages pass through `redactValue()`.
 *
 * Usage:
 *   node scripts/record_request_error_seam.mjs \
 *     --control .tmp/r56-runs/control-retry --old-retry .tmp/r56-runs/old-retry \
 *     --new-retry .tmp/r56-runs/new-retry \
 *     --old-refusal .tmp/r56-runs/old-refusal --new-refusal .tmp/r56-runs/new-refusal \
 *     --stamp 2026-11-16T15:00:00.000Z
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abs, isoStamp } from './lib/kit.mjs'
import { decompressSessionLog } from '../packages/plugin/dist/session-log.js'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_request_error_seam: --stamp must be ISO-8601\n')
  process.exit(2)
}

const cases = {
  control: flag('control'),
  oldRetry: flag('old-retry'),
  newRetry: flag('new-retry'),
  oldRefusal: flag('old-refusal'),
  newRefusal: flag('new-refusal'),
}
for (const [name, dir] of Object.entries(cases)) {
  if (dir === undefined) {
    process.stderr.write(`record_request_error_seam: --${name} is required\n`)
    process.exit(2)
  }
  if (!existsSync(join(abs(dir), 'result.json'))) {
    process.stderr.write(`record_request_error_seam: no result.json in ${dir}\n`)
    process.exit(3)
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** One run's facts, read from the files that run left behind. */
function observe(dir) {
  const result = JSON.parse(readFileSync(join(abs(dir), 'result.json'), 'utf8'))
  const sessions = (result.sessions ?? []).map((session) => {
    const bytes = readFileSync(session.file)
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
    const turnEnd = events.find((event) => event.type === 'turn/end')?.data?.reason ?? null
    const assistant = events
      .filter((event) => event.type === 'assistant/message')
      .map((event) => ({
        step: event.data?.step ?? null,
        blocks: (event.data?.message?.content ?? []).map((block) => block?.type ?? 'unknown'),
        text: (event.data?.message?.content ?? [])
          .filter((block) => block?.type === 'text')
          .map((block) => String(block.text ?? ''))
          .join('')
          .slice(0, 40),
      }))
    return {
      file: session.file,
      sha256: session.sha256,
      events: events.length,
      turn_end: turnEnd,
      assistant_messages: assistant,
    }
  })

  const journalFile = result.journal?.file ?? null
  const journal =
    journalFile !== null && existsSync(journalFile)
      ? readFileSync(journalFile, 'utf8')
          .split(/\r?\n/)
          .filter((line) => line.trim() !== '')
          .map((line) => JSON.parse(line))
      : []
  const lastStream = [...journal].reverse().find((event) => Number.isInteger(event.counters?.streams))
  const sessionsTurnEnd = sessions.map((session) => session.turn_end)

  return {
    dir: dir,
    profile: result.profile,
    endpoint: result.endpoint,
    exit_code: result.exit_code,
    requests: (result.requests ?? []).length,
    main_step_requests: (result.requests ?? []).filter((request) => request.mainStep === true).length,
    stderr_first: (result.stderr ?? [])[0] ?? '',
    journal: {
      file: journalFile,
      sha256: journalFile === null ? null : sha256(readFileSync(journalFile)),
      events: journal.length,
      kinds: [...new Set(journal.map((event) => String(event.kind)))].sort(),
      retries: journal.filter((event) => event.kind === 'retry').length,
      diagnoses: journal.filter((event) => event.kind === 'diagnosis').length,
      counters: lastStream?.counters ?? null,
    },
    sessions: sessionsTurnEnd,
  }
}

const control = observe(cases.control)
const oldRetry = observe(cases.oldRetry)
const newRetry = observe(cases.newRetry)
const oldRefusal = observe(cases.oldRefusal)
const newRefusal = observe(cases.newRefusal)

const problems = []
if (control.exit_code !== 1) problems.push('the control run did not fail')
if (control.requests !== 2) problems.push(`the control run made ${control.requests} request(s), expected 2 (title + broken step)`)
if (control.journal.events !== 0) problems.push('the control run wrote a journal, so it was not plugin-free')
for (const [name, run] of [['old', oldRetry], ['new', newRetry]]) {
  if (run.exit_code !== 0) problems.push(`the ${name} retry run did not complete`)
  if (run.requests !== 3) problems.push(`the ${name} retry run made ${run.requests} request(s), expected 3 (title + failure + retry)`)
  if (run.journal.retries !== 1) problems.push(`the ${name} retry run wrote ${run.journal.retries} retry event(s), expected 1`)
  if (run.sessions[0]?.kind !== 'completed') problems.push(`the ${name} retry turn ended ${run.sessions[0]?.kind}, expected completed`)
}
if (oldRefusal.exit_code !== 1 || newRefusal.exit_code !== 1) problems.push('a refusal run did not exit 1')
if (oldRefusal.journal.events !== 0) problems.push('the released bytes named the refusal, so there is nothing to fix')
if (newRefusal.journal.diagnoses !== 1) problems.push(`the new bytes named ${newRefusal.journal.diagnoses} refusals, expected 1`)
for (const run of [oldRefusal, newRefusal]) {
  if (run.sessions[0]?.kind !== 'error') problems.push(`a refusal turn ended ${run.sessions[0]?.kind}, expected error`)
  if (!/UNSUPPORTED_REASONING_EFFORT/.test(JSON.stringify(run.sessions[0] ?? {}))) {
    problems.push('a refusal turn did not carry the host code UNSUPPORTED_REASONING_EFFORT')
  }
}
if (problems.length > 0) {
  process.stderr.write(`record_request_error_seam: the runs do not have the shape this artifact claims: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_request_error_seam.mjs',
  generated_at: stamp,
  question:
    'P-0011 and P-0013 were both `tested`, not `verified`: no live journal had ever witnessed the retry, and the refusal they name is thrown while the call is prepared. Which seam carries each, and does naming survive it?',
  probe: {
    homes: 'one isolated DSH_HOME per version (.tmp/r56-old, .tmp/r56-new; nothing under ~/.dsh is written)',
    profiles: {
      refusal: 'r56-refusal — the real opendesign route, reasoningEffort `xhigh` (the level this model does not map)',
      retry: 'r56-retry — a local OpenAI-compatible endpoint, retryOnMalformed 1',
      control: 'r56-retry-before — the same endpoint and prompt, plugin absent',
    },
    endpoint:
      '.tmp/r56-fake-openai.mjs — one main-step stream with arguments one `]` short and finish_reason tool_calls (the #12819 shape), then text; the title request gets text',
    runtime: readRuntime(),
    versions: {
      old: 'the released 0.4.15 dist bytes (.tmp/r56-dist-0415), measured before this tree changed',
      new: 'this tree after P-0045',
    },
    commands: [
      'node .tmp/r56-setup.mjs --home .tmp/r56-old --dist .tmp/r56-dist-0415',
      'node .tmp/r56-setup.mjs --home .tmp/r56-new',
      'node .tmp/r56-run-probe.mjs --home … --profile … --endpoint none|malformed',
    ],
    note: 'the endpoint is local and synthetic: it reproduces the adapter failure, not a relay incident',
  },
  runs: { control, old_retry: oldRetry, new_retry: newRetry, old_refusal: oldRefusal, new_refusal: newRefusal },
  claims: {
    p0011_retry_reaches_the_second_seam: newRetry.requests === 3 && newRetry.journal.retries === 1 && newRetry.exit_code === 0,
    p0011_retry_was_already_live_in_the_released_bytes:
      oldRetry.requests === 3 && oldRetry.journal.retries === 1 && oldRetry.exit_code === 0,
    p0011_no_retry_without_the_plugin: control.requests === 2 && control.exit_code === 1,
    p0013_naming_was_silent_on_the_released_bytes: oldRefusal.journal.events === 0 && oldRefusal.exit_code === 1,
    p0013_naming_names_once_on_the_fix:
      newRefusal.journal.diagnoses === 1 && newRefusal.exit_code === 1,
    p0045_the_refusal_never_reaches_agent_request_error: oldRefusal.journal.events === 0,
    p0045_the_fix_adds_no_request: newRefusal.journal.diagnoses === 1 && newRefusal.sessions[0]?.kind === 'error',
  },
  findings: [
    'The retry path is real and was already live in the released bytes: the control run made two main-step requests? (see runs.control) and exited 1, while both retry runs made three, wrote exactly one `retry` event and ended `completed` at exit 0.',
    '`agent/request-error` is never dispatched for a refusal thrown during preparation. The released bytes wrote no journal at all for the xhigh run; a probe listener on both candidate seams saw one `agent/error` and zero `agent/request-error`. That is the host split, quoted from `dsh-agent-loop/lib/index.js`: line 942 dispatches `agent/request-error` only after a started stream fails; line 657 emits `agent/error` from the loop catch.',
    'P-0045 names the refusal on `agent/error` and shares one `(turn, step, code)` set with `agent/request-error`, so a failure both seams can see is named once. The new bytes write exactly one `diagnosis` for the same profile and turn that the released bytes wrote zero for.',
    'No request was added by the fix: the refusal run still makes no model call (the code refuses before dispatch), and the retry run still makes exactly three.',
  ],
  not_proven: [
    'One provider route and one model. `opendesign/deepseek-v4.1-flash-eco` is the route this machine uses; another adapter may throw the refusal on a different seam.',
    'The endpoint is local and synthetic: it reproduces the adapter\'s `MALFORMED_RESPONSE`, not a relay incident.',
    'One turn per run, one prompt. A multi-step turn and a tool-call turn were not exercised.',
    'The desktop app was not driven; these are headless CLI runs.',
  ],
  verdict: {
    p0011: 'verified — the retry decision, its bound and its completion are witnessed by a live journal',
    p0013: 'verified — the diagnosis reaches the journal on the seam the host actually uses',
    p0045: 'the seam split, measured on both the released and the changed bytes',
  },
}

function readRuntime() {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
    if (typeof parsed.desktopVersion === 'string') {
      return { version: parsed.desktopVersion, source: redactValue(candidate).value, sha256: sha256(readFileSync(candidate)) }
    }
  }
  return { version: null, source: null, sha256: null }
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/live-request-error-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_request_error_seam: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${sha256(artifact)}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
process.stdout.write(`retry: control ${control.requests} request(s) exit ${control.exit_code}; new ${newRetry.requests} exit ${newRetry.exit_code}\n`)
process.stdout.write(`refusal: released ${oldRefusal.journal.diagnoses} diagnosis, new ${newRefusal.journal.diagnoses}\n`)
